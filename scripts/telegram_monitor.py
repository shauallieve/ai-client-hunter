"""Limited Telegram public job-post search for AI Client Hunter.

Uses Telegram's official user-client API via Telethon. This is NOT a Bot API scraper,
does not join chats, bypass permissions, search private chats, or send DMs.
Only public, recent, relevant job postings are submitted to the web app.
Respect Telegram API terms and community rules.
"""
import asyncio
import base64
import binascii
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from telethon import TelegramClient, types
from telethon.errors import FloodWaitError, RPCError
from telethon.sessions import StringSession

PUBLIC_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{4,31}$")
def suitable(text: str, search: dict) -> bool:
    content = text.lower()
    include = search["includeAny"]
    intent = search["intentAny"]
    exclude = search["excludeAny"]
    return (
        len(text) >= search["minChars"]
        and (not include or any(word.lower() in content for word in include))
        and (not intent or any(word.lower() in content for word in intent))
        and not any(word.lower() in content for word in exclude)
    )


def fetch_search_config(config: dict) -> dict:
    """Read the current criteria from Cloudflare before every scheduled scan."""
    request = Request(
        config["endpoint"] + "/api/telegram/search-config",
        headers={"Accept": "application/json",
                 "User-Agent": "AIClientHunter/1.2 public-job-search"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.load(response)
    except HTTPError as error:
        raise RuntimeError(
            f"Search settings API returned HTTP {error.code}. "
            "Publish the latest Cloudflare Worker from GitHub before running the search."
        ) from None
    except (URLError, ValueError) as error:
        raise RuntimeError("Could not load search settings from Cloudflare") from error
    criteria = result.get("config")
    required = ("queries","includeAny","intentAny","excludeAny",
                "maxAgeHours","minChars","perQuery","maxLeads")
    if not isinstance(criteria, dict) or any(k not in criteria for k in required):
        raise RuntimeError("Cloudflare returned invalid search configuration")
    if not isinstance(criteria["queries"], list) or not criteria["queries"]:
        raise RuntimeError("Search configuration contains no queries")
    print(
        f"Search settings loaded: {len(criteria['queries'])} queries, "
        f"up to {criteria['perQuery']} results each, {criteria['maxAgeHours']}h age limit, "
        f"min {criteria['minChars']} characters.",
        flush=True
    )
    return criteria


def validate_telegram_session(value: str) -> str:
    """Validate Telethon v1 StringSession shape without printing its contents."""
    session = value.strip()
    if not session or not session.startswith("1"):
        raise ValueError(
            "TELEGRAM_SESSION is missing or not a Telethon StringSession. "
            "Copy ONLY the entire contents of .telegram_session.txt into GitHub Actions secret TELEGRAM_SESSION."
        )
    encoded = session[1:]
    try:
        decoded = base64.b64decode(
            encoded.encode("ascii"), altchars=b"-_", validate=True
        )
    except (ValueError, UnicodeEncodeError, binascii.Error) as error:
        raise ValueError(
            "TELEGRAM_SESSION has invalid characters or was truncated. "
            "Copy the entire .telegram_session.txt content again into GitHub Actions Secrets."
        ) from error
    if len(decoded) not in (263, 275):
        raise ValueError(
            "TELEGRAM_SESSION has an incorrect encoded length. "
            "This is usually caused by copying an incomplete or wrong value. "
            "Copy the entire .telegram_session.txt into the GitHub secret without quotes or extra text."
        )
    return session


def validate_config() -> dict:
    keys = (
        "TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION",
        "TELEGRAM_IMPORT_TOKEN", "AI_CLIENT_HUNTER_URL",
    )
    missing = [key for key in keys if not os.getenv(key)]
    if missing:
        raise ValueError("Missing GitHub Actions secrets/variables: " + ", ".join(missing))
    endpoint = os.environ["AI_CLIENT_HUNTER_URL"].rstrip("/")
    if not endpoint.startswith("https://"):
        raise ValueError("AI_CLIENT_HUNTER_URL must be HTTPS")
    return {"api_id": int(os.environ["TELEGRAM_API_ID"]),
            "api_hash": os.environ["TELEGRAM_API_HASH"],
            "session": validate_telegram_session(os.environ["TELEGRAM_SESSION"]),
            "token": os.environ["TELEGRAM_IMPORT_TOKEN"], "endpoint": endpoint}


async def collect(config: dict, search: dict) -> list[dict]:
    unique = {}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=search['maxAgeHours'])
    async with TelegramClient(StringSession(config["session"]),
                              config["api_id"], config["api_hash"],
                              flood_sleep_threshold=20) as client:
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session is no longer authorized")
        for query in search['queries']:
            matched = 0
            examined = 0
            recent = 0
            task_like = 0
            public_source = 0
            try:
                async for message in client.iter_messages(None, search=query,
                                                         limit=search['perQuery']):
                    examined += 1
                    if not message or not message.date or message.date < cutoff:
                        continue
                    recent += 1
                    text = (message.raw_text or "").strip()[:1500]
                    if not suitable(text, search) or message.fwd_from:
                        continue
                    task_like += 1
                    chat = await message.get_chat()
                    if not isinstance(chat, types.Channel):
                        continue
                    username = getattr(chat, "username", None)
                    if not username or not PUBLIC_NAME.fullmatch(username):
                        continue
                    public_source += 1
                    url = f"https://t.me/{username}/{message.id}"
                    if url in unique:
                        continue
                    contact = None
                    try:
                        sender = await message.get_sender()
                        author = getattr(sender, "username", None)
                        if author and PUBLIC_NAME.fullmatch(author):
                            contact = author
                    except RPCError:
                        pass
                    unique[url] = {
                        "url": url,
                        "description": text,
                        "sourceChat": str(getattr(chat, "title", username))[:90],
                        "published": message.date.astimezone(timezone.utc).isoformat(),
                        "contactUsername": contact,
                    }
                    matched += 1
                    if len(unique) >= search['maxLeads']:
                        break
            except FloodWaitError as error:
                print(f"Rate limited by Telegram (wait {error.seconds}s); ending this run.")
                break
            except RPCError as error:
                print(f"Search skipped due to Telegram API error {type(error).__name__}.")
            print(
                f"Query {query!r}: results={examined}, recent={recent}, "
                f"job-like={task_like}, public-source={public_source}, selected={matched}"
            )
            if len(unique) >= search['maxLeads']:
                break
            await asyncio.sleep(2)
    return list(unique.values())


def submit(config: dict, leads: list[dict]) -> None:
    if not leads:
        print("No relevant public job posts found this run; reporting completed search.")
    payload = json.dumps({"leads": leads}, ensure_ascii=False).encode("utf-8")
    request = Request(
        config["endpoint"] + "/api/telegram/import",
        data=payload,
        method="POST",
        headers={
            "Authorization": "Bearer " + config["token"],
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "AIClientHunter/1.1 public-jobs-import",
        },
    )
    try:
        with urlopen(request, timeout=25) as response:
            answer = json.load(response)
        if not answer.get("ok"):
            raise RuntimeError("Cloudflare did not acknowledge import")
        print(f"Submitted: {answer.get('saved', 0)}; rejected: {answer.get('rejected', 0)}.")
    except HTTPError as error:
        content_type = error.headers.get("content-type", "unknown").split(";")[0]
        challenge = error.headers.get("cf-mitigated") == "challenge"
        ray = error.headers.get("cf-ray", "not provided")
        # Never print request authorization, response HTML or secrets.
        details = f"HTTP {error.code}, content-type={content_type}, cf-ray={ray}"
        if error.code == 403:
            explanation = (
                "Cloudflare blocked the import request before the Worker API. "
                "Check Security Events / WAF for the request path /api/telegram/import and cf-ray. "
                "If the Worker was not deployed, deploy the latest main branch."
            )
            if challenge:
                explanation += " Cloudflare indicated a bot challenge."
        elif error.code == 401:
            explanation = (
                "The Telegram import key does not match. Set identical "
                "TELEGRAM_IMPORT_TOKEN values in Cloudflare Worker runtime Secrets "
                "and GitHub Actions repository Secrets."
            )
        elif error.code == 503:
            explanation = (
                "Telegram import is not configured or its storage is unavailable in Cloudflare."
            )
        else:
            explanation = "Inspect the deployed Worker API and Cloudflare logs."
        raise RuntimeError(f"Cloudflare import failed: {details}. {explanation}") from None
    except URLError as error:
        raise RuntimeError("Cloudflare import endpoint unreachable") from error


async def main() -> None:
    config = validate_config()
    search = fetch_search_config(config)
    posts = await collect(config, search)
    submit(config, posts)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print("Telegram job monitor stopped: " + type(error).__name__ + ": " +
              str(error)[:180], file=sys.stderr)
        sys.exit(1)

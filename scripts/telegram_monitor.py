"""Limited Telegram public job-post search for AI Client Hunter.

Uses Telegram's official user-client API via Telethon. This is NOT a Bot API scraper,
does not join chats, bypass permissions, search private chats, or send DMs.
Only public, recent, relevant job postings are submitted to the web app.
Respect Telegram API terms and community rules.
"""
import asyncio
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
QUERIES = (
    "нужен разработчик",
    "ищем программиста",
    "сделать сайт",
    "нужен телеграм бот",
    "разработать бота",
)
SERVICES = (
    "сайт", "лендинг", "бота", "ботов", "бот для", "чат-бот", "telegram", "телеграм", "crm",
    "автоматизац", "веб-приложен", "разработчик", "программист",
    "парсер", "api", "интеграц",
)
INTENT = (
    "нужен", "нужна", "нужно", "ищем", "ищу", "требуется",
    "сделать", "разработать", "создать", "заказать", "кто сможет",
    "кто сделает", "помогите",
)
EXCLUDE = ("ищу работу", "ищу заказ", "предлагаю услуги", "делаю сайты на заказ")
LIMIT_PER_QUERY = 18
LIMIT_PER_RUN = 25
MAX_AGE_HOURS = 36


def suitable(text: str) -> bool:
    content = text.lower()
    return (
        len(content) >= 35
        and any(word in content for word in SERVICES)
        and any(word in content for word in INTENT)
        and not any(word in content for word in EXCLUDE)
    )


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
            "session": os.environ["TELEGRAM_SESSION"],
            "token": os.environ["TELEGRAM_IMPORT_TOKEN"], "endpoint": endpoint}


async def collect(config: dict) -> list[dict]:
    unique = {}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_AGE_HOURS)
    async with TelegramClient(StringSession(config["session"]),
                              config["api_id"], config["api_hash"],
                              flood_sleep_threshold=20) as client:
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session is no longer authorized")
        for query in QUERIES:
            matched = 0
            try:
                async for message in client.iter_messages(None, search=query,
                                                         limit=LIMIT_PER_QUERY):
                    if not message or not message.date or message.date < cutoff:
                        continue
                    text = (message.raw_text or "").strip()[:1500]
                    if not suitable(text) or message.fwd_from:
                        continue
                    chat = await message.get_chat()
                    if not isinstance(chat, types.Channel):
                        continue
                    username = getattr(chat, "username", None)
                    if not username or not PUBLIC_NAME.fullmatch(username):
                        continue
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
                    if len(unique) >= LIMIT_PER_RUN:
                        break
            except FloodWaitError as error:
                print(f"Rate limited by Telegram (wait {error.seconds}s); ending this run.")
                break
            except RPCError as error:
                print(f"Search skipped due to Telegram API error {type(error).__name__}.")
            print(f"Query processed: {query!r}; relevant public posts: {matched}")
            if len(unique) >= LIMIT_PER_RUN:
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
        },
    )
    try:
        with urlopen(request, timeout=25) as response:
            answer = json.load(response)
        if not answer.get("ok"):
            raise RuntimeError("Cloudflare did not acknowledge import")
        print(f"Submitted: {answer.get('saved', 0)}; rejected: {answer.get('rejected', 0)}.")
    except HTTPError as error:
        raise RuntimeError(f"Cloudflare import failed: HTTP {error.code}") from None
    except URLError as error:
        raise RuntimeError("Cloudflare import endpoint unreachable") from error


async def main() -> None:
    config = validate_config()
    posts = await collect(config)
    submit(config, posts)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print("Telegram job monitor stopped: " + type(error).__name__ + ": " +
              str(error)[:180], file=sys.stderr)
        sys.exit(1)

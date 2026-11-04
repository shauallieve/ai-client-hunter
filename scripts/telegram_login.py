"""One-time interactive login for a Telegram API user session.

Run locally only. This creates .telegram_session.txt, which is gitignored.
Copy its contents to the GitHub Actions secret TELEGRAM_SESSION.
Never send the contents to another person or commit them.
"""
from getpass import getpass
from pathlib import Path

from telethon.sync import TelegramClient
from telethon.sessions import StringSession


def main() -> None:
    print("Get API ID and API hash at https://my.telegram.org/apps")
    api_id = int(input("Telegram API ID: ").strip())
    api_hash = getpass("Telegram API hash (hidden): ").strip()
    if not api_hash:
        raise ValueError("API hash is required")
    print("Only authorize your own account. Telegram may send a login code or ask for 2FA.")
    with TelegramClient(StringSession(), api_id, api_hash) as client:
        session = client.session.save()
    output = Path(".telegram_session.txt")
    output.write_text(session, encoding="utf-8")
    try:
        output.chmod(0o600)
    except OSError:
        pass
    print("Session generated locally: .telegram_session.txt")
    print("Copy it into GitHub Actions secret TELEGRAM_SESSION and delete local file afterward.")
    print("Anyone with this session can access your Telegram account. Do not share it.")


if __name__ == "__main__":
    main()

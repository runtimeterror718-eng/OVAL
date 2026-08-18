"""
One-time interactive Telegram login for the OVAL scraper.

Telethon authenticates as a real Telegram *user* account via MTProto. Telegram
sends a one-time code to your phone/Telegram app, which must be typed here — so
this step is interactive and can only be run by you. After a successful login,
Telethon writes a reusable session file (named by TELEGRAM_SESSION_NAME) and the
scraper never needs the code again.

Prereqs (already set in secrets/.env.keys):
  TELEGRAM_API_ID, TELEGRAM_API_HASH   — from https://my.telegram.org
  TELEGRAM_PHONE                       — your number in +CC format, e.g. +9198XXXXXXXX

Run (interactive terminal, NOT via an agent):
  python3.11 scripts/telegram_login.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_ROOT, ".env"), override=True)
load_dotenv(os.path.join(_ROOT, "secrets", ".env.keys"), override=True)

from config.settings import (  # noqa: E402
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
    TELEGRAM_PHONE,
    TELEGRAM_SESSION_NAME,
)


def main() -> None:
    missing = [
        name for name, val in [
            ("TELEGRAM_API_ID", TELEGRAM_API_ID),
            ("TELEGRAM_API_HASH", TELEGRAM_API_HASH),
            ("TELEGRAM_PHONE", TELEGRAM_PHONE),
        ] if not val
    ]
    if missing:
        print(f"ERROR: missing {', '.join(missing)} in secrets/.env.keys")
        print("Add them, then re-run. TELEGRAM_PHONE must be +CC format, e.g. +919812345678")
        sys.exit(1)

    from telethon.sync import TelegramClient

    print("=" * 56)
    print("  Telegram login (one-time)")
    print(f"  session file: {TELEGRAM_SESSION_NAME}.session")
    print(f"  phone:        {TELEGRAM_PHONE}")
    print("=" * 56)
    print("Telegram will send a login code to your app/SMS — type it when asked.\n")

    # TelegramClient as a context manager runs .start() which handles the
    # interactive code prompt (and 2FA password prompt if your account has one).
    with TelegramClient(TELEGRAM_SESSION_NAME, int(TELEGRAM_API_ID), TELEGRAM_API_HASH) as client:
        client.start(phone=TELEGRAM_PHONE)
        me = client.get_me()
        handle = getattr(me, "username", None) or getattr(me, "first_name", "user")
        print("\n" + "=" * 56)
        print(f"  ✅ Logged in as: {handle} (id={me.id})")
        print(f"  Session saved → {TELEGRAM_SESSION_NAME}.session")
        print("  You can now run the Telegram fetch. Tell the agent 'done'.")
        print("=" * 56)


if __name__ == "__main__":
    main()

"""
Push the current Play Store briefing into Slack.

Reads the trigger token from oval/.env.local, then calls the local Next.js route
that composes and posts the Slack message. Can run one-shot or on a loop.

Usage:
    python3 scripts/push_playstore_slack_summary.py
    python3 scripts/push_playstore_slack_summary.py --loop 3600
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "oval" / ".env.local"
DEFAULT_URL = "http://127.0.0.1:3000/api/playstore/slack-summary"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def push_once(url: str, trigger_token: str | None) -> dict:
    headers = {"Content-Type": "application/json"}
    if trigger_token:
        headers["Authorization"] = f"Bearer {trigger_token}"
    response = requests.post(url, headers=headers, json={}, timeout=60)
    response.raise_for_status()
    payload = response.json()
    print(json.dumps(payload, indent=2))
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", type=int, default=0, help="push continuously every N seconds")
    parser.add_argument("--url", default=DEFAULT_URL, help="target slack summary route")
    args = parser.parse_args()

    env = load_env(ENV_PATH)
    trigger_token = env.get("PLAYSTORE_SLACK_TRIGGER_TOKEN")

    if args.loop > 0:
        interval = max(300, args.loop)
        print(f"[slack-push] pushing every {interval}s — Ctrl+C to stop")
        while True:
            try:
                push_once(args.url, trigger_token)
            except Exception as err:  # noqa: BLE001
                print(f"[slack-push] ERROR {err}")
            time.sleep(interval)
    else:
        push_once(args.url, trigger_token)


if __name__ == "__main__":
    main()

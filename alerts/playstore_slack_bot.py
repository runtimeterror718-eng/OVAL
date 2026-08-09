"""
Play Store → Slack bot for the CPO.

Reads the same live reviews file the dashboard uses
(oval/src/data/playstore-live-reviews.json, written by scripts/pull_playstore_reviews.py),
computes reputation metrics, and DMs the CPO via the Slack Web API (chat.postMessage).

Two modes:
  --mode digest   One-shot daily summary (rating, volume, top complaints, reply rate).
  --mode alert    Real-time check: fires only if avg rating drops or 1★ reviews spike
                  vs. the last alert run. State persisted in playstore-bot-state.json.

Config (secrets/.env.keys):
  SLACK_BOT_TOKEN     xoxb-... (bot token with chat:write + im:write)
  SLACK_CPO_USER_ID   Uxxxxxxxx (the CPO's Slack member ID)

Usage:
  python -m alerts.playstore_slack_bot --mode digest
  python -m alerts.playstore_slack_bot --mode alert
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from config.settings import SLACK_BOT_TOKEN, SLACK_CPO_USER_ID

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
LIVE_PATH = REPO_ROOT / "oval" / "src" / "data" / "playstore-live-reviews.json"
STATE_PATH = REPO_ROOT / "oval" / "src" / "data" / "playstore-bot-state.json"
PACKAGE = "xyz.penpencil.physicswala"
SLACK_POST_URL = "https://slack.com/api/chat.postMessage"

# Alert thresholds
RATING_DROP_THRESHOLD = 0.15           # avg rating drop (24h vs prior) that triggers an alert
NEGATIVE_SPIKE_THRESHOLD = 10          # # of new 1-2★ reviews in 24h that triggers an alert


# ---------------------------------------------------------------------------
# Data loading + metrics
# ---------------------------------------------------------------------------

def _load_reviews() -> list[dict]:
    if not LIVE_PATH.exists():
        logger.warning("Reviews file not found at %s", LIVE_PATH)
        return []
    try:
        store = json.loads(LIVE_PATH.read_text())
    except json.JSONDecodeError:
        logger.warning("Reviews file is not valid JSON")
        return []
    return list((store.get("reviews") or {}).values())


def _parse_date(d: Any) -> datetime | None:
    if not d:
        return None
    try:
        return datetime.fromisoformat(str(d).replace("Z", "+00:00"))
    except ValueError:
        return None


def compute_metrics(reviews: list[dict]) -> dict[str, Any]:
    """Reputation snapshot — overall + last-24h window."""
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)
    two_days_ago = now - timedelta(days=2)

    rated = [r for r in reviews if isinstance(r.get("rating"), int)]
    total = len(rated)
    avg_all = round(sum(r["rating"] for r in rated) / total, 2) if total else 0.0

    dist = {s: sum(1 for r in rated if r["rating"] == s) for s in range(1, 6)}

    last_24h, prev_24h = [], []
    for r in rated:
        dt = _parse_date(r.get("date"))
        if not dt:
            continue
        if dt >= day_ago:
            last_24h.append(r)
        elif dt >= two_days_ago:
            prev_24h.append(r)

    avg_24h = round(sum(r["rating"] for r in last_24h) / len(last_24h), 2) if last_24h else 0.0
    avg_prev = round(sum(r["rating"] for r in prev_24h) / len(prev_24h), 2) if prev_24h else 0.0

    negative_24h = [r for r in last_24h if r["rating"] <= 2]
    replied = sum(1 for r in rated if r.get("replied"))
    reply_rate = round(100 * replied / total, 1) if total else 0.0

    # Top recent negative review snippets (with text)
    top_negative = sorted(
        [r for r in negative_24h if (r.get("text") or "").strip()],
        key=lambda r: (r["rating"], -(r.get("thumbsUpCount") or 0)),
    )[:5]

    return {
        "total": total,
        "avg_all": avg_all,
        "dist": dist,
        "new_24h": len(last_24h),
        "avg_24h": avg_24h,
        "avg_prev_24h": avg_prev,
        "rating_delta_24h": round(avg_24h - avg_prev, 2) if (last_24h and prev_24h) else 0.0,
        "negative_24h": len(negative_24h),
        "reply_rate": reply_rate,
        "top_negative": top_negative,
        "generated_at": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Slack delivery
# ---------------------------------------------------------------------------

async def _dm_cpo(blocks: list[dict], fallback_text: str) -> bool:
    if not SLACK_BOT_TOKEN or not SLACK_CPO_USER_ID:
        logger.warning("SLACK_BOT_TOKEN / SLACK_CPO_USER_ID not configured — cannot DM CPO")
        return False
    payload = {"channel": SLACK_CPO_USER_ID, "text": fallback_text, "blocks": blocks}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                SLACK_POST_URL, json=payload,
                headers={"Authorization": f"Bearer {SLACK_BOT_TOKEN}"}, timeout=15,
            )
            data = resp.json()
            if not data.get("ok"):
                logger.error("Slack API error: %s", data.get("error"))
                return False
            logger.info("Slack DM sent to CPO (%s)", SLACK_CPO_USER_ID)
            return True
    except Exception:
        logger.exception("Failed to send Slack DM")
        return False


def _stars(n: int) -> str:
    return "★" * n + "☆" * (5 - n)


def _trend(delta: float) -> str:
    if delta > 0.02:
        return f"📈 +{delta}"
    if delta < -0.02:
        return f"📉 {delta}"
    return "➡️ flat"


# Complaint themes → (label, keywords) for surfacing what's driving negatives.
_THEMES = [
    ("Refund / payment / fraud", ["refund", "fraud", "money", "scam", "cheat", "paid", "payment", "rupees", "₹", "books not"]),
    ("Schedule / batch changes", ["schedule", "timing", "class per day", "batch", "changed", "cancelled", "holiday"]),
    ("Teacher / faculty changes", ["teacher", "faculty", "sir", "mam", "ma'am", "replaced", "bring back", "left"]),
    ("App bugs / performance", ["crash", "bug", "buffer", "lag", "hang", "not working", "error", "slow", "login"]),
    ("Support non-response", ["support", "no response", "no reply", "not responding", "ignored", "helpline"]),
]


def build_briefing(m: dict[str, Any]) -> str:
    """One-paragraph leadership read of the day, derived from live metrics + complaint themes."""
    delta = m["rating_delta_24h"]
    if m["avg_24h"] and m["avg_24h"] >= m["avg_all"] and delta >= 0:
        health = f"Health is *good and improving* — the 24h average ({m['avg_24h']}★) is above the all-time {m['avg_all']}★ and trending up ({_trend(delta)})."
    elif delta <= -0.1:
        health = f"Health is *slipping* — 24h average ({m['avg_24h']}★) is down {delta} vs the prior day."
    else:
        health = f"Health is *steady* — 24h average {m['avg_24h']}★ vs all-time {m['avg_all']}★."

    # Detect dominant themes among today's negative reviews.
    neg_text = " ".join((r.get("text") or "").lower() for r in m.get("top_negative", []))
    hot = [label for label, kws in _THEMES if any(k in neg_text for k in kws)]
    one_star_pct = round(100 * m["dist"][1] / m["total"], 1) if m["total"] else 0

    if hot:
        theme_line = f"Today's negatives cluster around *{hot[0].lower()}*" + (f" and *{hot[1].lower()}*" if len(hot) > 1 else "") + "."
    else:
        theme_line = "No single complaint theme dominates today's negatives."

    watch = (
        f"Watch-item: {m['dist'][1]} one-star reviews overall ({one_star_pct}% of all), "
        f"{m['negative_24h']} new in the last 24h."
    )
    return f"{health} Volume is healthy at ~{m['new_24h']} reviews/day with a {m['reply_rate']}% dev reply rate. {theme_line} {watch}"


def build_digest_blocks(m: dict[str, Any]) -> list[dict]:
    today = datetime.now(timezone.utc).strftime("%d %b %Y")
    dist_line = " · ".join(f"{s}★ {m['dist'][s]}" for s in range(5, 0, -1))

    blocks: list[dict] = [
        {"type": "header", "text": {"type": "plain_text", "text": f"📱 Play Store Daily Digest — {today}"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"📋 *Briefing*\n{build_briefing(m)}"}},
        {"type": "divider"},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Avg rating (all):*\n{m['avg_all']} {_stars(round(m['avg_all']))}"},
            {"type": "mrkdwn", "text": f"*Last 24h avg:*\n{m['avg_24h']}  {_trend(m['rating_delta_24h'])}"},
            {"type": "mrkdwn", "text": f"*New reviews (24h):*\n{m['new_24h']}"},
            {"type": "mrkdwn", "text": f"*Negative (1-2★, 24h):*\n{m['negative_24h']}"},
            {"type": "mrkdwn", "text": f"*Total reviews:*\n{m['total']:,}"},
            {"type": "mrkdwn", "text": f"*Dev reply rate:*\n{m['reply_rate']}%"},
        ]},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": f"*Distribution:* {dist_line}"}]},
    ]

    if m["top_negative"]:
        lines = []
        for r in m["top_negative"]:
            txt = (r.get("text") or "").replace("\n", " ").strip()[:160]
            ver = f" · v{r['version']}" if r.get("version") else ""
            lines.append(f"{_stars(r['rating'])}{ver}\n_{txt}_")
        blocks.append({"type": "divider"})
        blocks.append({"type": "section", "text": {"type": "mrkdwn",
            "text": "*Top recent complaints:*\n\n" + "\n\n".join(lines)}})

    blocks.append({"type": "context", "elements": [{"type": "mrkdwn",
        "text": f"OVAL · {PACKAGE} · <https://oval.run/playstore|Open dashboard>"}]})
    return blocks


def build_alert_blocks(reason: str, m: dict[str, Any]) -> list[dict]:
    return [
        {"type": "header", "text": {"type": "plain_text", "text": "🚨 Play Store Alert"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*{reason}*"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*24h avg:*\n{m['avg_24h']} (Δ {m['rating_delta_24h']})"},
            {"type": "mrkdwn", "text": f"*New 1-2★ (24h):*\n{m['negative_24h']}"},
            {"type": "mrkdwn", "text": f"*New reviews (24h):*\n{m['new_24h']}"},
            {"type": "mrkdwn", "text": f"*Avg (all):*\n{m['avg_all']}"},
        ]},
        {"type": "context", "elements": [{"type": "mrkdwn",
            "text": f"OVAL · <https://oval.run/playstore|Investigate on dashboard>"}]},
    ]


# ---------------------------------------------------------------------------
# State (for de-duping alerts)
# ---------------------------------------------------------------------------

def _load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=1))


# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------

async def run_digest() -> bool:
    m = compute_metrics(_load_reviews())
    if not m["total"]:
        logger.warning("No reviews to summarize")
        return False
    ok = await _dm_cpo(build_digest_blocks(m),
                       f"Play Store daily digest — avg {m['avg_all']}, {m['new_24h']} new in 24h")
    return ok


async def run_alert() -> bool:
    m = compute_metrics(_load_reviews())
    if not m["total"]:
        return False

    reasons = []
    if m["new_24h"] and m["rating_delta_24h"] <= -RATING_DROP_THRESHOLD:
        reasons.append(f"24h avg rating dropped {m['rating_delta_24h']} (now {m['avg_24h']})")
    if m["negative_24h"] >= NEGATIVE_SPIKE_THRESHOLD:
        reasons.append(f"{m['negative_24h']} new 1-2★ reviews in the last 24h")

    if not reasons:
        logger.info("No alert conditions met (24h avg %s, neg %s)", m["avg_24h"], m["negative_24h"])
        return False

    # De-dupe: don't re-fire the same reason within 6 hours.
    state = _load_state()
    now = datetime.now(timezone.utc)
    key = " | ".join(reasons)
    last = state.get("last_alert", {})
    if last.get("key") == key:
        last_at = _parse_date(last.get("at"))
        if last_at and (now - last_at) < timedelta(hours=6):
            logger.info("Same alert fired <6h ago, skipping")
            return False

    ok = await _dm_cpo(build_alert_blocks(key, m), f"Play Store alert: {key}")
    if ok:
        state["last_alert"] = {"key": key, "at": now.isoformat()}
        _save_state(state)
    return ok


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description="Play Store → Slack bot for the CPO")
    parser.add_argument("--mode", choices=["digest", "alert"], required=True)
    parser.add_argument("--dry-run", action="store_true", help="Print blocks instead of sending")
    args = parser.parse_args()

    import asyncio

    if args.dry_run:
        m = compute_metrics(_load_reviews())
        blocks = build_digest_blocks(m) if args.mode == "digest" else build_alert_blocks("DRY RUN", m)
        print(json.dumps({"metrics": {k: v for k, v in m.items() if k != "top_negative"},
                          "blocks": blocks}, indent=2, default=str))
        return

    ok = asyncio.run(run_digest() if args.mode == "digest" else run_alert())
    print(f"[{args.mode}] {'sent' if ok else 'not sent'}")


if __name__ == "__main__":
    main()

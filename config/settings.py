"""
Application settings loaded from environment variables.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

_project_root = Path(__file__).resolve().parent.parent

# Layer 1: Application config (tuning params, service URLs, defaults)
load_dotenv(_project_root / ".env")
# Layer 2: Secrets (API keys, credentials) — always overrides config
load_dotenv(_project_root / "secrets" / ".env.keys", override=True)
# Layer 3: Legacy .env.local support (if still present)
load_dotenv(_project_root / ".env.local", override=True)
# Layer 4: Next.js local secrets, reused by explicit Python sync jobs only.
# Existing process or root secret values remain authoritative.
load_dotenv(_project_root / "oval" / ".env.local", override=False)


def _first_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.environ.get(name)
        if value is None:
            continue
        stripped = value.strip()
        if stripped:
            return stripped
    return default


def _env_int(*names: str, default: int) -> int:
    value = _first_env(*names, default=str(default))
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _env_bool(*names: str, default: bool = False) -> bool:
    value = _first_env(*names, default="true" if default else "false")
    return value.strip().lower() in {"1", "true", "yes", "on"}


# --- Supabase ---
SUPABASE_PROJECT_REF: str = _first_env(
    "SUPABASE_PROJECT_REF",
    "SECRET_SUPABASE_PROJECT_REF",
)
SUPABASE_URL: str = _first_env(
    "SUPABASE_URL",
    "SECRET_SUPABASE_URL",
)
if not SUPABASE_URL and SUPABASE_PROJECT_REF:
    SUPABASE_URL = f"https://{SUPABASE_PROJECT_REF}.supabase.co"
SUPABASE_KEY: str = _first_env(
    "SUPABASE_KEY",
    "SECRET_SUPABASE_KEY",
    "SECRET_SUPABASE_ANON_KEY",
)
SUPABASE_SERVICE_KEY: str = _first_env(
    "SUPABASE_SERVICE_KEY",
    "SECRET_SUPABASE_SERVICE_KEY",
)

# --- LLM ---
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL: str = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

# --- Qdrant ---
QDRANT_URL: str = _first_env("QDRANT_URL", "SECRET_QDRANT_URL")
QDRANT_API_KEY: str = _first_env("QDRANT_API_KEY", "SECRET_QDRANT_API_KEY")
QDRANT_COLLECTION: str = _first_env(
    "QDRANT_COLLECTION",
    default="oval_channel_mentions_v1",
)
QDRANT_EMBEDDING_MODEL: str = _first_env(
    "QDRANT_EMBEDDING_MODEL",
    default="text-embedding-3-small",
)

# --- Telegram ---
TELEGRAM_API_ID: str = os.environ.get("TELEGRAM_API_ID", "")
TELEGRAM_API_HASH: str = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_PHONE: str = os.environ.get("TELEGRAM_PHONE", "")
TELEGRAM_SESSION_NAME: str = _first_env(
    "TELEGRAM_SESSION_NAME",
    default="brand_tool_session",
)
TELEGRAM_DISCOVERY_MAX_RESULTS_PER_KEYWORD: int = _env_int(
    "TELEGRAM_DISCOVERY_MAX_RESULTS_PER_KEYWORD",
    default=10,
)
TELEGRAM_CLASSIFICATION_SAMPLE_MESSAGES: int = _env_int(
    "TELEGRAM_CLASSIFICATION_SAMPLE_MESSAGES",
    default=5,
)
TELEGRAM_MESSAGE_BACKFILL_LIMIT: int = _env_int(
    "TELEGRAM_MESSAGE_BACKFILL_LIMIT",
    default=80,
)
TELEGRAM_MESSAGE_INCREMENTAL_LIMIT: int = _env_int(
    "TELEGRAM_MESSAGE_INCREMENTAL_LIMIT",
    default=120,
)
TELEGRAM_MESSAGE_FETCH_BATCH_SIZE: int = _env_int(
    "TELEGRAM_MESSAGE_FETCH_BATCH_SIZE",
    default=10,
)
TELEGRAM_MESSAGE_FETCH_HISTORICAL_MONTHS: int = _env_int(
    "TELEGRAM_MESSAGE_FETCH_HISTORICAL_MONTHS",
    default=6,
)
TELEGRAM_MESSAGE_FETCH_DAILY_LOOKBACK_DAYS: int = _env_int(
    "TELEGRAM_MESSAGE_FETCH_DAILY_LOOKBACK_DAYS",
    default=1,
)
TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MIN_SECONDS: int = _env_int(
    "TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MIN_SECONDS",
    default=1,
)
TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MAX_SECONDS: int = _env_int(
    "TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MAX_SECONDS",
    default=3,
)
TELEGRAM_MESSAGE_FETCH_CHANNEL_SLEEP_SECONDS: int = _env_int(
    "TELEGRAM_MESSAGE_FETCH_CHANNEL_SLEEP_SECONDS",
    default=5,
)
TELEGRAM_MESSAGE_MEDIA_MAX_BYTES: int = _env_int(
    "TELEGRAM_MESSAGE_MEDIA_MAX_BYTES",
    default=8_388_608,
)
TELEGRAM_MESSAGE_ANALYSIS_HISTORICAL_BATCH_SIZE: int = _env_int(
    "TELEGRAM_MESSAGE_ANALYSIS_HISTORICAL_BATCH_SIZE",
    default=20,
)
TELEGRAM_MESSAGE_ANALYSIS_DAILY_BATCH_SIZE: int = _env_int(
    "TELEGRAM_MESSAGE_ANALYSIS_DAILY_BATCH_SIZE",
    default=15,
)
TELEGRAM_MESSAGE_ANALYSIS_DAILY_LOOKBACK_HOURS: int = _env_int(
    "TELEGRAM_MESSAGE_ANALYSIS_DAILY_LOOKBACK_HOURS",
    default=36,
)
TELEGRAM_MESSAGE_ANALYSIS_LIMIT_CHANNELS: int = _env_int(
    "TELEGRAM_MESSAGE_ANALYSIS_LIMIT_CHANNELS",
    default=200,
)
TELEGRAM_MESSAGE_ANALYSIS_MAX_MESSAGES_PER_CHANNEL: int = _env_int(
    "TELEGRAM_MESSAGE_ANALYSIS_MAX_MESSAGES_PER_CHANNEL",
    default=2000,
)
TELEGRAM_PIPELINE_PAGE_SIZE: int = _env_int(
    "TELEGRAM_PIPELINE_PAGE_SIZE",
    default=25,
)
TELEGRAM_ACTIVITY_LOOKBACK_DAYS: int = _env_int(
    "TELEGRAM_ACTIVITY_LOOKBACK_DAYS",
    default=7,
)
TELEGRAM_ACTIVITY_COUNT_SCAN_LIMIT: int = _env_int(
    "TELEGRAM_ACTIVITY_COUNT_SCAN_LIMIT",
    default=5000,
)

# --- Twitter / X ---
X_BEARER_TOKEN: str = _first_env("X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN")
TWITTER_USERNAME: str = os.environ.get("TWITTER_USERNAME", "")
TWITTER_PASSWORD: str = os.environ.get("TWITTER_PASSWORD", "")

# --- Reddit ---
REDDIT_CLIENT_ID: str = os.environ.get("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET: str = os.environ.get("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT: str = os.environ.get("REDDIT_USER_AGENT", "brand-tool/1.0")

# --- YouTube (Unofficial Pipeline) ---
YOUTUBE_API_KEY: str = _first_env(
    "YOUTUBE_API_KEY",
    "SECRET_YOUTUBE_API",
    "SECRET_YOUTUBE_API_KEY",
)
YOUTUBE_UNOFFICIAL_MAX_RESULTS_PER_KEYWORD: int = _env_int(
    "YOUTUBE_UNOFFICIAL_MAX_RESULTS_PER_KEYWORD",
    default=25,
)
YOUTUBE_UNOFFICIAL_PUBLISHED_AFTER_DAYS: int = _env_int(
    "YOUTUBE_UNOFFICIAL_PUBLISHED_AFTER_DAYS",
    default=30,
)
YOUTUBE_UNOFFICIAL_MAX_COMMENTS_PER_FLAGGED_VIDEO: int = _env_int(
    "YOUTUBE_UNOFFICIAL_MAX_COMMENTS_PER_FLAGGED_VIDEO",
    default=200,
)
YOUTUBE_TRANSCRIPT_APIFY_KEY: str = _first_env(
    "YOUTUBE_TRANSCRIPT_APIFY_KEY",
    "SECRET_YOUTUBE_TRANSCRIPT_APIFY_KEY",
)
YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID: str = _first_env(
    "YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID",
    default="1s7eXiaukVuOr4Ueg",
)
YOUTUBE_TRANSCRIPT_APIFY_PROXY_GROUP: str = _first_env(
    "YOUTUBE_TRANSCRIPT_APIFY_PROXY_GROUP",
    default="BUYPROXIES94952",
)
YOUTUBE_TRANSCRIPT_APIFY_MAX_RETRIES: int = _env_int(
    "YOUTUBE_TRANSCRIPT_APIFY_MAX_RETRIES",
    default=8,
)

# --- Azure OpenAI (Phase scaffold) ---
AZURE_OPENAI_API_KEY: str = _first_env(
    "AZURE_OPENAI_API_KEY",
    "SECRET_AZURE_API_KEY",
    "SECRET_AZURE_OPENAI_API_KEY",
)
AZURE_OPENAI_ENDPOINT: str = _first_env(
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_ENDPOINT",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_RESOURCE_ENDPOINT",
    "SECRET_AZURE_OPENAI_ENDPOINT",
    "SECRET_AZURE_ENDPOINT",
)
AZURE_OPENAI_API_VERSION: str = _first_env(
    "AZURE_OPENAI_API_VERSION",
    "AZURE_API_VERSION",
    "SECRET_AZURE_OPENAI_API_VERSION",
    default="2024-12-01-preview",
)
_AZURE_OPENAI_DEPLOYMENT_DEFAULT: str = _first_env(
    "AZURE_OPENAI_DEPLOYMENT",
    "AZURE_OPENAI_CHAT_DEPLOYMENT",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
    "AZURE_DEPLOYMENT_NAME",
    "SECRET_AZURE_OPENAI_DEPLOYMENT",
    "SECRET_AZURE_OPENAI_DEPLOYMENT_NAME",
    default="gpt-5.4-marketing-southcentralus",
)
AZURE_OPENAI_DEPLOYMENT_GPT52: str = _first_env(
    "AZURE_OPENAI_DEPLOYMENT_GPT52",
    "SECRET_AZURE_OPENAI_DEPLOYMENT_GPT52",
    default=_AZURE_OPENAI_DEPLOYMENT_DEFAULT,
)
AZURE_OPENAI_DEPLOYMENT_GPT53: str = _first_env(
    "AZURE_OPENAI_DEPLOYMENT_GPT53",
    "SECRET_AZURE_OPENAI_DEPLOYMENT_GPT53",
    default=AZURE_OPENAI_DEPLOYMENT_GPT52 or _AZURE_OPENAI_DEPLOYMENT_DEFAULT,
)
AZURE_OPENAI_DEPLOYMENT_GPT54: str = _first_env(
    "AZURE_OPENAI_DEPLOYMENT_GPT54",
    "SECRET_AZURE_OPENAI_DEPLOYMENT_GPT54",
    default=AZURE_OPENAI_DEPLOYMENT_GPT53 or AZURE_OPENAI_DEPLOYMENT_GPT52,
)
AZURE_OPENAI_BATCH_ENABLED: bool = _env_bool(
    "AZURE_OPENAI_BATCH_ENABLED",
    default=False,
)
AZURE_OPENAI_BATCH_INPUT_DIR: str = _first_env(
    "AZURE_OPENAI_BATCH_INPUT_DIR",
    default="/tmp/azure_openai_batch/input",
)
AZURE_OPENAI_BATCH_OUTPUT_DIR: str = _first_env(
    "AZURE_OPENAI_BATCH_OUTPUT_DIR",
    default="/tmp/azure_openai_batch/output",
)
AZURE_OPENAI_BATCH_POLL_INTERVAL_SECONDS: int = _env_int(
    "AZURE_OPENAI_BATCH_POLL_INTERVAL_SECONDS",
    default=15,
)
AZURE_OPENAI_BATCH_POLL_TIMEOUT_SECONDS: int = _env_int(
    "AZURE_OPENAI_BATCH_POLL_TIMEOUT_SECONDS",
    default=300,
)

if not AZURE_OPENAI_ENDPOINT:
    AZURE_OPENAI_ENDPOINT = ""

# --- Whisper Remote Proxy ---
WHISPER_API_KEY: str = _first_env(
    "WHISPER_API_KEY",
    "SECRET_WHISPER_API_KEY",
)
WHISPER_PROXY_SUBMIT_URL: str = _first_env(
    "WHISPER_PROXY_SUBMIT_URL",
    default=(
        "https://whisper-v3-scaling-enabled-proxy.yotta-infrastructure.on-prem."
        "clusters.s9t.link/submit"
    ),
)
WHISPER_PROXY_RESULT_URL: str = _first_env(
    "WHISPER_PROXY_RESULT_URL",
    default=(
        "https://whisper-v3-scaling-enabled-proxy.yotta-infrastructure.on-prem."
        "clusters.s9t.link/task-result"
    ),
)
WHISPER_PROXY_WORKFLOW_NAME: str = _first_env(
    "WHISPER_PROXY_WORKFLOW_NAME",
    default="whisper-v3-scaling-enabled-4d5cb715-dc2f-414d-9464-dd7be51c266f",
)
WHISPER_PROXY_LANGUAGE: str = _first_env(
    "WHISPER_PROXY_LANGUAGE",
    default="hi",
)
WHISPER_PROXY_POLL_INTERVAL_SECONDS: int = _env_int(
    "WHISPER_PROXY_POLL_INTERVAL_SECONDS",
    default=5,
)
WHISPER_PROXY_POLL_TIMEOUT_SECONDS: int = _env_int(
    "WHISPER_PROXY_POLL_TIMEOUT_SECONDS",
    default=300,
)

# --- Proxies ---
PROXY_URL: str = os.environ.get("PROXY_URL", "")

# --- Alerts ---
SLACK_WEBHOOK_URL: str = os.environ.get("SLACK_WEBHOOK_URL", "")
# Slack bot (for DMing the CPO Play Store digests/alerts via chat.postMessage)
SLACK_BOT_TOKEN: str = os.environ.get("SLACK_BOT_TOKEN", "")
SLACK_CPO_USER_ID: str = os.environ.get("SLACK_CPO_USER_ID", "")
EMAIL_SMTP_HOST: str = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
EMAIL_SMTP_PORT: int = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
EMAIL_USERNAME: str = os.environ.get("EMAIL_USERNAME", "")
EMAIL_PASSWORD: str = os.environ.get("EMAIL_PASSWORD", "")
EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "")
EMAIL_RECIPIENTS: list[str] = [
    e.strip()
    for e in os.environ.get("EMAIL_RECIPIENTS", "").split(",")
    if e.strip()
]

# --- Redis ---
REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# --- Brands ---
MONITORED_BRANDS: list[str] = [
    b.strip()
    for b in os.environ.get("MONITORED_BRANDS", "").split(",")
    if b.strip()
]

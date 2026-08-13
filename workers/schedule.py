"""
Celery Beat schedule — which scraper runs when.

How it works:
  Celery Beat reads this schedule and pushes tasks into the Redis queue
  at the specified intervals. Celery Workers then pick up and execute them.

  ┌──────────────┐     ┌───────┐     ┌──────────────┐     ┌──────────┐
  │ Celery Beat   │────▶│ Redis │────▶│ Celery Worker│────▶│ Supabase │
  │ (scheduler)   │     │(queue)│     │ (executor)   │     │ (storage)│
  └──────────────┘     └───────┘     └──────────────┘     └──────────┘
"""

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    "run-gati-wide-discovery-every-6h": {
        "task": "workers.tasks.run_gati_scheduled_discovery",
        "schedule": crontab(minute=10, hour="*/6"),
        "kwargs": {"max_results": 50},
    },
    "process-shield-crawl-queue-every-minute": {
        "task": "workers.tasks.process_shield_crawl_queue",
        "schedule": crontab(minute="*"),
        "kwargs": {"max_jobs": 5},
    },
    # --- Dedicated platform pipelines (Instagram + Reddit) ---
    "scrape-instagram-every-6h": {
        "task": "workers.tasks.scrape_instagram",
        "schedule": crontab(minute=30, hour="*/6"),
    },
    "scrape-reddit-every-4h": {
        "task": "workers.tasks.scrape_reddit",
        "schedule": crontab(minute=0, hour="*/4"),
    },

    # --- Other platforms (generic path until dedicated pipelines built) ---
    "scrape-youtube-every-6h": {
        "task": "workers.tasks.scrape_platform",
        "schedule": crontab(minute=0, hour="*/6"),
        "args": ("youtube",),
    },
    "scrape-twitter-every-2h": {
        "task": "workers.tasks.scrape_platform",
        "schedule": crontab(minute=0, hour="*/2"),
        "args": ("twitter",),
    },
    "scrape-seo-news-every-3h": {
        "task": "workers.tasks.scrape_platform",
        "schedule": crontab(minute=0, hour="*/3"),
        "args": ("seo_news",),
    },
    "scrape-telegram-every-1h": {
        "task": "workers.tasks.scrape_platform",
        "schedule": crontab(minute=15),
        "args": ("telegram",),
    },

    # --- Analysis + Alerts ---
    "run-analysis-daily": {
        "task": "workers.tasks.run_full_analysis",
        "schedule": crontab(minute=0, hour=2),  # 2 AM daily
    },
    "check-alerts-every-30m": {
        "task": "workers.tasks.check_alerts",
        "schedule": crontab(minute="*/30"),
    },
    "weekly-email-report": {
        "task": "workers.tasks.send_weekly_report",
        "schedule": crontab(minute=0, hour=9, day_of_week=1),  # Monday 9 AM
    },
}

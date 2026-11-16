from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "openchat",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.sla_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "check-all-conversations-sla": {
            "task": "app.tasks.sla_tasks.check_all_conversations_sla",
            "schedule": 60.0,  # every 60 seconds
        },
    },
)
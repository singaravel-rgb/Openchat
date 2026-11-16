from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.sla_service import check_all_conversations_sla


@celery_app.task(name="app.tasks.sla_tasks.check_all_conversations_sla")
def check_all_conversations_sla():
    """Periodic task: check SLA for all conversations and record breaches."""
    db = SessionLocal()
    try:
        breach_count = check_all_conversations_sla(db)
        return {"breach_count": breach_count}
    finally:
        db.close()
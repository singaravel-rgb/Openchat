from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.agent import router as agent_router
from app.api.v1.admin import router as admin_router
from app.api.v1.admin_knowledge import router as admin_knowledge_router
from app.api.v1.admin_ai import router as admin_ai_router
from app.api.v1.admin_settings import router as admin_settings_router
from app.api.v1.admin_users import router as admin_users_router
from app.api.v1.customer_knowledge import router as customer_knowledge_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.sla import router as sla_router
from app.api.v1.reports import router as reports_router
from app.api.v1.widget import router as widget_router
from app.api.v1.admin_widget import router as admin_widget_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.canned_responses import router as canned_responses_router
from app.api.v1.custom_fields import router as custom_fields_router
from app.api.v1.teams import router as teams_router
from app.api.v1.business_hours import router as business_hours_router
from app.api.v1.bot_flows import router as bot_flows_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.automation_rules import router as automation_rules_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.admin_integrations import router as admin_integrations_router
from app.api.v1.tags import router as tags_router


api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(conversations_router)
api_router.include_router(agent_router)
api_router.include_router(admin_router)
api_router.include_router(admin_knowledge_router)
api_router.include_router(admin_ai_router)
api_router.include_router(admin_settings_router)
api_router.include_router(admin_users_router)
api_router.include_router(customer_knowledge_router)
api_router.include_router(notifications_router)
api_router.include_router(sla_router)
api_router.include_router(reports_router)
api_router.include_router(widget_router)
api_router.include_router(admin_widget_router)
api_router.include_router(attachments_router)
api_router.include_router(canned_responses_router)
api_router.include_router(custom_fields_router)
api_router.include_router(teams_router)
api_router.include_router(business_hours_router)
api_router.include_router(bot_flows_router)
api_router.include_router(webhooks_router)
api_router.include_router(automation_rules_router)
api_router.include_router(campaigns_router)
api_router.include_router(admin_integrations_router)
api_router.include_router(tags_router)

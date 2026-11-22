from datetime import datetime, timedelta
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ReportFilters(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    agent_id: Optional[int] = None
    status: Optional[str] = None
    channel: Optional[str] = None


class ConversationMetrics(BaseModel):
    total_conversations: int
    ai_handling: int
    pending: int
    assigned: int
    resolved: int
    closed: int
    avg_response_time_minutes: Optional[float] = None
    avg_resolution_time_minutes: Optional[float] = None
    sla_response_met_pct: Optional[float] = None
    sla_resolution_met_pct: Optional[float] = None


class AgentPerformance(BaseModel):
    agent_id: int
    agent_name: str
    conversations_handled: int
    conversations_resolved: int
    avg_response_time_minutes: Optional[float] = None
    avg_resolution_time_minutes: Optional[float] = None
    sla_response_met_pct: Optional[float] = None
    sla_resolution_met_pct: Optional[float] = None
    current_active: int


class TimeSeriesPoint(BaseModel):
    date: str
    value: int


class TimeSeriesData(BaseModel):
    series: list[TimeSeriesPoint]


class KnowledgeBaseMetrics(BaseModel):
    total_articles: int
    published_articles: int
    total_faqs: int
    published_faqs: int
    total_views: int
    helpful_rating_pct: Optional[float] = None


class ExportRequest(BaseModel):
    report_type: str = "conversations"  # conversations, agents, knowledge, sla
    format: str = "csv"  # csv, xlsx, excel, json
    fields: Optional[list[str]] = None
    filters: Optional[ReportFilters] = None


class ExportResponse(BaseModel):
    download_url: str
    expires_at: datetime
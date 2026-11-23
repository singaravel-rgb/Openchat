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
    assigned_count: Optional[int] = None
    resolved_count: Optional[int] = None
    avg_response_time_minutes: Optional[float] = None
    first_response_avg_minutes: Optional[float] = None
    avg_resolution_time_minutes: Optional[float] = None
    avg_resolution_hours: Optional[float] = None
    sla_response_met_pct: Optional[float] = None
    sla_resolution_met_pct: Optional[float] = None
    csat_avg: Optional[float] = None
    current_active: int


class TimeSeriesPoint(BaseModel):
    date: str
    value: int
    created: Optional[int] = 0
    resolved: Optional[int] = 0
    avg_resolution_hours: Optional[float] = None


class TimeSeriesData(BaseModel):
    series: list[TimeSeriesPoint]


class KBArticleItem(BaseModel):
    id: int
    title: str
    views: int = 0


class KBFAQItem(BaseModel):
    id: int
    question: str
    views: int = 0


class KBArticlesSection(BaseModel):
    total: int = 0
    published: int = 0
    draft: int = 0
    archived: int = 0
    total_views: int = 0


class KBFAQsSection(BaseModel):
    total: int = 0
    published: int = 0
    total_views: int = 0


class KnowledgeBaseMetrics(BaseModel):
    total_articles: int
    published_articles: int
    total_faqs: int
    published_faqs: int
    total_views: int
    helpful_rating_pct: Optional[float] = None
    articles: Optional[KBArticlesSection] = None
    faqs: Optional[KBFAQsSection] = None
    top_articles: list[KBArticleItem] = []
    top_faqs: list[KBFAQItem] = []


class ExportRequest(BaseModel):
    report_type: str = "conversations"  # conversations, agents, knowledge, sla
    format: str = "csv"  # csv, xlsx, excel, json
    fields: Optional[list[str]] = None
    filters: Optional[ReportFilters] = None


class ExportResponse(BaseModel):
    download_url: str
    expires_at: datetime
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.user import User
from app.schemas.report import (
    ConversationMetrics, AgentPerformance, TimeSeriesData, KnowledgeBaseMetrics,
    ReportFilters, ExportRequest
)
from app.services.report_service import (
    get_conversation_metrics, get_agent_performance, get_time_series,
    get_knowledge_base_metrics, export_report
)

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])


def require_admin(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


@router.get("/overview", response_model=ConversationMetrics)
def get_overview(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    agent_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get overall conversation metrics."""
    metrics = get_conversation_metrics(db, start_date, end_date, agent_id, status)
    return ConversationMetrics(**metrics)


@router.get("/agents", response_model=list[AgentPerformance])
def get_agents_performance(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get performance metrics for all agents."""
    agents = get_agent_performance(db, start_date, end_date)
    return [AgentPerformance(**a) for a in agents]


@router.get("/time-series", response_model=TimeSeriesData)
def get_time_series_data(
    metric: str = Query("conversations_created", description="Metric: conversations_created, conversations_resolved, messages"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    interval: str = Query("day", description="Interval: day, hour"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get time series data for charting."""
    series = get_time_series(db, metric, start_date, end_date, interval)
    return TimeSeriesData(series=series)


@router.get("/knowledge", response_model=KnowledgeBaseMetrics)
def get_knowledge_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get knowledge base metrics."""
    metrics = get_knowledge_base_metrics(db)
    return KnowledgeBaseMetrics(**metrics)


@router.post("/export")
def export_report_endpoint(
    request: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Export report to CSV, XLSX, or JSON."""
    try:
        content, filename, media_type = export_report(
            db,
            request.report_type,
            request.format,
            request.filters.start_date if request.filters else None,
            request.filters.end_date if request.filters else None,
            request.filters.agent_id if request.filters else None,
            fields=request.fields,
            user_role=current_user.role,
        )
        
        bio = io.BytesIO(content) if isinstance(content, bytes) else io.BytesIO(content.encode("utf-8"))
        return StreamingResponse(
            bio,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/export/conversations")
def export_conversations(
    format: str = Query("csv", pattern="^(csv|xlsx|excel|json)$"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    agent_id: Optional[int] = Query(None),
    fields: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Quick export conversations (GET endpoint for direct links)."""
    selected_fields = [f.strip() for f in fields.split(",") if f.strip()] if fields else None
    content, filename, media_type = export_report(
        db, "conversations", format, start_date, end_date, agent_id, fields=selected_fields, user_role=current_user.role
    )
    
    bio = io.BytesIO(content) if isinstance(content, bytes) else io.BytesIO(content.encode("utf-8"))
    return StreamingResponse(
        bio,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/agents")
def export_agents(
    format: str = Query("csv", pattern="^(csv|xlsx|excel|json)$"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Quick export agents performance."""
    content, filename, media_type = export_report(db, "agents", format, start_date, end_date, user_role=current_user.role)
    
    bio = io.BytesIO(content) if isinstance(content, bytes) else io.BytesIO(content.encode("utf-8"))
    return StreamingResponse(
        bio,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/knowledge")
def export_knowledge(
    format: str = Query("csv", pattern="^(csv|xlsx|excel|json)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Quick export knowledge base metrics."""
    content, filename, media_type = export_report(db, "knowledge", format, user_role=current_user.role)
    
    bio = io.BytesIO(content) if isinstance(content, bytes) else io.BytesIO(content.encode("utf-8"))
    return StreamingResponse(
        bio,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/sla")
def export_sla(
    format: str = Query("csv", pattern="^(csv|xlsx|excel|json)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Quick export SLA report."""
    content, filename, media_type = export_report(db, "sla", format, user_role=current_user.role)
    
    bio = io.BytesIO(content) if isinstance(content, bytes) else io.BytesIO(content.encode("utf-8"))
    return StreamingResponse(
        bio,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
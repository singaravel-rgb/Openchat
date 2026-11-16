from datetime import datetime, timedelta
from typing import Optional
import csv
import io
import json

from sqlalchemy import func, and_, or_, case
from sqlalchemy.orm import Session

from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.knowledge import Article, FAQ, Category
from app.models.user import User
from app.models.agent_profile import AgentProfile
from app.services.sla_service import get_sla_status


def get_conversation_metrics(
    db: Session,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    agent_id: Optional[int] = None,
    status: Optional[str] = None,
) -> dict:
    """Get overall conversation metrics."""
    query = db.query(Conversation)
    
    if start_date:
        query = query.filter(Conversation.created_at >= start_date)
    if end_date:
        query = query.filter(Conversation.created_at <= end_date)
    if agent_id:
        query = query.filter(Conversation.assigned_agent_id == agent_id)
    if status:
        query = query.filter(Conversation.status == status)
    
    conversations = query.all()
    
    # Status counts
    status_counts = {}
    for conv in conversations:
        status_counts[conv.status] = status_counts.get(conv.status, 0) + 1
    
    # Calculate average response time (first agent response after customer message)
    response_times = []
    resolution_times = []
    sla_response_met = 0
    sla_response_total = 0
    sla_resolution_met = 0
    sla_resolution_total = 0
    
    for conv in conversations:
        sla = get_sla_status(conv)
        
        if conv.first_response_at and conv.created_at:
            response_min = (conv.first_response_at - conv.created_at).total_seconds() / 60
            if response_min >= 0:
                response_times.append(response_min)
        
        if conv.resolved_at and conv.created_at:
            resolution_min = (conv.resolved_at - conv.created_at).total_seconds() / 60
            if resolution_min >= 0:
                resolution_times.append(resolution_min)
        
        if sla.get("response_status") in ["met", "breached"]:
            sla_response_total += 1
            if sla.get("response_status") == "met":
                sla_response_met += 1
        
        if sla.get("resolution_status") in ["met", "breached"]:
            sla_resolution_total += 1
            if sla.get("resolution_status") == "met":
                sla_resolution_met += 1
    
    return {
        "total_conversations": len(conversations),
        "ai_handling": status_counts.get("ai_handling", 0),
        "pending": status_counts.get("pending", 0),
        "assigned": status_counts.get("assigned", 0),
        "resolved": status_counts.get("resolved", 0),
        "closed": status_counts.get("closed", 0),
        "avg_response_time_minutes": sum(response_times) / len(response_times) if response_times else None,
        "avg_resolution_time_minutes": sum(resolution_times) / len(resolution_times) if resolution_times else None,
        "sla_response_met_pct": (sla_response_met / sla_response_total * 100) if sla_response_total > 0 else None,
        "sla_resolution_met_pct": (sla_resolution_met / sla_resolution_total * 100) if sla_resolution_total > 0 else None,
    }


def get_agent_performance(
    db: Session,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[dict]:
    """Get performance metrics per agent."""
    agents = db.query(User).filter(User.role == "agent", User.is_active == True).all()
    
    results = []
    for agent in agents:
        query = db.query(Conversation).filter(
            Conversation.assigned_agent_id == agent.id,
            Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED])
        )
        
        if start_date:
            query = query.filter(Conversation.resolved_at >= start_date)
        if end_date:
            query = query.filter(Conversation.resolved_at <= end_date)
        
        conversations = query.all()
        
        response_times = []
        resolution_times = []
        sla_response_met = 0
        sla_response_total = 0
        sla_resolution_met = 0
        sla_resolution_total = 0
        
        for conv in conversations:
            sla = get_sla_status(conv)
            
            if conv.first_response_at and conv.created_at:
                response_min = (conv.first_response_at - conv.created_at).total_seconds() / 60
                if response_min >= 0:
                    response_times.append(response_min)
            
            if conv.resolved_at and conv.created_at:
                resolution_min = (conv.resolved_at - conv.created_at).total_seconds() / 60
                if resolution_min >= 0:
                    resolution_times.append(resolution_min)
            
            if sla.get("response_status") in ["met", "breached"]:
                sla_response_total += 1
                if sla.get("response_status") == "met":
                    sla_response_met += 1
            
            if sla.get("resolution_status") in ["met", "breached"]:
                sla_resolution_total += 1
                if sla.get("resolution_status") == "met":
                    sla_resolution_met += 1
        
        # Current active conversations
        active_count = db.query(Conversation).filter(
            Conversation.assigned_agent_id == agent.id,
            Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
        ).count()
        
        results.append({
            "agent_id": agent.id,
            "agent_name": agent.full_name,
            "conversations_handled": len(conversations),
            "conversations_resolved": len([c for c in conversations if c.status == ConversationStatus.RESOLVED]),
            "avg_response_time_minutes": sum(response_times) / len(response_times) if response_times else None,
            "avg_resolution_time_minutes": sum(resolution_times) / len(resolution_times) if resolution_times else None,
            "sla_response_met_pct": (sla_response_met / sla_response_total * 100) if sla_response_total > 0 else None,
            "sla_resolution_met_pct": (sla_resolution_met / sla_resolution_total * 100) if sla_resolution_total > 0 else None,
            "current_active": active_count,
        })
    
    return results


def get_time_series(
    db: Session,
    metric: str,  # conversations_created, conversations_resolved, messages
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    interval: str = "day",  # day, hour
) -> list[dict]:
    """Get time series data for charting."""
    if not start_date:
        start_date = datetime.utcnow() - timedelta(days=30)
    if not end_date:
        end_date = datetime.utcnow()
    
    # Generate date range
    dates = []
    current = start_date
    while current <= end_date:
        dates.append(current)
        if interval == "day":
            current += timedelta(days=1)
        else:
            current += timedelta(hours=1)
    
    # For simplicity, query by day
    if metric == "conversations_created":
        query = db.query(
            func.date(Conversation.created_at).label("date"),
            func.count(Conversation.id).label("count")
        ).filter(
            Conversation.created_at >= start_date,
            Conversation.created_at <= end_date,
        ).group_by(func.date(Conversation.created_at))
    elif metric == "conversations_resolved":
        query = db.query(
            func.date(Conversation.resolved_at).label("date"),
            func.count(Conversation.id).label("count")
        ).filter(
            Conversation.resolved_at >= start_date,
            Conversation.resolved_at <= end_date,
        ).group_by(func.date(Conversation.resolved_at))
    elif metric == "messages":
        query = db.query(
            func.date(Message.created_at).label("date"),
            func.count(Message.id).label("count")
        ).filter(
            Message.created_at >= start_date,
            Message.created_at <= end_date,
        ).group_by(func.date(Message.created_at))
    else:
        return []
    
    results = {str(r.date): r.count for r in query.all()}
    
    series = []
    for d in dates:
        date_str = d.strftime("%Y-%m-%d")
        series.append({"date": date_str, "value": results.get(date_str, 0)})
    
    return series


def get_knowledge_base_metrics(db: Session) -> dict:
    """Get knowledge base metrics."""
    total_articles = db.query(Article).count()
    published_articles = db.query(Article).filter(Article.status == "published").count()
    total_faqs = db.query(FAQ).count()
    published_faqs = db.query(FAQ).filter(FAQ.is_published == True).count()
    
    total_views = db.query(func.coalesce(func.sum(Article.view_count), 0)).scalar() or 0
    total_views += db.query(func.coalesce(func.sum(FAQ.view_count), 0)).scalar() or 0
    
    helpful_articles = db.query(func.coalesce(func.sum(Article.helpful_count), 0)).scalar() or 0
    not_helpful_articles = db.query(func.coalesce(func.sum(Article.not_helpful_count), 0)).scalar() or 0
    helpful_faqs = db.query(func.coalesce(func.sum(FAQ.helpful_count), 0)).scalar() or 0
    not_helpful_faqs = db.query(func.coalesce(func.sum(FAQ.not_helpful_count), 0)).scalar() or 0
    
    total_helpful = helpful_articles + helpful_faqs
    total_feedback = total_helpful + not_helpful_articles + not_helpful_faqs
    
    return {
        "total_articles": total_articles,
        "published_articles": published_articles,
        "total_faqs": total_faqs,
        "published_faqs": published_faqs,
        "total_views": total_views,
        "helpful_rating_pct": (total_helpful / total_feedback * 100) if total_feedback > 0 else None,
    }


def export_report(
    db: Session,
    report_type: str,
    format: str = "csv",
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    agent_id: Optional[int] = None,
) -> tuple[str, str]:
    """Export report to CSV or JSON. Returns (content, filename)."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    
    if report_type == "conversations":
        query = db.query(Conversation)
        if start_date:
            query = query.filter(Conversation.created_at >= start_date)
        if end_date:
            query = query.filter(Conversation.created_at <= end_date)
        if agent_id:
            query = query.filter(Conversation.assigned_agent_id == agent_id)
        
        conversations = query.all()
        
        if format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "ID", "Subject", "Status", "Channel", "Customer ID", "Agent ID",
                "Created At", "Updated At", "Resolved At", "First Response At",
                "SLA Response Due", "SLA Resolution Due",
                "SLA Response Breached", "SLA Resolution Breached"
            ])
            for conv in conversations:
                writer.writerow([
                    conv.id, conv.subject or "", conv.status, conv.channel,
                    conv.customer_id, conv.assigned_agent_id or "",
                    conv.created_at.isoformat() if conv.created_at else "",
                    conv.updated_at.isoformat() if conv.updated_at else "",
                    conv.resolved_at.isoformat() if conv.resolved_at else "",
                    conv.first_response_at.isoformat() if conv.first_response_at else "",
                    conv.sla_response_due_at.isoformat() if conv.sla_response_due_at else "",
                    conv.sla_resolution_due_at.isoformat() if conv.sla_resolution_due_at else "",
                    conv.sla_response_breached, conv.sla_resolution_breached,
                ])
            content = output.getvalue()
            filename = f"conversations_{timestamp}.csv"
        else:
            data = [
                {
                    "id": conv.id,
                    "subject": conv.subject,
                    "status": conv.status,
                    "channel": conv.channel,
                    "customer_id": conv.customer_id,
                    "agent_id": conv.assigned_agent_id,
                    "created_at": conv.created_at.isoformat() if conv.created_at else None,
                    "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
                    "resolved_at": conv.resolved_at.isoformat() if conv.resolved_at else None,
                    "first_response_at": conv.first_response_at.isoformat() if conv.first_response_at else None,
                    "sla_response_due_at": conv.sla_response_due_at.isoformat() if conv.sla_response_due_at else None,
                    "sla_resolution_due_at": conv.sla_resolution_due_at.isoformat() if conv.sla_resolution_due_at else None,
                    "sla_response_breached": conv.sla_response_breached,
                    "sla_resolution_breached": conv.sla_resolution_breached,
                }
                for conv in conversations
            ]
            content = json.dumps(data, indent=2)
            filename = f"conversations_{timestamp}.json"
    
    elif report_type == "agents":
        agents_data = get_agent_performance(db, start_date, end_date)
        
        if format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "Agent ID", "Agent Name", "Conversations Handled", "Conversations Resolved",
                "Avg Response Time (min)", "Avg Resolution Time (min)",
                "SLA Response Met %", "SLA Resolution Met %", "Current Active"
            ])
            for a in agents_data:
                writer.writerow([
                    a["agent_id"], a["agent_name"], a["conversations_handled"],
                    a["conversations_resolved"], a["avg_response_time_minutes"] or "",
                    a["avg_resolution_time_minutes"] or "",
                    a["sla_response_met_pct"] or "", a["sla_resolution_met_pct"] or "",
                    a["current_active"],
                ])
            content = output.getvalue()
            filename = f"agents_{timestamp}.csv"
        else:
            content = json.dumps(agents_data, indent=2)
            filename = f"agents_{timestamp}.json"
    
    elif report_type == "knowledge":
        kb_metrics = get_knowledge_base_metrics(db)
        
        if format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["Metric", "Value"])
            for k, v in kb_metrics.items():
                writer.writerow([k, v])
            content = output.getvalue()
            filename = f"knowledge_{timestamp}.csv"
        else:
            content = json.dumps(kb_metrics, indent=2)
            filename = f"knowledge_{timestamp}.json"
    
    elif report_type == "sla":
        conversations = db.query(Conversation).all()
        
        if format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "Conversation ID", "Subject", "Status", "Agent", "Created At",
                "Response Due", "Resolution Due", "Response Breached", "Resolution Breached",
                "First Response At", "Resolved At"
            ])
            for conv in conversations:
                sla = get_sla_status(conv)
                writer.writerow([
                    conv.id, conv.subject or "", conv.status,
                    conv.assigned_agent_id or "",
                    conv.created_at.isoformat() if conv.created_at else "",
                    conv.sla_response_due_at.isoformat() if conv.sla_response_due_at else "",
                    conv.sla_resolution_due_at.isoformat() if conv.sla_resolution_due_at else "",
                    conv.sla_response_breached, conv.sla_resolution_breached,
                    conv.first_response_at.isoformat() if conv.first_response_at else "",
                    conv.resolved_at.isoformat() if conv.resolved_at else "",
                ])
            content = output.getvalue()
            filename = f"sla_{timestamp}.csv"
        else:
            data = []
            for conv in conversations:
                sla = get_sla_status(conv)
                data.append({
                    "conversation_id": conv.id,
                    "subject": conv.subject,
                    "status": conv.status,
                    "agent_id": conv.assigned_agent_id,
                    "created_at": conv.created_at.isoformat() if conv.created_at else None,
                    "response_due_at": conv.sla_response_due_at.isoformat() if conv.sla_response_due_at else None,
                    "resolution_due_at": conv.sla_resolution_due_at.isoformat() if conv.sla_resolution_due_at else None,
                    "response_breached": conv.sla_response_breached,
                    "resolution_breached": conv.sla_resolution_breached,
                    "first_response_at": conv.first_response_at.isoformat() if conv.first_response_at else None,
                    "resolved_at": conv.resolved_at.isoformat() if conv.resolved_at else None,
                    "sla_status": sla,
                })
            content = json.dumps(data, indent=2)
            filename = f"sla_{timestamp}.json"
    
    else:
        raise ValueError(f"Unknown report type: {report_type}")
    
    return content, filename
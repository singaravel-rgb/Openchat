from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Union
import csv
import io
import json
import zipfile
from xml.sax.saxutils import escape

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


def generate_xlsx(headers: list[str], rows: list[list[Any]], sheet_name: str = "Report") -> bytes:
    """Generate a clean, valid Office OpenXML .xlsx spreadsheet without third-party dependencies."""
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""")
        z.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        z.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""")
        z.writestr("xl/workbook.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="{sheet_name}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>""")
        sheet_rows = []
        all_data = [headers] + rows
        for r_idx, row in enumerate(all_data, 1):
            cells = []
            for c_idx, val in enumerate(row, 1):
                col_letter = chr(64 + c_idx) if c_idx <= 26 else f"{chr(64 + (c_idx - 1) // 26)}{chr(65 + (c_idx - 1) % 26)}"
                ref = f"{col_letter}{r_idx}"
                s_val = escape(str(val if val is not None else ""))
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{s_val}</t></is></c>')
            sheet_rows.append(f'<row r="{r_idx}">{"".join(cells)}</row>')
        sheet_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    {"".join(sheet_rows)}
  </sheetData>
</worksheet>"""
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return bio.getvalue()


def export_report(
    db: Session,
    report_type: str,
    format: str = "csv",
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    agent_id: Optional[int] = None,
    fields: Optional[list[str]] = None,
    user_role: str = "admin",
) -> tuple[Union[str, bytes], str, str]:
    """Export report to CSV, XLSX, or JSON. Returns (content, filename, media_type)."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    norm_format = (format or "csv").lower().strip()
    if norm_format in ("xlsx", "excel"):
        norm_format = "xlsx"
    elif norm_format not in ("csv", "json"):
        norm_format = "csv"

    if report_type == "conversations":
        query = db.query(Conversation)
        if start_date:
            query = query.filter(Conversation.created_at >= start_date)
        if end_date:
            query = query.filter(Conversation.created_at <= end_date)
        if agent_id:
            query = query.filter(Conversation.assigned_agent_id == agent_id)

        conversations = query.order_by(Conversation.created_at.desc()).all()

        field_definitions = {
            "chat_id": ("Chat ID", lambda c: c.chat_id or f"CHT-{c.id}"),
            "id": ("ID", lambda c: c.id),
            "subject": ("Subject", lambda c: c.subject or "Support Request"),
            "status": ("Status", lambda c: c.status),
            "priority": ("Priority", lambda c: getattr(c, "priority", "normal") or "normal"),
            "channel": ("Channel", lambda c: c.channel or "widget"),
            "customer_name": ("Customer Name", lambda c: c.customer.full_name if c.customer else "Guest"),
            "customer_email": ("Customer Email", lambda c: c.customer.email if c.customer else ""),
            "agent_name": ("Agent Name", lambda c: c.assigned_agent.full_name if c.assigned_agent else "Unassigned"),
            "created_at": ("Created At", lambda c: c.created_at.isoformat() if c.created_at else ""),
            "updated_at": ("Updated At", lambda c: c.updated_at.isoformat() if c.updated_at else ""),
            "resolved_at": ("Resolved At", lambda c: c.resolved_at.isoformat() if getattr(c, "resolved_at", None) else ""),
            "first_response_at": ("First Response At", lambda c: c.first_response_at.isoformat() if getattr(c, "first_response_at", None) else ""),
            "sla_response_breached": ("SLA Response Breached", lambda c: "Yes" if getattr(c, "sla_response_breached", False) else "No"),
            "sla_resolution_breached": ("SLA Resolution Breached", lambda c: "Yes" if getattr(c, "sla_resolution_breached", False) else "No"),
            "messages_summary": ("Messages Summary", lambda c: " | ".join(f"[{m.sender_type.upper()}] {m.content}" for m in (c.messages or []) if not (m.is_internal and user_role not in ("admin", "super_admin")))),
        }

        active_fields = []
        if fields:
            for f in fields:
                if f in field_definitions:
                    active_fields.append(f)
        if not active_fields:
            active_fields = [
                "chat_id", "subject", "status", "priority", "channel",
                "customer_name", "customer_email", "agent_name",
                "created_at", "updated_at", "resolved_at",
                "sla_response_breached", "sla_resolution_breached"
            ]

        headers = [field_definitions[k][0] for k in active_fields]
        rows = [
            [field_definitions[k][1](conv) for k in active_fields]
            for conv in conversations
        ]

        if norm_format == "xlsx":
            content = generate_xlsx(headers, rows, sheet_name="Conversations")
            filename = f"conversations_{timestamp}.xlsx"
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            return content, filename, media_type
        elif norm_format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            for row in rows:
                writer.writerow(row)
            content = output.getvalue()
            filename = f"conversations_{timestamp}.csv"
            media_type = "text/csv"
            return content, filename, media_type
        else:
            data = [
                {k: field_definitions[k][1](conv) for k in active_fields}
                for conv in conversations
            ]
            content = json.dumps(data, indent=2)
            filename = f"conversations_{timestamp}.json"
            media_type = "application/json"
            return content, filename, media_type

    elif report_type == "agents":
        agents_data = get_agent_performance(db, start_date, end_date)
        headers = [
            "Agent ID", "Agent Name", "Total Assigned", "Resolved Count",
            "Avg Response Time (min)", "Avg Resolution Time (hr)",
            "SLA Response Breached", "SLA Resolution Breached"
        ]
        rows = [
            [
                a["agent_id"], a["agent_name"], a["total_assigned"], a["resolved_count"],
                a["avg_response_time_minutes"], a["avg_resolution_time_hours"],
                a["sla_response_breached_count"], a["sla_resolution_breached_count"]
            ]
            for a in agents_data
        ]
        if norm_format == "xlsx":
            content = generate_xlsx(headers, rows, sheet_name="Agents")
            return content, f"agents_{timestamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif norm_format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            for row in rows:
                writer.writerow(row)
            return output.getvalue(), f"agents_{timestamp}.csv", "text/csv"
        else:
            return json.dumps(agents_data, indent=2), f"agents_{timestamp}.json", "application/json"

    elif report_type == "knowledge":
        metrics = get_knowledge_base_metrics(db)
        headers = ["Metric", "Value"]
        rows = [
            ["Total Articles", metrics.get("total_articles", 0)],
            ["Published Articles", metrics.get("published_articles", 0)],
            ["Total FAQs", metrics.get("total_faqs", 0)],
            ["Published FAQs", metrics.get("published_faqs", 0)],
            ["Total Views", metrics.get("total_views", 0)],
            ["Helpful Rating %", metrics.get("helpful_rating_pct", 0.0)],
        ]
        if norm_format == "xlsx":
            content = generate_xlsx(headers, rows, sheet_name="KnowledgeBase")
            return content, f"knowledge_{timestamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif norm_format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            for row in rows:
                writer.writerow(row)
            return output.getvalue(), f"knowledge_{timestamp}.csv", "text/csv"
        else:
            return json.dumps(metrics, indent=2), f"knowledge_{timestamp}.json", "application/json"

    elif report_type == "sla":
        sla_data = get_sla_compliance(db, start_date, end_date)
        headers = ["Metric", "Value"]
        rows = [
            ["Total Conversations", sla_data.get("total_conversations", 0)],
            ["First Response Met", sla_data.get("first_response_met", 0)],
            ["First Response Breached", sla_data.get("first_response_breached", 0)],
            ["First Response Compliance %", sla_data.get("first_response_compliance_pct", 0.0)],
            ["Resolution Met", sla_data.get("resolution_met", 0)],
            ["Resolution Breached", sla_data.get("resolution_breached", 0)],
            ["Resolution Compliance %", sla_data.get("resolution_compliance_pct", 0.0)],
        ]
        if norm_format == "xlsx":
            content = generate_xlsx(headers, rows, sheet_name="SLA")
            return content, f"sla_{timestamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif norm_format == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(headers)
            for row in rows:
                writer.writerow(row)
            return output.getvalue(), f"sla_{timestamp}.csv", "text/csv"
        else:
            return json.dumps(sla_data, indent=2), f"sla_{timestamp}.json", "application/json"

    raise ValueError(f"Unknown report type: {report_type}")

from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status, Response, UploadFile, File
from sqlalchemy.orm import Session

from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.widget import (
    WidgetPublicConfig, WidgetSessionCreate, WidgetSessionResponse,
    WidgetConversationCreate, WidgetConversation, WidgetConversationDetail,
    WidgetMessageCreate, WidgetMessage, WidgetAttachment,
)
from app.services.widget_service import (
    get_or_create_widget_config, validate_widget_origin, get_or_create_guest_user,
    create_widget_session, require_widget_session, rate_limit_for_request, build_embed_snippet,
    verify_host_identity_token,
)
from app.core.security import hash_password
import secrets
from app.services.conversation_service import (
    process_customer_message, append_assignment_history, record_system_event,
    get_last_public_message, compute_unread_count, generate_chat_id,
    mark_conversation_read_for_user,
)
from app.services.assignment_service import assign_conversation_to_agent
from app.services.sla_service import apply_sla_to_conversation
from app.api.dependencies import get_current_user
import jwt
from app.core.config import settings

router = APIRouter(prefix="/widget", tags=["Widget"])


def _cfg_or_503(db: Session):
    return get_or_create_widget_config(db)


def _public_config(cfg, db: Optional[Session] = None):
    bot_flow_data = None
    if db:
        try:
            from app.services.bot_flow_service import get_active_bot_flow_data
            bot_flow_data = get_active_bot_flow_data(db)
        except Exception:
            pass
    return WidgetPublicConfig(
        widget_title=cfg.widget_title,
        brand_name=cfg.brand_name,
        logo_url=cfg.logo_url,
        primary_color=cfg.primary_color,
        launcher_position=cfg.launcher_position,
        welcome_message=cfg.welcome_message,
        greeting_text=cfg.greeting_text,
        widget_visibility=cfg.widget_visibility,
        widget_availability=cfg.widget_availability,
        hide_launcher_on_help_page=cfg.hide_launcher_on_help_page,
        show_agent_avatar=cfg.show_agent_avatar,
        require_email=cfg.require_email,
        bot_flow=bot_flow_data,
    )


@router.get("/config", response_model=WidgetPublicConfig)
def get_widget_config(request: Request, page_url: str | None = Query(None), db: Session = Depends(get_db)):
    rate_limit_for_request(request, "widget:config", 120, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, page_url=page_url, require_when_configured=True)
    return _public_config(cfg, db=db)


@router.get("/bot-flow")
def get_widget_bot_flow(request: Request, db: Session = Depends(get_db)):
    from app.services.bot_flow_service import get_active_bot_flow_data
    return get_active_bot_flow_data(db)


@router.post("/session", response_model=WidgetSessionResponse)
def create_session(
    data: WidgetSessionCreate,
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:session", 30, 60)
    cfg = _cfg_or_503(db)
    origin = validate_widget_origin(cfg, request, page_url=data.page_url, require_when_configured=True)
    if not cfg.widget_visibility or not cfg.widget_availability:
        raise HTTPException(status_code=403, detail="Widget is currently unavailable")

    # Check for host-signed identity token (authenticated host mode)
    host_identity_payload = None
    if data.host_identity_token:
        host_identity_payload = verify_host_identity_token(data.host_identity_token, origin, cfg)
    
    # allow authenticated app user to create linked session
    user = None
    is_guest = True
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            uid = int(payload.get("sub"))
            u = db.query(User).filter(User.id == uid, User.is_active == True).first()  # noqa: E712
            if u and u.role == "customer":
                user = u
                is_guest = False
        except Exception:
            user = None

    if host_identity_payload:
        # Host-signed token takes precedence - verify and use identity from token
        external_id = host_identity_payload.get("sub") or host_identity_payload.get("user_id")
        email = host_identity_payload.get("email")
        full_name = host_identity_payload.get("name") or host_identity_payload.get("full_name")
        
        if external_id:
            # Try to find existing customer by external ID (stored in email field pattern)
            existing = db.query(User).filter(
                User.email == f"host_{external_id}@widget.openchat.local",
                User.role == "customer"
            ).first()
            if existing:
                user = existing
                is_guest = False
            else:
                # Create a new customer user from host identity
                user = User(
                    email=f"host_{external_id}@widget.openchat.local",
                    full_name=full_name or "Host Verified User",
                    role="customer",
                    is_active=True,
                    password_hash=hash_password(secrets.token_urlsafe(24)),
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                is_guest = False
        elif email:
            # Fallback to email lookup
            existing = db.query(User).filter(User.email == email, User.role == "customer").first()
            if existing:
                user = existing
                is_guest = False
            else:
                user = User(
                    email=email,
                    full_name=full_name or "Host Verified User",
                    role="customer",
                    is_active=True,
                    password_hash=hash_password(secrets.token_urlsafe(24)),
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                is_guest = False

    if not user:
        if cfg.require_email and not (data.guest_email and data.guest_email.strip()):
            raise HTTPException(status_code=400, detail="Email is required to start a chat")
        user = get_or_create_guest_user(db, data.guest_name, data.guest_email)

    raw, sess = create_widget_session(db, is_guest=is_guest, user=user, origin=origin,
                                      guest_name=data.guest_name, guest_email=data.guest_email)
    return WidgetSessionResponse(session_token=raw, expires_at=sess.expires_at, is_guest=is_guest)


@router.get("/session")
def get_session(
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:session:get", 120, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    sess, user = require_widget_session(db, request, x_widget_session)
    # return safe session info + conversation summaries
    convs = (
        db.query(Conversation)
        .filter(Conversation.customer_id == user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(20)
        .all()
    )
    items = []
    for c in convs:
        last = get_last_public_message(db, c.id)
        items.append(WidgetConversation(
            id=c.id, subject=c.subject, status=c.status, updated_at=c.updated_at, created_at=c.created_at,
            last_message=last.content if last else None,
            unread_count=compute_unread_count(db, c, "customer"),
        ))
    return {
        "valid": True,
        "expires_at": sess.expires_at,
        "is_guest": sess.is_guest,
        "conversations": [i.model_dump() for i in items],
    }


@router.post("/session/restore", response_model=WidgetSessionResponse)
def restore_session(
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    # alias to validate and return token info (token remains same)
    rate_limit_for_request(request, "widget:session:restore", 60, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    sess, _ = require_widget_session(db, request, x_widget_session)
    return WidgetSessionResponse(session_token=x_widget_session or "", expires_at=sess.expires_at, is_guest=sess.is_guest)


def _conv_to_widget(c: Conversation, db: Session) -> WidgetConversation:
    last = get_last_public_message(db, c.id)
    return WidgetConversation(
        id=c.id, chat_id=c.chat_id, subject=c.subject, status=c.status, updated_at=c.updated_at, created_at=c.created_at,
        last_message=last.content if last else None,
        unread_count=compute_unread_count(db, c, "customer"),
    )


def _msg_to_widget(m: Message) -> WidgetMessage:
    # never expose internal notes/sender ids
    atts = []
    if hasattr(m, "attachments") and m.attachments:
        atts = [
            WidgetAttachment(
                id=a.id,
                filename=a.filename,
                original_filename=a.original_filename,
                mime_type=a.mime_type,
                file_size=a.file_size,
                is_image=a.is_image,
                download_url=f"/api/v1/widget/attachments/{a.id}/download",
            )
            for a in m.attachments
        ]
    return WidgetMessage(
        id=m.id,
        sender_type=m.sender_type,
        message_type=m.message_type,
        content=m.content,
        created_at=m.created_at,
        delivery_status=getattr(m, "delivery_status", "delivered"),
        ai_metadata=getattr(m, "ai_metadata", None),
        attachments=atts,
    )


@router.get("/conversations", response_model=list[WidgetConversation])
def list_conversations(
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:conv:list", 120, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    convs = (
        db.query(Conversation)
        .filter(Conversation.customer_id == user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(30)
        .all()
    )
    return [_conv_to_widget(c, db) for c in convs]


@router.post("/conversations", response_model=WidgetConversationDetail, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: WidgetConversationCreate,
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:conv:create", 30, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    if not cfg.widget_availability:
        raise HTTPException(status_code=403, detail="Widget is currently unavailable")
    _, user = require_widget_session(db, request, x_widget_session)

    conversation = Conversation(
        chat_id=generate_chat_id(db),
        customer_id=user.id,
        subject=data.subject or "Website chat",
        status=ConversationStatus.AI_HANDLING,
        channel="widget",
        priority="normal",
        tags=[],
        assignment_history=[],
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    apply_sla_to_conversation(db, conversation)
    db.commit()
    db.refresh(conversation)

    # Initial support greeting from active bot flow with Level 1 options
    from app.services.bot_flow_service import get_active_bot_flow_data
    flow_data = get_active_bot_flow_data(db)
    level_1_options = [
        {"label": issue["title"], "value": issue["title"], "next_step_key": issue["start_step_key"]}
        for issue in flow_data.get("issues", [])
    ]
    greeting_msg = Message(
        conversation_id=conversation.id,
        sender_id=None,
        sender_type=MessageSenderType.AI,
        message_type=MessageType.TEXT,
        content=flow_data.get("initial_greeting") or cfg.welcome_message or "Hello! Welcome to OpenChat Support. How can we help you today?",
        is_internal=False,
        delivery_status="delivered",
        ai_metadata={"system_greeting": True, "options": level_1_options, "flow_id": flow_data.get("id")},
    )
    db.add(greeting_msg)
    db.commit()

    if data.initial_message and data.initial_message.strip():
        await process_customer_message(db, conversation, user, data.initial_message.strip(), client_message_id=data.client_message_id, sync_ai=True)
        db.refresh(conversation)

    messages = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation.id,
            Message.is_internal == False,
            Message.is_retracted == False,
            Message.message_type != MessageType.INTERNAL_NOTE,
            Message.message_type != MessageType.SYSTEM_EVENT,
        )
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    detail = WidgetConversationDetail(
        **_conv_to_widget(conversation, db).model_dump(),
        messages=[_msg_to_widget(m) for m in messages],
    )
    return detail


@router.get("/conversations/{conversation_id}", response_model=WidgetConversationDetail)
def get_conversation(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:conv:get", 240, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation.id,
            Message.is_internal == False,
            Message.is_retracted == False,
            Message.message_type != MessageType.INTERNAL_NOTE,
            Message.message_type != MessageType.SYSTEM_EVENT,
        )
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    # mark read
    from datetime import datetime, timezone
    conversation.customer_last_read_at = datetime.now(timezone.utc)
    mark_conversation_read_for_user(db, conversation.id, user)
    db.commit()
    db.refresh(conversation)
    return WidgetConversationDetail(**_conv_to_widget(conversation, db).model_dump(), messages=[_msg_to_widget(m) for m in messages])


@router.post("/conversations/{conversation_id}/read")
def mark_widget_conversation_read(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:conv:read", 120, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    res = mark_conversation_read_for_user(db, conversation.id, user)
    return {"status": "ok", **res}


@router.post("/conversations/{conversation_id}/messages", response_model=WidgetMessage, status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: int,
    data: WidgetMessageCreate,
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:msg:send", 60, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.status == ConversationStatus.CLOSED:
        raise HTTPException(status_code=409, detail="This conversation is closed and no longer accepting messages")
    if conversation.status == ConversationStatus.RESOLVED:
        from app.services.conversation_service import reopen_conversation
        reopen_conversation(db, conversation, user)
        db.flush()

    content_clean = (data.content or "").strip()
    if content_clean.lower() == "/help" or content_clean.lower().startswith("/help "):
        cust_msg = Message(
            conversation_id=conversation.id,
            sender_id=user.id,
            sender_type=MessageSenderType.CUSTOMER,
            message_type=MessageType.TEXT,
            content=content_clean,
            is_internal=False,
            delivery_status="delivered",
            client_message_id=data.client_message_id,
        )
        db.add(cust_msg)
        db.commit()

        from app.models.knowledge import Article
        from app.core.enums import ArticleStatus, ArticleVisibility
        articles = (
            db.query(Article)
            .filter(Article.status == ArticleStatus.PUBLISHED, Article.visibility == ArticleVisibility.PUBLIC)
            .order_by(Article.display_order.asc(), Article.id.asc())
            .limit(4)
            .all()
        )
        article_items = [
            {"id": a.id, "title": a.title, "slug": a.slug, "excerpt": a.excerpt or (a.content[:120] + "...")}
            for a in articles
        ]

        from app.services.bot_flow_service import get_active_bot_flow_data
        flow_data = get_active_bot_flow_data(db)
        quick_options = [
            {"label": issue["title"], "value": issue["title"], "next_step_key": issue["start_step_key"]}
            for issue in flow_data.get("issues", [])
        ]

        lines = ["Here are some helpful resources and assistance options:"]
        if article_items:
            lines.append("\nPopular Help Articles:")
            for a in article_items:
                lines.append(f"• {a['title']}")
        lines.append("\nChoose a topic below or type your question:")

        bot_msg = Message(
            conversation_id=conversation.id,
            sender_id=None,
            sender_type=MessageSenderType.AI,
            message_type=MessageType.TEXT,
            content="\n".join(lines),
            is_internal=False,
            delivery_status="delivered",
            ai_metadata={
                "is_help_response": True,
                "articles": article_items,
                "options": quick_options,
            },
        )
        db.add(bot_msg)
        db.commit()
        db.refresh(bot_msg)
        return _msg_to_widget(bot_msg)

    msg = await process_customer_message(db, conversation, user, data.content, client_message_id=data.client_message_id, sync_ai=False)
    return _msg_to_widget(msg)


@router.post("/conversations/{conversation_id}/attachments", response_model=WidgetMessage, status_code=status.HTTP_201_CREATED)
async def upload_widget_attachment(
    conversation_id: int,
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:attach:upload", 30, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.status == ConversationStatus.CLOSED:
        raise HTTPException(status_code=409, detail="This conversation is closed")
    if conversation.status == ConversationStatus.RESOLVED:
        from app.services.conversation_service import reopen_conversation
        reopen_conversation(db, conversation, user)
        db.flush()

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed 10MB")

    mime = file.content_type or "application/octet-stream"
    if mime not in ("image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"):
        raise HTTPException(status_code=400, detail="Only image files (PNG, JPG, JPEG, GIF, WebP) are supported")

    msg = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content=file.filename or "image.png",
        is_internal=False,
        delivery_status="delivered",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    from app.services.attachment_service import create_attachment
    create_attachment(
        db=db,
        conversation_id=conversation.id,
        file_content=content,
        original_filename=file.filename or "image.png",
        mime_type=mime,
        uploaded_by_id=user.id,
        message_id=msg.id,
    )
    db.refresh(msg)
    return _msg_to_widget(msg)


@router.get("/attachments/{attachment_id}/download")
def download_widget_attachment(
    attachment_id: int,
    session: Optional[str] = Query(None),
    request: Request = None,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    token = x_widget_session or session
    _, user = require_widget_session(db, request, token)
    from app.services.attachment_service import get_attachment_by_id, get_attachment_file_path
    attachment = get_attachment_by_id(db, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    conversation = db.query(Conversation).filter(Conversation.id == attachment.conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=403, detail="Not authorized to access this attachment")
    file_path = get_attachment_file_path(attachment)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=open(file_path, "rb").read(),
        media_type=attachment.mime_type,
        headers={"Content-Disposition": f'inline; filename="{attachment.original_filename}"'},
    )


@router.get("/bot-flow")
def get_widget_bot_flow(
    request: Request,
    db: Session = Depends(get_db),
):
    rate_limit_for_request(request, "widget:botflow", 120, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    from app.services.bot_flow_service import get_active_bot_flow_data
    return get_active_bot_flow_data(db)


@router.post("/conversations/{conversation_id}/reopen")
def reopen_widget_conversation(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:reopen", 30, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    from app.services.conversation_service import reopen_conversation
    reopen_conversation(db, conversation, user)
    db.commit()
    return {"message": "Conversation reopened successfully", "status": conversation.status}


@router.post("/conversations/{conversation_id}/request-human")
async def request_human(
    conversation_id: int,
    request: Request,
    db: Session = Depends(get_db),
    x_widget_session: str | None = Header(None),
):
    rate_limit_for_request(request, "widget:handoff", 30, 60)
    cfg = _cfg_or_503(db)
    validate_widget_origin(cfg, request, require_when_configured=True)
    _, user = require_widget_session(db, request, x_widget_session)
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.customer_id == user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        raise HTTPException(status_code=409, detail="Conversation is not active")

    # if already assigned, just inform
    if conversation.assigned_agent_id and conversation.status == ConversationStatus.ASSIGNED:
        return {"status": conversation.status, "message": "A human agent is already assisting you."}

    prev = conversation.status
    conversation.status = ConversationStatus.PENDING
    record_system_event(db, conversation, "Customer requested human assistance", actor_id=user.id)
    append_assignment_history(db, conversation, user.id, "handoff_requested")
    db.flush()
    assigned = assign_conversation_to_agent(db, conversation)
    db.commit()
    db.refresh(conversation)

    if conversation.assigned_agent_id and conversation.status == ConversationStatus.ASSIGNED:
        # assignment engine handled it (agent available)
        return {"status": conversation.status, "message": "Connecting you with a human agent now."}
    return {"status": ConversationStatus.PENDING, "message": "Your conversation is in the queue. A human agent will assist you shortly."}


@router.get("/embed.js")
def embed_script(request: Request, db: Session = Depends(get_db)):
    # serve JS widget; allow cross-origin load (script tag). origin checks happen on API calls.
    base = str(request.base_url).rstrip('/')
    candidates = [
        Path(__file__).resolve().parents[4] / "widget" / "openchat-widget.js",
        Path(__file__).resolve().parents[3] / "widget" / "openchat-widget.js",
        Path("/app/widget/openchat-widget.js"),
        Path("widget/openchat-widget.js"),
    ]
    for p in candidates:
        if p.exists():
            return Response(
                content=p.read_text(encoding="utf-8"),
                media_type="application/javascript",
                headers={"Cache-Control": "no-cache"},
            )
    js = build_widget_js(base)
    return Response(content=js, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


def build_widget_js(api_base: str) -> str:
    # self-contained embeddable widget
    return r'''(function(){
  if (window.__openchatWidgetLoaded) return; window.__openchatWidgetLoaded = true;
  var API_BASE = "''' + api_base + r'''/api/v1/widget";
  var STORAGE_KEY = "openchat_widget_session";
  var state = { config:null, sessionToken:null, expiresAt:null, conversations:[], activeId:null, detail:null, open:false, minimized:false, loading:false, sending:false, error:null, poll:null, retryCount:0, offline:!navigator.onLine };
  function $(sel,root){ return (root||document).querySelector(sel); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function fmtTime(iso){ try{ var d=new Date(iso); return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } }
  function nowId(){ return 'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }
  function saveSession(){ try{ if(state.sessionToken){ localStorage.setItem(STORAGE_KEY, JSON.stringify({token:state.sessionToken, expiresAt:state.expiresAt})); } }catch(e){} }
  function loadSession(){ try{ var v=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(v&&v.token){ state.sessionToken=v.token; state.expiresAt=v.expiresAt; } }catch(e){} }
  function clearSession(){ try{ localStorage.removeItem(STORAGE_KEY);}catch(e){} state.sessionToken=null; }
  function headers(json){ var h={}; if(json) h['Content-Type']='application/json'; if(state.sessionToken) h['X-Widget-Session']=state.sessionToken; return h; }
  async function api(path, opts){ opts=opts||{}; opts.headers=Object.assign({}, headers(opts.json), opts.headers||{});
    var res = await fetch(API_BASE+path, opts);
    var text = await res.text(); var data=null; try{ data=text?JSON.parse(text):null; }catch(e){ data={detail:text}; }
    if(!res.ok){ var msg=(data&&data.detail)||(res.status===429?'Too many requests. Please slow down.':'Request failed'); var err=new Error(msg); err.status=res.status; err.data=data; throw err; }
    return data;
  }
  function isHelpPage(cfg){ if(!cfg||!cfg.hide_launcher_on_help_page) return false; try{ var p=location.pathname||''; return p==='/help' || p.indexOf('/help/')===0; }catch(e){ return false; } }
  function injectStyles(primary){ if($('#openchat-widget-style')) return; var st=document.createElement('style'); st.id='openchat-widget-style';
    st.textContent='.ocw-root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;z-index:2147483000} .ocw-launcher{position:fixed;bottom:20px;width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;color:#fff} .ocw-launcher.ocw-right{right:20px} .ocw-launcher.ocw-left{left:20px} .ocw-panel{position:fixed;bottom:90px;width:360px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden} .ocw-panel.ocw-right{right:20px} .ocw-panel.ocw-left{left:20px} .ocw-header{padding:12px 14px;color:#fff;display:flex;align-items:center;justify-content:space-between} .ocw-title{font-weight:600;font-size:14px} .ocw-sub{font-size:12px;opacity:.9} .ocw-body{flex:1;overflow:auto;background:#f8fafc;padding:12px} .ocw-footer{padding:10px;border-top:1px solid #e5e7eb;background:#fff} .ocw-input{width:100%;min-height:40px;max-height:100px;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font:inherit} .ocw-row{display:flex;gap:8px;margin-top:8px} .ocw-btn{border:none;border-radius:10px;padding:8px 10px;cursor:pointer;font:inherit} .ocw-btn-primary{color:#fff} .ocw-btn-ghost{background:#e2e8f0;color:#0f172a} .ocw-msg{margin:8px 0;display:flex} .ocw-msg.ocw-user{justify-content:flex-end} .ocw-bubble{max-width:85%;padding:8px 10px;border-radius:12px;font-size:13px;line-height:1.35;white-space:pre-wrap} .ocw-user .ocw-bubble{color:#fff;border-bottom-right-radius:4px} .ocw-agent .ocw-bubble,.ocw-ai .ocw-bubble,.ocw-system .ocw-bubble{background:#fff;border:1px solid #e5e7eb;color:#0f172a;border-bottom-left-radius:4px} .ocw-meta{font-size:10px;color:#64748b;margin-top:2px} .ocw-list button{width:100%;text-align:left;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer} .ocw-badge{display:inline-block;font-size:10px;padding:2px 6px;border-radius:9999px;background:#e2e8f0;color:#334155;margin-left:6px} .ocw-error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:8px;border-radius:8px;font-size:12px;margin-bottom:8px} .ocw-empty{color:#64748b;font-size:13px;text-align:center;padding:24px 8px} .ocw-topbar{display:flex;gap:6px;align-items:center} .ocw-iconbtn{background:rgba(255,255,255,.2);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer} @media (max-width:480px){.ocw-panel{right:8px;left:8px;bottom:80px;width:auto;height:70vh}.ocw-launcher.ocw-right{right:12px}.ocw-launcher.ocw-left{left:12px}}';
    document.head.appendChild(st);
  }
  function rootEl(){ var r=$('#openchat-widget-root'); if(!r){ r=document.createElement('div'); r.id='openchat-widget-root'; r.className='ocw-root'; document.body.appendChild(r);} return r; }
  function setError(msg){ state.error=msg; render(); }
  function clearError(){ state.error=null; }
  async function ensureSession(){
    loadSession();
    if(!state.sessionToken){ await createSession(); return; }
    try{
      var info=await api('/session');
      state.conversations = info.conversations||[];
      state.expiresAt = info.expires_at;
      saveSession();
    }catch(e){ if(e.status===401){ clearSession(); await createSession(); } else { throw e; } }
  }
  function getHostIdentityToken(){
    // Host website can expose a signed identity token via:
    // 1. window.OpenChatHostIdentityToken (string)
    // 2. window.OpenChatHostIdentityTokenFn (function returning string, called lazily)
    // 3. <script data-openchat-host-token="..."> on the embed script tag
    try{
      if(window.OpenChatHostIdentityToken && typeof window.OpenChatHostIdentityToken === 'string') return window.OpenChatHostIdentityToken;
      if(typeof window.OpenChatHostIdentityTokenFn === 'function'){
        var t=window.OpenChatHostIdentityTokenFn();
        if(t && typeof t === 'string') return t;
      }
      var tag=document.querySelector('script[data-openchat-host-token]');
      if(tag && tag.getAttribute('data-openchat-host-token')) return tag.getAttribute('data-openchat-host-token');
    }catch(e){}
    return null;
  }
  async function createSession(){
    var body={ page_url: location.href, is_help_page: (location.pathname==='/help'||(location.pathname||'').indexOf('/help/')===0) };
    var hostToken=getHostIdentityToken();
    if(hostToken) body.host_identity_token=hostToken;
    var s=await api('/session',{method:'POST', json:true, body:JSON.stringify(body)});
    state.sessionToken=s.session_token; state.expiresAt=s.expires_at; saveSession();
    state.conversations=[];
  }
  async function loadConversations(){ try{ state.conversations = await api('/conversations'); }catch(e){ /* ignore */ } }
  async function loadDetail(id){ state.loading=true; state.activeId=id; render(); try{ state.detail=await api('/conversations/'+id); await loadConversations(); clearError(); }catch(e){ setError(e.message||'Failed to load conversation'); } finally{ state.loading=false; render(); } }
  async function startConversation(){
    state.loading=true; render();
    try{ var d=await api('/conversations',{method:'POST', json:true, body:JSON.stringify({subject:'Website chat'})}); state.detail=d; state.activeId=d.id; await loadConversations(); clearError(); }catch(e){ setError(e.message||'Failed to start conversation'); } finally{ state.loading=false; render(); }
  }
  async function sendMessage(){
    var ta=$('#ocw-text'); if(!ta || !state.detail || state.sending) return; var content=ta.value.trim(); if(!content) return;
    var clientId=nowId(); state.sending=true; clearError();
    // optimistic
    var optimistic={id:'tmp_'+clientId, sender_type:'customer', message_type:'text', content:content, created_at:new Date().toISOString(), delivery_status:'sending', client_message_id:clientId};
    state.detail.messages.push(optimistic); ta.value=''; render();
    try{
      var msg=await api('/conversations/'+state.detail.id+'/messages',{method:'POST', json:true, body:JSON.stringify({content:content, client_message_id:clientId})});
      // replace optimistic
      state.detail.messages = state.detail.messages.map(function(m){ return (m.client_message_id===clientId||m.id===optimistic.id)?msg:m; });
      await loadDetail(state.detail.id);
    }catch(e){
      state.detail.messages = state.detail.messages.map(function(m){ return m.id===optimistic.id?Object.assign({},m,{delivery_status:'failed'}):m; });
      setError(e.message||'Failed to send. Please retry.'); state.sending=false; render();
      return;
    }
    state.sending=false; render();
  }
  async function requestHuman(){
    if(!state.detail) return; clearError();
    try{ var r=await api('/conversations/'+state.detail.id+'/request-human',{method:'POST'}); await loadDetail(state.detail.id); if(r&&r.message){ state.info=r.message; render(); setTimeout(function(){ state.info=null; render(); }, 4000); } }
    catch(e){ setError(e.message||'Failed to request human support'); }
  }
  function startPolling(){ stopPolling(); state.poll=setInterval(async function(){ if(!state.open||state.minimized) return; try{ if(state.detail&&state.activeId){ var d=await api('/conversations/'+state.activeId); state.detail=d; } await loadConversations(); if(state.offline){ state.offline=false; } render(); }catch(e){ if(e.status===401){ try{ clearSession(); await createSession(); }catch(_){} } } }, 3000); }
  function stopPolling(){ if(state.poll){ clearInterval(state.poll); state.poll=null; } }
  function render(){
    var cfg=state.config; if(!cfg) return; var pos = (cfg.launcher_position==='bottom-left')?'ocw-left':'ocw-right'; var primary=cfg.primary_color||'#2563eb';
    var r=rootEl(); var hide = isHelpPage(cfg);
    if(hide){ r.innerHTML=''; return; }
    var launcher = !state.open ? '<button class="ocw-launcher '+pos+'" id="ocw-launch" style="background:'+esc(primary)+'" aria-label="Open chat"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg></button>' : '';
    var panel='';
    if(state.open){
      panel += '<div class="ocw-panel '+pos+'">';
      panel += '<div class="ocw-header" style="background:'+esc(primary)+'"><div><div class="ocw-title">'+esc(cfg.widget_title||cfg.brand_name||'Support')+'</div><div class="ocw-sub">'+esc(cfg.greeting_text||'We are here to help')+'</div></div><div class="ocw-topbar">'+(state.detail?'<button class="ocw-iconbtn" id="ocw-back" title="Back">←</button>':'')+'<button class="ocw-iconbtn" id="ocw-min" title="Minimize">_</button><button class="ocw-iconbtn" id="ocw-close" title="Close">×</button></div></div>';
      if(state.minimized){ panel += '<div class="ocw-body"><div class="ocw-empty">Chat minimized. Restore to continue.</div></div></div>'; }
      else {
        panel += '<div class="ocw-body">';
        if(state.error) panel += '<div class="ocw-error">'+esc(state.error)+'</div>';
        if(state.info) panel += '<div class="ocw-error" style="background:#ecfeff;color:#155e75;border-color:#a5f3fc">'+esc(state.info)+'</div>';
        if(state.offline) panel += '<div class="ocw-error">You appear to be offline. Messages will send when connection is restored.</div>';
        if(!state.detail){
          panel += '<div style="margin-bottom:10px;color:#334155;font-size:13px">'+esc(cfg.welcome_message||'Hi! How can we help?')+'</div>';
          panel += '<button class="ocw-btn ocw-btn-primary" id="ocw-start" style="background:'+esc(primary)+';width:100%">Start new conversation</button>';
          panel += '<div style="margin:12px 0 6px;font-size:12px;color:#64748b;font-weight:600">Your conversations</div>';
          if(!state.conversations||state.conversations.length===0){ panel += '<div class="ocw-empty">No conversations yet.</div>'; }
          else { panel += '<div class="ocw-list">'; state.conversations.forEach(function(c){ panel += '<button data-cid="'+c.id+'"><div style="font-weight:600;font-size:13px;color:#0f172a">'+esc(c.subject||('Conversation #'+c.id))+' <span class="ocw-badge">'+esc((c.status||'').replace('_',' '))+'</span></div><div style="font-size:12px;color:#64748b;margin-top:4px">'+esc((c.last_message||'').slice(0,80))+'</div></button>'; }); panel += '</div>'; }
        } else {
          var msgs = state.detail.messages||[];
          if(state.loading && msgs.length===0) panel += '<div class="ocw-empty">Loading conversation...</div>';
          if(!state.loading && msgs.length===0) panel += '<div class="ocw-empty">No messages yet. Say hello!</div>';
          msgs.forEach(function(m){ var cls = (m.sender_type==='customer')?'ocw-user':'ocw-agent'; if(m.sender_type==='ai') cls='ocw-ai'; if(m.sender_type==='system') cls='ocw-system';
            var senderLabel = (m.sender_type==='customer') ? ('You' + (m.delivery_status ? ' · ' + esc(m.delivery_status) : '')) : 'OpenChat Support';
            panel += '<div class="ocw-msg '+cls+'"><div><div class="ocw-bubble" '+(m.sender_type==='customer'?'style="background:'+esc(primary)+'"':'')+'>'+esc(m.content)+'</div><div class="ocw-meta">'+senderLabel+' · '+esc(fmtTime(m.created_at))+'</div></div></div>'; });
          panel += '<div id="ocw-bottom"></div>';
        }
        panel += '</div>';
        if(state.detail && !state.minimized){
          var canSend = !(state.detail.status==='resolved'||state.detail.status==='closed');
          panel += '<div class="ocw-footer">';
          if(state.detail.status==='pending'){ panel += '<div style="font-size:12px;color:#334155;margin-bottom:6px">A human agent will assist you shortly.</div>'; }
          else if(state.detail.status==='assigned'){ panel += '<div style="font-size:12px;color:#334155;margin-bottom:6px">A human agent is assisting you.</div>'; }
          if(canSend){
            panel += '<textarea id="ocw-text" class="ocw-input" placeholder="Type a message..."></textarea>';
            panel += '<div class="ocw-row"><button class="ocw-btn ocw-btn-primary" id="ocw-send" style="background:'+esc(primary)+';width:100%">'+(state.sending?'Sending...':'Send')+'</button></div>';
          } else {
            panel += '<div class="ocw-empty" style="padding:8px">This conversation is '+esc(state.detail.status)+'. Start a new conversation if you need more help.</div>';
            panel += '<button class="ocw-btn ocw-btn-primary" id="ocw-start2" style="background:'+esc(primary)+';width:100%">Start new conversation</button>';
          }
          panel += '</div>';
        }
      }
      panel += '</div>';
    }
    r.innerHTML = launcher + panel;
    var launch=$('#ocw-launch'); if(launch) launch.onclick=function(){ state.open=true; state.minimized=false; render(); startPolling(); if(!state.detail) loadConversations().then(render); };
    var close=$('#ocw-close'); if(close) close.onclick=function(){ state.open=false; stopPolling(); render(); };
    var min=$('#ocw-min'); if(min) min.onclick=function(){ state.minimized=!state.minimized; render(); };
    var back=$('#ocw-back'); if(back) back.onclick=function(){ state.detail=null; state.activeId=null; render(); loadConversations().then(render); };
    var start=$('#ocw-start')||$('#ocw-start2'); if(start) start.onclick=function(){ startConversation(); };
    var send=$('#ocw-send'); if(send) send.onclick=function(){ sendMessage(); };
    var ta=$('#ocw-text'); if(ta){ ta.onkeydown=function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); } }; }
    var hum=$('#ocw-human'); if(hum) hum.onclick=function(){ requestHuman(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-cid]'), function(btn){ btn.onclick=function(){ var id=parseInt(btn.getAttribute('data-cid'),10); if(id) loadDetail(id); }; });
    var bottom=$('#ocw-bottom'); if(bottom) try{ bottom.scrollIntoView({block:'end'}); }catch(e){}
  }
  async function init(){
    try{
      injectStyles('#2563eb');
      window.addEventListener('online', function(){ state.offline=false; render(); }); window.addEventListener('offline', function(){ state.offline=true; render(); });
      state.config = await api('/config?page_url='+encodeURIComponent(location.href));
      injectStyles(state.config.primary_color||'#2563eb');
      if(!state.config.widget_visibility || !state.config.widget_availability) return;
      if(isHelpPage(state.config)) return;
      try{ await ensureSession(); await loadConversations(); }catch(e){ /* allow launcher with error state on open */ }
      render();
    }catch(e){ /* invalid origin/unavailable - do not render widget */ console && console.warn && console.warn('OpenChat widget unavailable:', e.message); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
'''

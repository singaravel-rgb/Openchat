from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header, status, UploadFile, File, Form, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.user import User
from app.schemas.attachment import (
    AttachmentCreate,
    AttachmentResponse,
    AttachmentUploadResponse,
)
from app.services.attachment_service import (
    create_attachment,
    get_attachments_for_conversation,
    get_attachment_by_id,
    delete_attachment,
    get_attachment_file_path,
)

router = APIRouter(prefix="/attachments", tags=["Attachments"])


@router.post("/upload", response_model=AttachmentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    conversation_id: int = Form(...),
    message_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file attachment to a conversation."""
    contents = await file.read()

    try:
        attachment = create_attachment(
            db=db,
            conversation_id=conversation_id,
            file_content=contents,
            original_filename=file.filename or "unnamed",
            mime_type=file.content_type or "application/octet-stream",
            uploaded_by_id=current_user.id,
            message_id=message_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return AttachmentUploadResponse(
        attachment=attachment,
        message="File uploaded successfully",
    )


@router.get("/conversation/{conversation_id}", response_model=list[AttachmentResponse])
def list_attachments(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all attachments for a conversation."""
    from app.models.conversation import Conversation

    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Permission check
    if current_user.role == "customer" and conversation.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user.role == "agent" and conversation.assigned_agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    return get_attachments_for_conversation(db, conversation_id)


@router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Download an attachment file. Supports Bearer header or ?token query param."""
    import jwt
    from app.core.config import settings
    from app.models.conversation import Conversation
    from app.models.user import User

    auth_token = None
    if authorization and authorization.lower().startswith("bearer "):
        auth_token = authorization.split(" ", 1)[1].strip()
    elif token:
        auth_token = token.strip()

    if not auth_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = jwt.decode(auth_token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
        current_user = db.query(User).filter(User.id == user_id, User.is_active == True).first()  # noqa: E712
        if not current_user:
            raise HTTPException(status_code=401, detail="Invalid user")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    attachment = get_attachment_by_id(db, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Permission check
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == attachment.conversation_id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if current_user.role == "customer" and conversation.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    file_path = get_attachment_file_path(attachment)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    disposition = "inline" if attachment.is_image else "attachment"
    return Response(
        content=open(file_path, "rb").read(),
        media_type=attachment.mime_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{attachment.original_filename}"'
        },
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an attachment."""
    success = delete_attachment(db, attachment_id, current_user.id, current_user.role)
    if not success:
        raise HTTPException(status_code=404, detail="Attachment not found or not authorized")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


import os
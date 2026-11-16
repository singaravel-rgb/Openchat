import os
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.user import User
from app.schemas.attachment import AttachmentCreate, AttachmentResponse


# Ensure upload directory exists
UPLOAD_DIR = getattr(settings, "upload_dir", "uploads")
MAX_FILE_SIZE = getattr(settings, "max_file_size", 10 * 1024 * 1024)  # 10 MB default
ALLOWED_MIME_TYPES = getattr(
    settings,
    "allowed_mime_types",
    [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    ],
)


def ensure_upload_dir():
    """Ensure the upload directory exists."""
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)


def save_attachment_file(file_content: bytes, original_filename: str) -> tuple[str, str]:
    """Save an uploaded file to disk. Returns (stored_filename, file_path)."""
    ensure_upload_dir()
    file_ext = os.path.splitext(original_filename)[1]
    stored_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_filename)
    with open(file_path, "wb") as f:
        f.write(file_content)
    return stored_filename, file_path


def get_attachment_file_path(attachment: Attachment) -> str:
    """Get the full file path for an attachment."""
    return attachment.file_path


def create_attachment(
    db: Session,
    conversation_id: int,
    file_content: bytes,
    original_filename: str,
    mime_type: str,
    uploaded_by_id: Optional[int] = None,
    message_id: Optional[int] = None,
) -> AttachmentResponse:
    """Create an attachment record and save the file to disk."""
    # Validate file size
    if len(file_content) > MAX_FILE_SIZE:
        raise ValueError(f"File size exceeds maximum allowed size of {MAX_FILE_SIZE} bytes")

    # Validate MIME type
    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"MIME type '{mime_type}' is not allowed")

    # Verify conversation exists
    from app.models.conversation import Conversation
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise ValueError(f"Conversation {conversation_id} not found")

    # Verify message exists if provided
    if message_id:
        message = db.query(Message).filter(Message.id == message_id).first()
        if not message:
            raise ValueError(f"Message {message_id} not found")
        if message.conversation_id != conversation_id:
            raise ValueError(f"Message {message_id} does not belong to conversation {conversation_id}")

    # Verify uploader exists if provided
    if uploaded_by_id:
        uploader = db.query(User).filter(User.id == uploaded_by_id).first()
        if not uploader:
            raise ValueError(f"User {uploaded_by_id} not found")

    # Save file
    stored_filename, file_path = save_attachment_file(file_content, original_filename)
    is_image = mime_type.startswith("image/")

    # Create attachment record
    attachment = Attachment(
        conversation_id=conversation_id,
        message_id=message_id,
        uploaded_by_id=uploaded_by_id,
        filename=stored_filename,
        original_filename=original_filename,
        mime_type=mime_type,
        file_size=len(file_content),
        file_path=file_path,
        is_image=is_image,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentResponse.model_validate(attachment)


def get_attachments_for_conversation(db: Session, conversation_id: int) -> list[AttachmentResponse]:
    """Get all attachments for a conversation."""
    attachments = (
        db.query(Attachment)
        .filter(Attachment.conversation_id == conversation_id)
        .order_by(Attachment.created_at.desc())
        .all()
    )
    return [AttachmentResponse.model_validate(a) for a in attachments]


def get_attachment_by_id(db: Session, attachment_id: int) -> Attachment | None:
    """Get an attachment by ID."""
    return db.query(Attachment).filter(Attachment.id == attachment_id).first()


def delete_attachment(db: Session, attachment_id: int, user_id: int, user_role: str) -> bool:
    """Delete an attachment. Only the uploader or admin can delete."""
    attachment = get_attachment_by_id(db, attachment_id)
    if not attachment:
        return False

    # Only allow uploader or admin to delete
    if attachment.uploaded_by_id != user_id and user_role != "admin":
        return False

    # Delete file from disk
    try:
        if os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    except OSError:
        pass  # File may not exist, continue with DB deletion

    db.delete(attachment)
    db.commit()
    return True
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.core.enums import MessageSenderType, MessageType
from app.db.session import get_db
from app.models.campaign import Campaign, CampaignMessage
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.campaign import (
    CampaignCreate,
    CampaignResponse,
    CampaignUpdate,
    CampaignMessageResponse,
    CampaignLaunch,
)
from app.services.conversation_service import generate_chat_id

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


def require_admin_or_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


# ===== Campaign Endpoints =====

@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    data: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a campaign."""
    campaign = Campaign(
        name=data.name,
        description=data.description,
        message_template=data.message_template,
        target_criteria=data.target_criteria,
        status="draft",
        created_by_id=current_user.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.get("", response_model=list[CampaignResponse])
def list_campaigns(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List campaigns."""
    query = db.query(Campaign)
    if status:
        query = query.filter(Campaign.status == status)
    return query.order_by(Campaign.created_at.desc()).all()


@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: int,
    data: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this campaign")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(campaign, field, value)

    db.commit()
    db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this campaign")

    db.delete(campaign)
    db.commit()
    return None


@router.post("/{campaign_id}/launch", response_model=dict)
def launch_campaign(
    campaign_id: int,
    data: CampaignLaunch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Launch a campaign - send messages to target customers."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to launch this campaign")

    if campaign.status != "draft":
        raise HTTPException(status_code=409, detail="Campaign is not in draft status")

    # Determine target customers
    if data.customer_ids:
        customer_ids = data.customer_ids
    else:
        # Use target criteria to find customers
        # For now, return all active customers if no criteria specified
        customers = db.query(User).filter(User.role == "customer", User.is_active == True).all()  # noqa: E712
        customer_ids = [c.id for c in customers]

    sent_count = 0
    failed_count = 0

    for customer_id in customer_ids:
        if data.dry_run:
            sent_count += 1
            continue

        # Render message template
        customer = db.query(User).filter(User.id == customer_id).first()
        if not customer:
            failed_count += 1
            continue

        message_content = campaign.message_template.replace("{{customer_name}}", customer.full_name or "Customer")
        message_content = message_content.replace("{{customer_email}}", customer.email)

        # Create or find an active conversation for this customer
        conversation = (
            db.query(Conversation)
            .filter(Conversation.customer_id == customer_id, Conversation.status.in_(["open", "pending", "assigned"]))
            .first()
        )
        if not conversation:
            conversation = Conversation(
                chat_id=generate_chat_id(db),
                customer_id=customer_id,
                subject=f"Campaign: {campaign.name}",
                status="pending",
            )
            db.add(conversation)
            db.commit()
            db.refresh(conversation)

        # Create campaign message record
        campaign_msg = CampaignMessage(
            campaign_id=campaign.id,
            customer_id=customer_id,
            conversation_id=conversation.id,
            status="sent",
            message_content=message_content,
            sent_at=datetime.utcnow(),
        )
        db.add(campaign_msg)

        # Create the actual message
        msg = Message(
            conversation_id=conversation.id,
            sender_id=None,
            sender_type=MessageSenderType.SYSTEM,
            message_type=MessageType.SYSTEM_EVENT,
            content=message_content,
            is_internal=False,
        )
        db.add(msg)

        sent_count += 1

    campaign.status = "completed"
    campaign.sent_count = sent_count
    campaign.delivered_count = sent_count
    campaign.failed_count = failed_count
    campaign.sent_at = datetime.utcnow()
    db.commit()

    return {
        "campaign_id": campaign.id,
        "sent": sent_count,
        "failed": failed_count,
        "total": len(customer_ids),
    }


@router.get("/{campaign_id}/messages", response_model=list[CampaignMessageResponse])
def list_campaign_messages(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List all messages sent in a campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    messages = (
        db.query(CampaignMessage)
        .filter(CampaignMessage.campaign_id == campaign_id)
        .order_by(CampaignMessage.created_at.desc())
        .all()
    )
    return messages
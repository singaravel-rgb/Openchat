import json
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.webhook import Webhook, WebhookDelivery
from app.models.user import User
from app.schemas.webhook import (
    WebhookCreate,
    WebhookDeliveryResponse,
    WebhookResponse,
    WebhookUpdate,
    WebhookTest,
)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def require_admin_or_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


# ===== Webhook Endpoints =====

@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
def create_webhook(
    data: WebhookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a webhook."""
    webhook = Webhook(
        name=data.name,
        url=data.url,
        secret=data.secret,
        events=json.dumps(data.events),
        is_active=data.is_active,
        created_by_id=current_user.id,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    return _webhook_to_response(webhook)


@router.get("", response_model=list[WebhookResponse])
def list_webhooks(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List webhooks."""
    query = db.query(Webhook)
    if is_active is not None:
        query = query.filter(Webhook.is_active == is_active)
    return [_webhook_to_response(w) for w in query.order_by(Webhook.name).all()]


@router.get("/{webhook_id}", response_model=WebhookResponse)
def get_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return _webhook_to_response(webhook)


@router.patch("/{webhook_id}", response_model=WebhookResponse)
def update_webhook(
    webhook_id: int,
    data: WebhookUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this webhook")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "events" and value is not None:
            setattr(webhook, field, json.dumps(value))
        else:
            setattr(webhook, field, value)

    db.commit()
    db.refresh(webhook)
    return _webhook_to_response(webhook)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this webhook")

    db.delete(webhook)
    db.commit()
    return None


@router.get("/{webhook_id}/deliveries", response_model=list[WebhookDeliveryResponse])
def list_webhook_deliveries(
    webhook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List delivery attempts for a webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    deliveries = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(50)
        .all()
    )
    return deliveries


@router.post("/{webhook_id}/test", response_model=WebhookDeliveryResponse)
def test_webhook(
    webhook_id: int,
    data: WebhookTest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Send a test payload to a webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to test this webhook")

    return _send_webhook(db, webhook, data.event, data.payload)


@router.post("/{webhook_id}/deliveries/{delivery_id}/retry", response_model=WebhookDeliveryResponse)
def retry_webhook_delivery(
    webhook_id: int,
    delivery_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Retry a failed webhook delivery."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    delivery = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.id == delivery_id, WebhookDelivery.webhook_id == webhook_id)
        .first()
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if webhook.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to retry this delivery")

    # Parse the original payload and resend
    try:
        original_payload = json.loads(delivery.payload)
    except json.JSONDecodeError:
        original_payload = {"raw": delivery.payload}

    return _send_webhook(db, webhook, delivery.event, original_payload)


# ===== Internal: Send webhook =====

def _webhook_to_response(webhook: Webhook) -> WebhookResponse:
    """Convert Webhook model to response schema."""
    return WebhookResponse(
        id=webhook.id,
        name=webhook.name,
        url=webhook.url,
        secret=webhook.secret,
        events=json.loads(webhook.events) if webhook.events else [],
        is_active=webhook.is_active,
        created_by_id=webhook.created_by_id,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


def _send_webhook(db: Session, webhook: Webhook, event: str, payload: dict) -> WebhookDeliveryResponse:
    """Send a webhook payload and record the delivery attempt."""
    start_time = time.time()
    response_status = None
    response_body = None

    try:
        headers = {"Content-Type": "application/json"}
        if webhook.secret:
            import hmac
            import hashlib

            payload_bytes = json.dumps(payload).encode()
            signature = hmac.new(
                webhook.secret.encode(), payload_bytes, hashlib.sha256
            ).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={signature}"

        with httpx.Client(timeout=10.0) as client:
            response = client.post(webhook.url, json=payload, headers=headers)
            response_status = response.status_code
            response_body = response.text[:1000]  # Truncate for storage

    except Exception as e:
        response_status = None
        response_body = str(e)[:1000]

    duration_ms = int((time.time() - start_time) * 1000)

    delivery = WebhookDelivery(
        webhook_id=webhook.id,
        event=event,
        payload=json.dumps(payload),
        response_status=response_status,
        response_body=response_body,
        duration_ms=duration_ms,
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)

    return WebhookDeliveryResponse(
        id=delivery.id,
        webhook_id=delivery.webhook_id,
        event=delivery.event,
        response_status=delivery.response_status,
        response_body=delivery.response_body,
        duration_ms=delivery.duration_ms,
        created_at=delivery.created_at,
    )
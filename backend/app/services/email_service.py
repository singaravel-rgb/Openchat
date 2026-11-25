import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings


def send_email_with_status(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> tuple[bool, str]:
    """Send an email via SMTP and return (success, honest_status)."""
    if not settings.smtp_user or not settings.smtp_password:
        return False, "skipped_unconfigured"

    msg = EmailMessage()
    msg["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    msg["To"] = to_email
    msg["Subject"] = subject

    if html_body:
        msg.set_content(body)
        msg.add_alternative(html_body, subtype="html")
    else:
        msg.set_content(body)

    try:
        if settings.smtp_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        return True, "sent"
    except Exception:
        return False, "failed"


def send_email(to_email: str, subject: str, body: str, html_body: str | None = None) -> bool:
    """Send an email via SMTP. Returns True if sent successfully."""
    ok, _ = send_email_with_status(to_email, subject, body, html_body)
    return ok
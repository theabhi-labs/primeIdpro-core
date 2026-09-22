import os
import base64
import logging
import asyncio
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from email.message import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

import jinja2
import httpx
import aiosmtplib
from fastapi import BackgroundTasks

from app.core.config import settings

logger = logging.getLogger("primeidpro.email")

TEMPLATES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "templates", "email")
)


class EmailService:
    """
    Two-tier transactional email delivery service for Prime ID Pro.
    - Tier 1 (Primary): Brevo Transactional Email HTTP API (api.brevo.com)
    - Tier 2 (Fallback): Brevo SMTP Relay (smtp-relay.brevo.com:587)

    Fails gracefully with structured logging; never raises exceptions to the caller.
    """

    def __init__(self):
        self.api_url = "https://api.brevo.com/v3/smtp/email"
        self.smtp_host = "smtp-relay.brevo.com"
        self.smtp_port = 587
        
        # Initialize Jinja2 environment
        if os.path.exists(TEMPLATES_DIR):
            self.jinja_env = jinja2.Environment(
                loader=jinja2.FileSystemLoader(TEMPLATES_DIR),
                autoescape=jinja2.select_autoescape(["html", "xml"]),
            )
        else:
            self.jinja_env = None
            logger.warning(f"Email templates directory not found at: {TEMPLATES_DIR}")

    def _render_template(self, template_name: str, context: Dict[str, Any]) -> str:
        """Renders an HTML email template with given context variables."""
        if not self.jinja_env:
            return f"<p>{context.get('content', '')}</p>"
        
        # Merge default context variables
        full_context = {
            "app_base_url": settings.app_base_url or "https://primeidpro.online",
            "mail_from_name": settings.mail_from_name or "Prime ID Pro",
            "year": datetime.now().year,
            **context,
        }
        
        template = self.jinja_env.get_template(template_name)
        return template.render(**full_context)

    def _extract_recipient(self, user_or_to: Union[str, Dict[str, str], Any]) -> tuple[str, str]:
        """Extracts (email, name) safely from string, dict, or user model."""
        if isinstance(user_or_to, str):
            return user_or_to.strip(), ""
        
        if isinstance(user_or_to, dict):
            email = user_or_to.get("email", "").strip()
            name = user_or_to.get("name") or user_or_to.get("full_name") or ""
            return email, name
        
        email = getattr(user_or_to, "email", "") or ""
        name = (
            getattr(user_or_to, "full_name", None)
            or getattr(user_or_to, "name", None)
            or getattr(user_or_to, "username", "")
            or ""
        )
        return str(email).strip(), str(name).strip()

    async def _send_via_brevo_api(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """Sends email via Brevo REST API v3."""
        if not settings.brevo_api_key:
            logger.warning("Brevo API key not configured, skipping HTTP API send.")
            return False

        headers = {
            "api-key": settings.brevo_api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        recipient_payload = {"email": to_email}
        if to_name:
            recipient_payload["name"] = to_name

        payload: Dict[str, Any] = {
            "sender": {
                "name": settings.mail_from_name or "Prime ID Pro",
                "email": settings.mail_from or "noreply@primeidpro.online",
            },
            "to": [recipient_payload],
            "subject": subject,
            "htmlContent": html_content,
        }

        # Format attachments if provided
        if attachments:
            formatted_attachments = []
            for att in attachments:
                content = att.get("content")
                if isinstance(content, bytes):
                    content_b64 = base64.b64encode(content).decode("utf-8")
                elif isinstance(content, str):
                    content_b64 = content
                else:
                    continue
                formatted_attachments.append({
                    "name": att.get("name", "attachment.pdf"),
                    "content": content_b64,
                })
            if formatted_attachments:
                payload["attachment"] = formatted_attachments

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(self.api_url, headers=headers, json=payload)
            if response.status_code in (200, 201, 202):
                logger.info(
                    "Email sent successfully | provider=brevo_api to=%s subject=%s messageId=%s",
                    to_email,
                    subject,
                    response.json().get("messageId", "ok"),
                )
                return True
            else:
                logger.warning(
                    "Brevo API returned error %s: %s | to=%s",
                    response.status_code,
                    response.text,
                    to_email,
                )
                return False

    async def _send_via_brevo_smtp(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """Fallback: Sends email via Brevo SMTP relay."""
        if not settings.brevo_smtp_user or not settings.brevo_smtp_password:
            logger.warning("Brevo SMTP credentials not configured, skipping SMTP send.")
            return False

        sender_email = settings.mail_from or "noreply@primeidpro.online"
        sender_name = settings.mail_from_name or "Prime ID Pro"

        msg = MIMEMultipart("mixed")
        msg["From"] = f"{sender_name} <{sender_email}>"
        msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
        msg["Subject"] = subject

        # HTML body
        html_part = MIMEText(html_content, "html", "utf-8")
        msg.attach(html_part)

        # Attachments
        if attachments:
            for att in attachments:
                raw_bytes = att.get("content")
                if isinstance(raw_bytes, str):
                    try:
                        raw_bytes = base64.b64decode(raw_bytes)
                    except Exception:
                        raw_bytes = raw_bytes.encode("utf-8")
                
                if isinstance(raw_bytes, bytes):
                    part = MIMEApplication(raw_bytes, Name=att.get("name", "attachment.pdf"))
                    part["Content-Disposition"] = f'attachment; filename="{att.get("name", "attachment.pdf")}"'
                    msg.attach(part)

        await aiosmtplib.send(
            msg,
            hostname=self.smtp_host,
            port=self.smtp_port,
            start_tls=True,
            username=settings.brevo_smtp_user,
            password=settings.brevo_smtp_password,
            timeout=15.0,
        )

        logger.info(
            "Email sent successfully | provider=brevo_smtp to=%s subject=%s",
            to_email,
            subject,
        )
        return True

    async def send_email(
        self,
        to: Union[str, Dict[str, str], Any],
        subject: str,
        template_name: str,
        context: Optional[Dict[str, Any]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """
        Renders template and sends transactional email using two-tier strategy:
        1. Brevo HTTP API (Primary)
        2. Brevo SMTP Relay (Fallback)
        """
        to_email, to_name = self._extract_recipient(to)
        if not to_email:
            logger.error("Email send aborted: recipient email address is empty.")
            return False

        ctx = context.copy() if context else {}
        if to_name and "user_name" not in ctx:
            ctx["user_name"] = to_name
        if "user_email" not in ctx:
            ctx["user_email"] = to_email

        try:
            html_content = self._render_template(template_name, ctx)
        except Exception as e:
            logger.error("Failed to render email template '%s': %s", template_name, e)
            return False

        # 1. PRIMARY: Brevo HTTP API
        try:
            sent = await self._send_via_brevo_api(
                to_email=to_email,
                to_name=to_name,
                subject=subject,
                html_content=html_content,
                attachments=attachments,
            )
            if sent:
                return True
        except Exception as api_err:
            logger.warning(
                "Brevo API send attempt failed: %s. Initiating SMTP fallback for %s.",
                api_err,
                to_email,
            )

        # 2. FALLBACK: Brevo SMTP Relay
        try:
            sent = await self._send_via_brevo_smtp(
                to_email=to_email,
                to_name=to_name,
                subject=subject,
                html_content=html_content,
                attachments=attachments,
            )
            if sent:
                return True
        except Exception as smtp_err:
            logger.error(
                "All email providers failed for recipient=%s subject='%s'. Final error: %s",
                to_email,
                subject,
                smtp_err,
            )

        return False

    def _dispatch(
        self,
        to: Union[str, Dict[str, str], Any],
        subject: str,
        template_name: str,
        context: Optional[Dict[str, Any]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        background_tasks: Optional[BackgroundTasks] = None,
    ):
        """Dispatches email send via BackgroundTasks or runs safely in asyncio event loop."""
        if background_tasks is not None:
            background_tasks.add_task(
                self.send_email,
                to=to,
                subject=subject,
                template_name=template_name,
                context=context,
                attachments=attachments,
            )
            return

        # If no background_tasks provided, schedule in current running loop or background thread
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(
                self.send_email(
                    to=to,
                    subject=subject,
                    template_name=template_name,
                    context=context,
                    attachments=attachments,
                )
            )
        except RuntimeError:
            # No running event loop in thread; run in separate thread to avoid blocking
            import threading
            threading.Thread(
                target=lambda: asyncio.run(
                    self.send_email(
                        to=to,
                        subject=subject,
                        template_name=template_name,
                        context=context,
                        attachments=attachments,
                    )
                ),
                daemon=True,
            ).start()

    # =========================================================================
    # Wrapper Methods
    # =========================================================================

    def send_otp_verification_email(
        self,
        user: Any,
        otp_code: str,
        background_tasks: Optional[BackgroundTasks] = None,
    ):
        """Sends 6-digit OTP verification code email."""
        self._dispatch(
            to=user,
            subject="Your Prime ID Pro Verification Code",
            template_name="otp_verification.html",
            context={"otp_code": otp_code},
            background_tasks=background_tasks,
        )

    def send_password_reset_email(
        self,
        user: Any,
        reset_link: str,
        background_tasks: Optional[BackgroundTasks] = None,
    ):
        """Sends secure password reset link email."""
        self._dispatch(
            to=user,
            subject="Reset Your Prime ID Pro Password",
            template_name="password_reset.html",
            context={"reset_link": reset_link},
            background_tasks=background_tasks,
        )

    def send_welcome_email(
        self,
        user: Any,
        plan_name: str = "Starter",
        background_tasks: Optional[BackgroundTasks] = None,
    ):
        """Sends welcome and account activation email."""
        self._dispatch(
            to=user,
            subject="Welcome to Prime ID Pro!",
            template_name="welcome.html",
            context={"plan_name": plan_name},
            background_tasks=background_tasks,
        )

    def send_payment_invoice_email(
        self,
        user: Any,
        invoice_pdf_bytes: Optional[bytes] = None,
        amount: float = 0.0,
        order_id: str = "",
        background_tasks: Optional[BackgroundTasks] = None,
    ):
        """Sends payment confirmation and attached PDF invoice email."""
        attachments = None
        if invoice_pdf_bytes:
            attachments = [{
                "name": f"Invoice_{order_id or 'PrimeIDPro'}.pdf",
                "content": invoice_pdf_bytes,
            }]

        self._dispatch(
            to=user,
            subject=f"Payment Receipt & Invoice #{order_id or 'Order'}",
            template_name="payment_invoice.html",
            context={
                "amount": f"{amount:.2f}" if isinstance(amount, (int, float)) else str(amount),
                "order_id": order_id,
            },
            attachments=attachments,
            background_tasks=background_tasks,
        )

    def send_credits_exhausted_email(
        self,
        user: Any,
        recharge_link: Optional[str] = None,
        background_tasks: Optional[BackgroundTasks] = None,
    ):
        """Sends low/exhausted credit balance warning email."""
        link = recharge_link or (
            f"{settings.app_base_url}/recharge"
            if settings.app_base_url
            else "https://primeidpro.online/recharge"
        )
        self._dispatch(
            to=user,
            subject="Action Required: Your Print Credits Are Exhausted",
            template_name="credits_exhausted.html",
            context={"recharge_link": link},
            background_tasks=background_tasks,
        )


email_service = EmailService()

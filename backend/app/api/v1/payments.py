import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Header, Request, BackgroundTasks, status

from app.core.config import settings
from app.core.razorpay_client import razorpay_client
from app.models.user import User
from app.models.subscription import Subscription, PLANS
from app.core.security import decode_access_token
from app.services.credit_wallet import add_credits
from app.services.email_service import email_service
from app.services.invoice_service import invoice_service

logger = logging.getLogger("primeidpro.payment")
router = APIRouter(prefix="/payments", tags=["Payments & Subscriptions"])


# =========================================================================
# Auth Dependency
# =========================================================================

async def get_current_user(request: Request) -> User:
    """
    Extracts authenticated User document from Bearer JWT access token.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer token.",
        )

    token = auth_header.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
        )

    email = payload.get("sub")
    user = None
    if email:
        user = await User.find_one(User.email == email.lower().strip())
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Authenticated user account not found.",
        )

    return user


# =========================================================================
# Request / Response Schemas
# =========================================================================

class CreateOrderRequest(BaseModel):
    plan_id: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# =========================================================================
# Endpoints
# =========================================================================

@router.get("/plans")
async def get_plans():
    """
    Returns available studio subscription and credit plans.
    """
    return {"plans": list(PLANS.values())}


@router.post("/create-order")
async def create_order(
    req: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new Razorpay checkout order and pending Subscription record.
    """
    plan = PLANS.get(req.plan_id.lower().strip())
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan_id '{req.plan_id}'. Available plans: {', '.join(PLANS.keys())}",
        )

    amount_inr = plan["amount"]
    amount_paise = int(round(amount_inr * 100))
    receipt_id = f"rcpt_{int(datetime.utcnow().timestamp())}_{str(current_user.id)[:6]}"

    # Check if this is the user's first active purchase
    prior_active = await Subscription.find_one(
        Subscription.user_id == current_user.id,
        Subscription.status == "active",
    )
    is_first = prior_active is None

    try:
        rzp_order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt_id,
            "notes": {
                "plan_id": plan["plan_id"],
                "user_id": str(current_user.id),
                "user_email": current_user.email,
            },
        })
    except Exception as e:
        logger.error("Razorpay order creation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment gateway initialization failed: {str(e)}",
        )

    # Save pending Subscription record
    subscription = Subscription(
        user_id=current_user.id,
        plan_id=plan["plan_id"],
        plan_name=plan["name"],
        amount=amount_inr,
        credits_allocated=plan["credits"],
        billing_cycle=plan.get("billing_cycle", "monthly"),
        status="pending",
        razorpay_order_id=rzp_order["id"],
        is_first_purchase=is_first,
        created_at=datetime.utcnow(),
    )
    await subscription.insert()

    logger.info(
        "Created payment order %s for user %s (Plan: %s, Amount: ₹%s)",
        rzp_order["id"],
        current_user.email,
        plan["name"],
        amount_inr,
    )

    return {
        "order_id": rzp_order["id"],
        "amount": rzp_order["amount"],
        "currency": rzp_order["currency"],
        "key_id": settings.razorpay_key_id,
    }


@router.post("/verify")
async def verify_payment(
    req: VerifyPaymentRequest,
    background_tasks: BackgroundTasks,
):
    """
    Verifies cryptographic payment signature, activates subscription, tops up credits,
    generates PDF tax invoice, and dispatches invoice/welcome emails.
    """
    # 1. Cryptographic Signature Verification
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": req.razorpay_order_id,
            "razorpay_payment_id": req.razorpay_payment_id,
            "razorpay_signature": req.razorpay_signature,
        })
    except Exception as sig_err:
        logger.warning(
            "Cryptographic signature verification failed for order %s: %s",
            req.razorpay_order_id,
            sig_err,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cryptographic payment signature.",
        )

    # 2. Look up Subscription
    subscription = await Subscription.find_one(
        Subscription.razorpay_order_id == req.razorpay_order_id
    )
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated subscription record not found.",
        )

    # Idempotency Guard: prevent double-processing or double-crediting
    if subscription.status == "active":
        logger.info(
            "Payment for order %s already verified and active (idempotent no-op).",
            req.razorpay_order_id,
        )
        return {
            "message": "Payment already verified and subscription is active.",
            "subscription_status": "active",
        }

    # 3. Look up User
    user = await User.get(subscription.user_id)

    # 4. Activate Subscription
    now = datetime.utcnow()
    subscription.status = "active"
    subscription.razorpay_payment_id = req.razorpay_payment_id
    subscription.started_at = now
    if subscription.billing_cycle == "monthly":
        subscription.expires_at = now + timedelta(days=30)
    elif subscription.billing_cycle == "yearly":
        subscription.expires_at = now + timedelta(days=365)
    else:
        subscription.expires_at = None

    # 5. Top up Credit Balance via credit_wallet
    add_credits(
        count=subscription.credits_allocated,
        description=f"Purchase: {subscription.plan_name} (+{subscription.credits_allocated} Credits)",
    )

    # 6. Generate PDF Invoice
    invoice_bytes = invoice_service.generate_invoice_pdf(
        subscription=subscription,
        user=user or {"email": "customer@primeidpro.online", "name": "Valued Partner"},
    )

    # 7. Asynchronous Email Notifications
    if user:
        email_service.send_payment_invoice_email(
            user=user,
            invoice_pdf_bytes=invoice_bytes,
            amount=subscription.amount,
            order_id=subscription.razorpay_order_id or req.razorpay_payment_id,
            background_tasks=background_tasks,
        )

        if subscription.is_first_purchase:
            email_service.send_welcome_email(
                user=user,
                plan_name=subscription.plan_name,
                background_tasks=background_tasks,
            )
            subscription.is_first_purchase = False

    await subscription.save()

    logger.info(
        "✅ Payment verified for order %s. Activated plan %s (+%s credits) for %s",
        req.razorpay_order_id,
        subscription.plan_name,
        subscription.credits_allocated,
        getattr(user, "email", "N/A"),
    )

    return {
        "message": "Payment verified successfully and plan activated.",
        "subscription_status": "active",
    }


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_razorpay_signature: Optional[str] = Header(None),
):
    """
    Server-to-server Razorpay webhook handler (idempotent).
    """
    raw_body = await request.body()
    raw_body_str = raw_body.decode("utf-8")

    # 1. Cryptographic Signature Verification
    if settings.razorpay_webhook_secret:
        try:
            razorpay_client.utility.verify_webhook_signature(
                raw_body_str,
                x_razorpay_signature or "",
                settings.razorpay_webhook_secret,
            )
        except Exception as e:
            logger.warning("Razorpay webhook signature verification failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook signature.",
            )

    try:
        event = json.loads(raw_body_str)
    except Exception:
        return {"status": "ok"}

    event_type = event.get("event")
    logger.info("Processing Razorpay webhook event: %s", event_type)

    if event_type in ("payment.captured", "order.paid"):
        payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id") or event.get("payload", {}).get("order", {}).get("entity", {}).get("id")
        payment_id = payment_entity.get("id")

        if order_id:
            subscription = await Subscription.find_one(
                Subscription.razorpay_order_id == order_id
            )
            # Idempotent: process only if not already active
            if subscription and subscription.status != "active":
                user = await User.get(subscription.user_id)
                now = datetime.utcnow()
                subscription.status = "active"
                subscription.razorpay_payment_id = payment_id
                subscription.started_at = now
                if subscription.billing_cycle == "monthly":
                    subscription.expires_at = now + timedelta(days=30)
                elif subscription.billing_cycle == "yearly":
                    subscription.expires_at = now + timedelta(days=365)
                else:
                    subscription.expires_at = None

                add_credits(
                    count=subscription.credits_allocated,
                    description=f"Webhook Purchase: {subscription.plan_name} (+{subscription.credits_allocated} Credits)",
                )

                invoice_bytes = invoice_service.generate_invoice_pdf(
                    subscription=subscription,
                    user=user or {"email": "customer@primeidpro.online"},
                )

                if user:
                    email_service.send_payment_invoice_email(
                        user=user,
                        invoice_pdf_bytes=invoice_bytes,
                        amount=subscription.amount,
                        order_id=order_id,
                        background_tasks=background_tasks,
                    )
                    if subscription.is_first_purchase:
                        email_service.send_welcome_email(
                            user=user,
                            plan_name=subscription.plan_name,
                            background_tasks=background_tasks,
                        )
                        subscription.is_first_purchase = False

                await subscription.save()
                logger.info("Webhook activated subscription for order %s", order_id)

    elif event_type == "payment.failed":
        payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        if order_id:
            subscription = await Subscription.find_one(
                Subscription.razorpay_order_id == order_id
            )
            if subscription and subscription.status == "pending":
                subscription.status = "failed"
                await subscription.save()
                logger.info("Webhook marked subscription as failed for order %s", order_id)

    return {"status": "ok"}

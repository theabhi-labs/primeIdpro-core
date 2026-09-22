from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import Field
from beanie import Document, PydanticObjectId

# Standard Pricing Plans for Prime ID Pro Studio
PLANS: Dict[str, Dict[str, Any]] = {
    "starter": {
        "plan_id": "starter",
        "name": "Starter Studio Pack",
        "amount": 299.0,
        "credits": 200,
        "billing_cycle": "one_time",
        "description": "200 AI Biometric & Passport Print Credits",
    },
    "growth": {
        "plan_id": "growth",
        "name": "Growth Studio Monthly",
        "amount": 599.0,
        "credits": 500,
        "billing_cycle": "monthly",
        "description": "500 AI Biometric & PVC ID Print Credits / Month",
    },
    "pro": {
        "plan_id": "pro",
        "name": "Pro Studio Unlimited",
        "amount": 999.0,
        "credits": 1200,
        "billing_cycle": "monthly",
        "description": "1,200 AI Biometric & Passport Print Credits / Month",
    },
}


class Subscription(Document):
    """
    Beanie Document model for user plan purchases & subscriptions.
    """
    user_id: PydanticObjectId
    plan_id: str
    plan_name: str
    amount: float
    credits_allocated: int
    billing_cycle: str = "monthly"  # "monthly" | "yearly" | "one_time"
    status: str = "pending"         # "pending" | "active" | "expired" | "failed"
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    is_first_purchase: bool = True   # used to decide whether to send welcome_email
    started_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "subscriptions"

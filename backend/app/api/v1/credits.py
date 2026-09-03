from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter

from app.services.credit_wallet import (
    get_wallet_status,
    deduct_credits,
    connect_online_account,
    disconnect_account,
)

credit_router = APIRouter(prefix="/credits", tags=["Credits & License"])


class DeductCreditRequest(BaseModel):
    type: str = Field(..., description="'passport' (2 tokens) or 'card' (5 tokens per card)")
    count: int = Field(default=1, description="Number of units to print/generate")
    description: Optional[str] = None


class ConnectAccountRequest(BaseModel):
    accountId: str = Field(..., description="Account Email on primeidpro.online")
    licenseKey: str = Field(..., description="License Key or Password")


@credit_router.get("/status")
async def get_status():
    """Returns current wallet balance, connection status, and rates."""
    return get_wallet_status()


@credit_router.post("/deduct")
async def deduct(req: DeductCreditRequest):
    """
    Deducts tokens for printing/exporting:
    - Passport photo: 2 tokens
    - ID card: 5 tokens per card
    """
    return deduct_credits(action_type=req.type, count=req.count, description=req.description)


@credit_router.post("/connect")
async def connect(req: ConnectAccountRequest):
    """Connects application with primeidpro.online account."""
    return connect_online_account(account_id=req.accountId, license_key=req.licenseKey)


@credit_router.post("/disconnect")
async def disconnect():
    """Disconnects account."""
    return disconnect_account()

import os
import json
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, HTTPException, BackgroundTasks, status

from app.core.config import settings
from app.models.user import User
from app.core.security import (
    get_password_hash,
    verify_password,
    generate_numeric_otp,
    generate_reset_token,
    create_access_token,
)
from app.services.email_service import email_service
from app.services.credit_wallet import connect_online_account

router = APIRouter(prefix="/auth", tags=["Auth"])

# We'll use a local json file in the user's home directory to store the auth state
# so it doesn't get packaged into the electron distribution
AUTH_STORE_PATH = os.path.join(os.path.expanduser("~"), ".primeidpro", "auth_store.json")


# =========================================================================
# Schemas
# =========================================================================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp_code: str


class ResendOtpRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# =========================================================================
# Endpoints
# =========================================================================

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, background_tasks: BackgroundTasks):
    """
    Register a new user account and dispatch 6-digit OTP verification email.
    """
    email_clean = req.email.lower().strip()
    
    # Check if user already exists
    existing_user = await User.find_one(User.email == email_clean)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    # Hash password and generate OTP (10 min expiry)
    hashed_pwd = get_password_hash(req.password)
    otp = generate_numeric_otp(6)
    otp_exp = datetime.utcnow() + timedelta(minutes=10)

    user = User(
        email=email_clean,
        hashed_password=hashed_pwd,
        full_name=req.full_name.strip() if req.full_name else None,
        email_verified=False,
        otp_code=otp,
        otp_expiry=otp_exp,
        otp_attempts=0,
        created_at=datetime.utcnow(),
        is_active=True,
    )
    await user.insert()

    # Dispatch verification email in background
    email_service.send_otp_verification_email(
        user=user,
        otp_code=otp,
        background_tasks=background_tasks,
    )

    return {
        "message": "Registration successful. Please verify your email with the OTP sent.",
        "email": email_clean,
    }


@router.post("/verify-otp")
async def verify_otp(req: VerifyOtpRequest):
    """
    Verifies 6-digit OTP code. On 3 failed attempts, the OTP is invalidated.
    """
    email_clean = req.email.lower().strip()
    user = await User.find_one(User.email == email_clean)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if user.email_verified:
        token = create_access_token(data={"sub": user.email, "user_id": str(user.id)})
        return {
            "message": "Email is already verified.",
            "token": token,
            "email": user.email,
        }

    if not user.otp_code or not user.otp_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification code found. Please request a new OTP.",
        )

    if datetime.utcnow() > user.otp_expiry:
        user.otp_code = None
        user.otp_expiry = None
        user.otp_attempts = 0
        await user.save()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new one.",
        )

    # Validate OTP matching
    if user.otp_code.strip() != req.otp_code.strip():
        user.otp_attempts += 1
        if user.otp_attempts >= 3:
            user.otp_code = None
            user.otp_expiry = None
            user.otp_attempts = 0
            await user.save()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many invalid attempts. OTP has been invalidated. Please request a new OTP via resend.",
            )
        await user.save()
        remaining = 3 - user.otp_attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP code. {remaining} attempt(s) remaining.",
        )

    # Success: verify user and clear OTP fields
    user.email_verified = True
    user.otp_code = None
    user.otp_expiry = None
    user.otp_attempts = 0
    await user.save()

    token = create_access_token(data={"sub": user.email, "user_id": str(user.id)})
    return {
        "message": "Email verified successfully.",
        "token": token,
        "email": user.email,
    }


@router.post("/resend-otp")
async def resend_otp(req: ResendOtpRequest, background_tasks: BackgroundTasks):
    """
    Resends a new 6-digit OTP code (rate-limited to 1 request per 60 seconds).
    """
    email_clean = req.email.lower().strip()
    user = await User.find_one(User.email == email_clean)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if user.email_verified:
        return {
            "message": "Email is already verified.",
            "email": user.email,
        }

    # Rate limiting: 60 seconds cooldown check
    if user.otp_expiry:
        remaining_seconds = (user.otp_expiry - datetime.utcnow()).total_seconds()
        # 10 min total expiry = 600s; if > 540s left, last OTP was generated < 60s ago
        if remaining_seconds > 540:
            retry_after = int(remaining_seconds - 540)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {retry_after} second(s) before requesting another OTP.",
            )

    new_otp = generate_numeric_otp(6)
    user.otp_code = new_otp
    user.otp_expiry = datetime.utcnow() + timedelta(minutes=10)
    user.otp_attempts = 0
    await user.save()

    email_service.send_otp_verification_email(
        user=user,
        otp_code=new_otp,
        background_tasks=background_tasks,
    )

    return {
        "message": "A new verification OTP has been sent to your email.",
        "email": user.email,
    }


@router.post("/login")
async def login(req: LoginRequest):
    """
    Login to web platform and register device.
    Enforces verified email check.
    """
    email_clean = req.email.lower().strip()

    # Check email verification status if registered in database
    user = await User.find_one(User.email == email_clean)
    if user and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email first.",
        )

    # This authenticates with central platform and registers this physical device
    wallet_status = connect_online_account(req.email, req.password)
    token = wallet_status.get("deviceToken", "fallback_token")
    
    # Save securely locally to maintain auth state
    os.makedirs(os.path.dirname(AUTH_STORE_PATH), exist_ok=True)
    with open(AUTH_STORE_PATH, "w") as f:
        json.dump({"token": token, "email": req.email, "loggedIn": True}, f)
    
    return {
        "success": True,
        "token": token,
        "message": "Login successful",
        "wallet": wallet_status,
    }


@router.get("/status")
async def check_status():
    """Check if the user is already authenticated locally."""
    try:
        if os.path.exists(AUTH_STORE_PATH):
            with open(AUTH_STORE_PATH, "r") as f:
                data = json.load(f)
            if data.get("loggedIn"):
                return {"success": True, "loggedIn": True, "email": data.get("email")}
    except Exception:
        pass
    return {"success": True, "loggedIn": False}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    """
    Generates a secure password reset token and emails a reset link.
    Returns generic success to prevent email enumeration.
    """
    email_clean = req.email.lower().strip()
    user = await User.find_one(User.email == email_clean)

    if user:
        reset_token = generate_reset_token()
        user.reset_token = reset_token
        user.reset_token_expiry = datetime.utcnow() + timedelta(minutes=15)
        await user.save()

        base_url = settings.app_base_url or "https://primeidpro.online"
        reset_link = f"{base_url}/reset-password?token={reset_token}"

        email_service.send_password_reset_email(
            user=user,
            reset_link=reset_link,
            background_tasks=background_tasks,
        )

    return {
        "message": "If this email is registered, a password reset link has been sent.",
        "email": email_clean,
    }


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """
    Resets the user's password using the secure reset token.
    """
    token_clean = req.token.strip()
    user = await User.find_one(User.reset_token == token_clean)

    if not user or not user.reset_token_expiry or datetime.utcnow() > user.reset_token_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    # Hash new password and clear token fields
    user.hashed_password = get_password_hash(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    await user.save()

    return {
        "message": "Password reset successfully. You can now log in with your new password.",
    }

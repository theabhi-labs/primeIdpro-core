import os
import json
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/auth", tags=["Auth"])

# We'll use a local json file in the user's home directory to store the auth state
# so it doesn't get packaged into the electron distribution
AUTH_STORE_PATH = os.path.join(os.path.expanduser("~"), ".primeidpro", "auth_store.json")

class LoginRequest(BaseModel):
    email: str
    password: str

from app.services.credit_wallet import connect_online_account

@router.post("/login")
async def login(req: LoginRequest):
    """
    Login to web platform and register device.
    """
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
        "wallet": wallet_status
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

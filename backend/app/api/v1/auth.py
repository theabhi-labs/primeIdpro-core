import os
import json
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/auth", tags=["Auth"])

# We'll use a local json file to store the auth state for now
AUTH_STORE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "core", "auth_store.json")

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(req: LoginRequest):
    """
    Mock login to web platform.
    In real production, this would call the remote web API.
    """
    # Simple mock authentication
    if req.email and req.password:
        token = "mock_jwt_token_from_web_api"
        # Save securely locally
        with open(AUTH_STORE_PATH, "w") as f:
            json.dump({"token": token, "email": req.email, "loggedIn": True}, f)
        
        return {
            "success": True,
            "token": token,
            "message": "Login successful"
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")

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

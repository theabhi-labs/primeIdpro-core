import os
import sys
import json
import time
import uuid
import hashlib
import logging
from typing import Dict, Any, Optional
from fastapi import HTTPException
from app.core.config import APP_DIR

logger = logging.getLogger("primeidpro.credits")

WALLET_FILE = os.path.join(APP_DIR, "processed", "license_wallet.json")
DEFAULT_FREE_CREDITS = 20
PASSPORT_COST = 2
CARD_COST_PER_UNIT = 5


def get_machine_hardware_id() -> str:
    """Returns unique, immutable hardware machine ID based on Windows MachineGUID and hardware node."""
    guid = ""
    try:
        if sys.platform == "win32":
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography")
            guid, _ = winreg.QueryValueEx(key, "MachineGuid")
            winreg.CloseKey(key)
    except Exception:
        pass

    if not guid:
        guid = str(uuid.getnode())

    raw = f"{guid}_{uuid.getnode()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20].upper()


def get_machine_lock_file() -> str:
    """Path to persistent machine lock file in AppData."""
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    lock_dir = os.path.join(appdata, "PrimeIDPro")
    os.makedirs(lock_dir, exist_ok=True)
    return os.path.join(lock_dir, ".sys_machine.lock")


def is_machine_welcome_claimed(machine_id: str) -> bool:
    """Checks if this physical hardware machine has already claimed 20 free welcome tokens."""
    lock_file = get_machine_lock_file()
    if os.path.exists(lock_file):
        try:
            with open(lock_file, "r", encoding="utf-8") as f:
                claimed_list = json.load(f)
                if isinstance(claimed_list, list) and machine_id in claimed_list:
                    return True
        except Exception:
            pass
    return False


def mark_machine_welcome_claimed(machine_id: str):
    """Permanently records that this physical machine has claimed its one-time free welcome tokens."""
    lock_file = get_machine_lock_file()
    claimed_list = []
    if os.path.exists(lock_file):
        try:
            with open(lock_file, "r", encoding="utf-8") as f:
                claimed_list = json.load(f)
                if not isinstance(claimed_list, list):
                    claimed_list = []
        except Exception:
            claimed_list = []

    if machine_id not in claimed_list:
        claimed_list.append(machine_id)
        try:
            with open(lock_file, "w", encoding="utf-8") as f:
                json.dump(claimed_list, f)
        except Exception as e:
            logger.warning(f"Could not write machine lock: {e}")


def _load_wallet() -> Dict[str, Any]:
    machine_id = get_machine_hardware_id()
    if os.path.exists(WALLET_FILE):
        try:
            with open(WALLET_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    data["machineId"] = machine_id
                    return data
        except Exception as e:
            logger.error(f"Error reading wallet file: {e}")

    wallet = {
        "machineId": machine_id,
        "credits": 0,
        "isConnected": False,
        "connectedAccount": None,
        "licenseKey": None,
        "tier": "UNCONNECTED",
        "createdAt": int(time.time()),
        "transactions": [],
    }
    _save_wallet(wallet)
    return wallet


def _save_wallet(wallet: Dict[str, Any]):
    os.makedirs(os.path.dirname(WALLET_FILE), exist_ok=True)
    with open(WALLET_FILE, "w", encoding="utf-8") as f:
        json.dump(wallet, f, indent=2)


def get_wallet_status() -> Dict[str, Any]:
    wallet = _load_wallet()
    machine_id = get_machine_hardware_id()
    already_claimed = is_machine_welcome_claimed(machine_id)

    return {
        "machineId": machine_id,
        "welcomeClaimed": already_claimed,
        "credits": wallet.get("credits", 0),
        "isConnected": bool(wallet.get("isConnected", False)),
        "connectedAccount": wallet.get("connectedAccount"),
        "licenseKey": wallet.get("licenseKey"),
        "tier": wallet.get("tier", "UNCONNECTED"),
        "rates": {
            "passportPhotoPrint": PASSPORT_COST,
            "idCardPrintPerUnit": CARD_COST_PER_UNIT,
        },
        "transactions": wallet.get("transactions", [])[-15:],
    }


def connect_online_account(account_id: str, license_key: str) -> Dict[str, Any]:
    """Connects desktop app with primeidpro.online account and strictly binds to physical machine hardware."""
    if not account_id or not license_key:
        raise HTTPException(status_code=400, detail="Account Email/ID and License Key are required.")

    wallet = _load_wallet()
    machine_id = get_machine_hardware_id()
    already_claimed = is_machine_welcome_claimed(machine_id)

    wallet["machineId"] = machine_id
    wallet["isConnected"] = True
    wallet["connectedAccount"] = account_id.strip()
    wallet["licenseKey"] = license_key.strip()
    wallet["tier"] = "WEB_CONNECTED"

    # Anti-Abuse: One-time 20 Free Welcome Tokens per physical machine
    if not already_claimed and wallet.get("credits", 0) == 0:
        wallet["credits"] = DEFAULT_FREE_CREDITS
        mark_machine_welcome_claimed(machine_id)
        tx = {
            "id": f"tx_{int(time.time())}_welcome",
            "timestamp": int(time.time()),
            "type": "CREDIT",
            "description": f"Welcome Credits: Connected with {account_id.strip()} (Machine: {machine_id})",
            "amount": DEFAULT_FREE_CREDITS,
            "balanceAfter": DEFAULT_FREE_CREDITS,
        }
        wallet.setdefault("transactions", []).append(tx)
        logger.info(f"🎉 One-Time Welcome Bonus awarded to Machine {machine_id} for account {account_id}")
    elif already_claimed:
        logger.info(f"ℹ️ Machine {machine_id} already claimed welcome bonus. Connecting account {account_id} with existing balance {wallet.get('credits', 0)}.")

    _save_wallet(wallet)
    return get_wallet_status()


def deduct_credits(action_type: str, count: int = 1, description: Optional[str] = None) -> Dict[str, Any]:
    """
    Deducts tokens based on action:
      - 'passport': 2 tokens per sheet / print
      - 'card': 5 tokens per ID card
    """
    wallet = _load_wallet()

    if not wallet.get("isConnected"):
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Account Connection Required. Please connect your PrimeIdPro.online account to print or export.",
                "action": "CONNECT_REQUIRED",
                "connectUrl": "https://primeidpro.online/login",
            },
        )

    current_balance = wallet.get("credits", 0)

    if action_type == "passport":
        cost = PASSPORT_COST * max(1, count)
        desc = description or f"Passport Photo Export/Print ({count} sheet{'s' if count > 1 else ''})"
    elif action_type == "card":
        cost = CARD_COST_PER_UNIT * max(1, count)
        desc = description or f"Card Studio ID Card Export/Print ({count} card{'s' if count > 1 else ''})"
    else:
        cost = count
        desc = description or "Custom Export Action"

    if current_balance < cost:
        raise HTTPException(
            status_code=402,
            detail={
                "message": f"Insufficient Token Balance! Required: {cost} tokens, Available: {current_balance} tokens.",
                "required": cost,
                "available": current_balance,
                "action": "RECHARGE_REQUIRED",
                "connectUrl": "https://primeidpro.online/billing",
            },
        )

    new_balance = current_balance - cost
    wallet["credits"] = new_balance

    tx = {
        "id": f"tx_{int(time.time())}_{action_type}",
        "timestamp": int(time.time()),
        "type": "DEBIT",
        "description": desc,
        "amount": -cost,
        "balanceAfter": new_balance,
    }
    wallet.setdefault("transactions", []).append(tx)
    _save_wallet(wallet)

    logger.info(f"[TOKEN DEBIT] Deducted {cost} tokens for {action_type}. Remaining: {new_balance}")
    return {
        "success": True,
        "deducted": cost,
        "remainingCredits": new_balance,
        "transactionId": tx["id"],
    }


def disconnect_account() -> Dict[str, Any]:
    """Disconnects account."""
    wallet = _load_wallet()
    wallet["isConnected"] = False
    wallet["connectedAccount"] = None
    wallet["licenseKey"] = None
    wallet["tier"] = "UNCONNECTED"
    _save_wallet(wallet)
    return get_wallet_status()

import os
import sys
import json
import time
import uuid
import hashlib
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, Optional
from fastapi import HTTPException
from app.core.config import APP_DIR

logger = logging.getLogger("primeidpro.credits")

WALLET_FILE = os.path.join(APP_DIR, "processed", "license_wallet.json")
DEFAULT_FREE_CREDITS = 20
PASSPORT_COST = 2
CARD_COST_PER_UNIT = 5

CENTRAL_API_URL = os.environ.get(
    "PRIMEIDPRO_CENTRAL_API",
    "https://primeidpro-central-platform.onrender.com/api/v1"
)

_last_remote_sync_time = 0


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
        "deviceToken": None,
        "centerCode": None,
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


def sync_cloud_wallet_balance(wallet: Dict[str, Any], force: bool = False):
    """Syncs live token balance directly from primeidpro.online cloud database."""
    global _last_remote_sync_time
    now = time.time()
    if not force and (now - _last_remote_sync_time) < 4:
        return

    account_id = wallet.get("connectedAccount")
    if not wallet.get("isConnected") or not account_id:
        return

    _last_remote_sync_time = now
    try:
        machine_id = get_machine_hardware_id()
        req_url = f"{CENTRAL_API_URL}/devices/sync-wallet"
        payload = {
            "email": account_id.strip(),
            "installationId": machine_id
        }
        req = urllib.request.Request(
            req_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "PrimeIDPro-Desktop/1.0.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            res_body = res.read().decode("utf-8")
            parsed = json.loads(res_body)
            if parsed.get("success"):
                data = parsed.get("data", {})
                cloud_bal = data.get("walletBalance")
                if cloud_bal is not None:
                    wallet["credits"] = int(cloud_bal)
                    if data.get("centerCode"):
                        wallet["centerCode"] = data.get("centerCode")
                    _save_wallet(wallet)
                    logger.info(f"🔄 Live synced with PrimeIDPro.online: {cloud_bal} tokens for {account_id}")
    except Exception as e:
        logger.debug(f"Live balance sync check: {e}")


def get_wallet_status() -> Dict[str, Any]:
    wallet = _load_wallet()
    machine_id = get_machine_hardware_id()
    already_claimed = is_machine_welcome_claimed(machine_id)

    # Sync live tokens from primeidpro.online if connected
    if wallet.get("isConnected"):
        sync_cloud_wallet_balance(wallet)

    return {
        "machineId": machine_id,
        "welcomeClaimed": already_claimed,
        "credits": wallet.get("credits", 0),
        "isConnected": bool(wallet.get("isConnected", False)),
        "connectedAccount": wallet.get("connectedAccount"),
        "licenseKey": wallet.get("licenseKey"),
        "tier": wallet.get("tier", "UNCONNECTED"),
        "centerCode": wallet.get("centerCode"),
        "rates": {
            "passportPhotoPrint": PASSPORT_COST,
            "idCardPrintPerUnit": CARD_COST_PER_UNIT,
        },
        "transactions": wallet.get("transactions", [])[-15:],
    }


def connect_online_account(account_id: str, license_key: str) -> Dict[str, Any]:
    """
    Connects desktop app with primeidpro.online account by authenticating directly
    against the Central Server API and registering this physical machine hardware.
    """
    if not account_id or not license_key:
        raise HTTPException(status_code=400, detail="Account Email/ID and Password are required.")

    machine_id = get_machine_hardware_id()
    device_name = os.environ.get("COMPUTERNAME", "Front Counter PC")
    wallet = _load_wallet()

    # 1. Authenticate with Remote Central Platform
    remote_data = None
    try:
        req_url = f"{CENTRAL_API_URL}/devices/register"
        payload = {
            "email": account_id.strip(),
            "password": license_key.strip(),
            "installationId": machine_id,
            "deviceName": device_name,
            "appVersion": "1.0.0",
            "osPlatform": sys.platform,
        }
        req = urllib.request.Request(
            req_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "PrimeIDPro-Desktop/1.0.0"},
        )
        with urllib.request.urlopen(req, timeout=12) as res:
            res_body = res.read().decode("utf-8")
            parsed = json.loads(res_body)
            if parsed.get("success"):
                remote_data = parsed.get("data", {})
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8")
        logger.error(f"Central Auth HTTP Error {e.code}: {err_text}")
        try:
            err_json = json.loads(err_text)
            msg = err_json.get("message") or "Authentication failed. Please check credentials."
        except Exception:
            msg = f"Server returned error {e.code}"
        raise HTTPException(status_code=e.code, detail=msg)
    except Exception as e:
        logger.warning(f"Could not connect to central server (offline mode fallback): {e}")

    # 2. Update Local Wallet State
    wallet["machineId"] = machine_id
    wallet["isConnected"] = True
    wallet["connectedAccount"] = account_id.strip()
    wallet["licenseKey"] = license_key.strip()
    wallet["tier"] = "WEB_CONNECTED"

    if remote_data:
        center = remote_data.get("center", {})
        wallet["deviceToken"] = remote_data.get("deviceToken") or remote_data.get("token")
        wallet["centerCode"] = center.get("centerCode")
        remote_balance = center.get("walletBalance")
        if remote_balance is not None and int(remote_balance) > 0:
            wallet["credits"] = int(remote_balance)
        else:
            # Welcome starter credits
            if wallet.get("credits", 0) == 0:
                wallet["credits"] = DEFAULT_FREE_CREDITS
    else:
        # Fallback if offline
        if wallet.get("credits", 0) == 0:
            wallet["credits"] = DEFAULT_FREE_CREDITS

    # Anti-abuse registration log
    mark_machine_welcome_claimed(machine_id)
    tx = {
        "id": f"tx_{int(time.time())}_connect",
        "timestamp": int(time.time()),
        "type": "SYNC",
        "description": f"Synced with PrimeIDPro.online: {account_id.strip()}",
        "amount": 0,
        "balanceAfter": wallet["credits"],
    }
    wallet.setdefault("transactions", []).append(tx)
    _save_wallet(wallet)

    logger.info(f"✅ Desktop app bound to central platform for {account_id}. Balance: {wallet['credits']}")
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

    # Sync latest balance first
    sync_cloud_wallet_balance(wallet, force=True)
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
    wallet["deviceToken"] = None
    wallet["tier"] = "UNCONNECTED"
    _save_wallet(wallet)
    return get_wallet_status()

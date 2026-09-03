import os
import sys
import multiprocessing

multiprocessing.freeze_support()

# Force line buffering
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn
from app.core.config import settings

def log_startup(msg):
    print(f"[PrimeIdPro] {msg}", flush=True)
    try:
        log_file = os.path.join(os.environ.get("TEMP", "."), "primeidpro_backend.log")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"{msg}\n")
    except Exception:
        pass

if __name__ == "__main__":
    is_frozen = getattr(sys, "frozen", False)
    port = int(os.environ.get("PORT", settings.port))
    host = os.environ.get("HOST", settings.host)

    log_startup(f"Starting backend on {host}:{port} (is_frozen={is_frozen})")

    if is_frozen:
        from app.main import app
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_config=None
        )
    else:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            reload=False,
            log_config=None
        )

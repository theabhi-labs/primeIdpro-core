import sys
import os
import multiprocessing

multiprocessing.freeze_support()

# Safe stream wrapper for frozen execution
class _SafeStream:
    def write(self, s): pass
    def flush(self): pass

if sys.stdout is None:
    sys.stdout = _SafeStream()
if sys.stderr is None:
    sys.stderr = _SafeStream()

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(line_buffering=True)
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    port = int(os.environ.get("PORT", settings.port))
    host = os.environ.get("HOST", settings.host)
    print(f"Starting PrimeID Pro Backend on {host}:{port}", flush=True)

    try:
        print("[run_server] Importing app.main...", flush=True)
        from app.main import app
        print("[run_server] App imported successfully! Launching uvicorn...", flush=True)
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level="info",
            access_log=True
        )
    except Exception as e:
        import traceback
        print(f"[run_server FATAL ERROR] {e}", flush=True)
        traceback.print_exc()
        sys.exit(1)



echo " Starting on port: $PORT"
set -x

uvicorn app.main:app --host 0.0.0.0 --port $PORT
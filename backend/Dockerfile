src/ ./app/
# Use fixed Python version
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies (Pillow / OpenCV needs libjpeg, zlib)
RUN apt-get update && apt-get install -y \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    && apt-get clean

# Upgrade pip & install python deps
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy app code
COPY . .

# Expose port (DigitalOcean automatically maps $PORT)
EXPOSE 8080

# Start command (adjust if your main file name is different)
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--bind", "0.0.0.0:8080"]
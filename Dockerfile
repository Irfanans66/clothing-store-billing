FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

COPY billing_backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY billing_backend/ .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
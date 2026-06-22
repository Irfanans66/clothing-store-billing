# Stage 1: Build React frontend
FROM node:20-alpine AS react-build
WORKDIR /app
COPY billing_react/package*.json ./
RUN npm ci
COPY billing_react/ ./
RUN npm run build

# Stage 2: Python backend (serves React + API)
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

# Copy built React into backend dist folder
COPY --from=react-build /app/dist ./dist

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
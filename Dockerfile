# Stage 1: Build React frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/billing_react
COPY billing_react/package.json billing_react/package-lock.json ./
RUN npm ci
COPY billing_react/ ./
RUN npm run build

# Stage 2: Python backend with frontend dist
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY billing_backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY billing_backend/ ./

# Copy React build output into backend dist/
COPY --from=frontend-build /app/billing_react/dist ./dist

# Expose port and start
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

# MyBilling — Clothing Store Billing System

A full-stack billing and inventory management system for clothing stores, built with **FastAPI** (backend) and **Streamlit** (frontend).

---

## Features

- **New Bill / POS** — Search products, edit selling price, auto-merge duplicate items in cart, apply discounts, generate receipts
- **Bill History** — Filter by date, customer, or payment mode; download as Excel
- **Customers** — Add, search, edit customers with loyalty points and member tiers (Regular / Silver / Gold / Platinum)
- **Products** — Add products with barcode auto-generation, stock management, low-stock alerts
- **Barcode Labels** — Generate printable PDF labels in 3 sizes: 50×25 mm, 40×30 mm, 38×25 mm
- **Reports** — Daily revenue, sales by category, payment mode breakdown, GST summary, top products
- **Team Management** — Create cashier/manager accounts, toggle active status, change passwords
- **WhatsApp Receipt** — Send bill summary directly via WhatsApp
- **PDF Receipt** — Thermal printer–ready 80mm receipt PDF

---

## Project Structure

```
MyBilling/
├── billing_backend/        # FastAPI backend
│   ├── main.py             # App entry point
│   ├── requirements.txt
│   └── app/
│       ├── core/           # Config, database, security, deps
│       ├── models/         # SQLAlchemy ORM models
│       ├── routers/        # API route handlers
│       └── schemas/        # Pydantic request/response schemas
│
└── billing_frontend/       # Streamlit frontend
    ├── app.py              # UI (all pages)
    ├── api_client.py       # HTTP client for backend API
    └── requirements.txt
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- pip

### 1. Backend Setup

```bash
cd billing_backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs at: `http://localhost:8000`  
API docs: `http://localhost:8000/docs`

### 2. Frontend Setup

```bash
cd billing_frontend
pip install -r requirements.txt
streamlit run app.py
```

Frontend runs at: `http://localhost:8501`

---

## Environment Variables (Backend)

Create a `.env` file inside `billing_backend/`:

```env
DATABASE_URL=sqlite:///./billing.db
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=480
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PASSWORD=Super@Admin2024
```

---

## Default Login

| Role       | Username    | Password      |
|------------|-------------|---------------|
| Admin      | `admin`     | `admin123`    |
| Super Admin| `superadmin`| `Super@Admin2024` |

> Change passwords after first login in production.

---

## Barcode Label Sizes

| Size       | Use case                  |
|------------|---------------------------|
| 50 × 25 mm | Standard clothing tag     |
| 40 × 30 mm | Slightly taller tag       |
| 38 × 25 mm | Small/compact label       |

Labels include store name, product name, barcode, and MRP. Print using a thermal label printer set to the matching paper size.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Backend   | FastAPI, SQLAlchemy, SQLite, JWT  |
| Frontend  | Streamlit, Pandas                 |
| Labels    | ReportLab                         |
| Reports   | Excel via openpyxl                |

---

## License

MIT
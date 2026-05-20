"""
api_client.py — Fixed v2.0
"""
from typing import Optional
import requests
import streamlit as st

API_BASE_URL = "http://localhost:8000/api/v1"


def _headers():
    token = st.session_state.get("token", "")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _handle(response: requests.Response):
    if response.status_code in (200, 201):
        return response.json()
    try:
        detail = response.json().get("detail", response.text)
    except Exception:
        detail = response.text
    st.error(f"❌ Error {response.status_code}: {detail}")
    return None


def _get(url, **kwargs):
    try:
        return requests.get(url, timeout=10, **kwargs)
    except requests.exceptions.ConnectionError:
        st.error("❌ Cannot connect to backend. Is the server running on port 8002?")
        return None
    except requests.exceptions.Timeout:
        st.error("❌ Request timed out.")
        return None


def _post(url, **kwargs):
    try:
        return requests.post(url, timeout=10, **kwargs)
    except requests.exceptions.ConnectionError:
        st.error("❌ Cannot connect to backend.")
        return None
    except requests.exceptions.Timeout:
        st.error("❌ Request timed out.")
        return None


def _patch(url, **kwargs):
    try:
        return requests.patch(url, timeout=10, **kwargs)
    except requests.exceptions.ConnectionError:
        st.error("❌ Cannot connect to backend.")
        return None
    except requests.exceptions.Timeout:
        st.error("❌ Request timed out.")
        return None


def _delete(url, **kwargs):
    try:
        return requests.delete(url, timeout=10, **kwargs)
    except requests.exceptions.ConnectionError:
        st.error("❌ Cannot connect to backend.")
        return None
    except requests.exceptions.Timeout:
        st.error("❌ Request timed out.")
        return None


# ── AUTH ──────────────────────────────────────────────────────────────────────

def login(username: str, password: str):
    r = _post(f"{API_BASE_URL}/auth/login",
              json={"username": username, "password": password})
    return _handle(r) if r else None


def register_store(data: dict):
    r = _post(f"{API_BASE_URL}/auth/register", json=data)
    return _handle(r) if r else None


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

def get_dashboard():
    r = _get(f"{API_BASE_URL}/reports/dashboard", headers=_headers())
    return _handle(r) if r else None

def get_daily_sales():
    r = _get(f"{API_BASE_URL}/reports/daily-sales", headers=_headers())
    return _handle(r) if r else []

def get_sales_by_category():
    r = _get(f"{API_BASE_URL}/reports/sales-by-category", headers=_headers())
    return _handle(r) if r else []

def get_sales_by_payment():
    r = _get(f"{API_BASE_URL}/reports/sales-by-payment-mode", headers=_headers())
    return _handle(r) if r else []

def get_top_products():
    r = _get(f"{API_BASE_URL}/reports/top-products", headers=_headers())
    return _handle(r) if r else []

def get_gst_summary():
    r = _get(f"{API_BASE_URL}/reports/gst-summary", headers=_headers())
    return _handle(r) if r else []

def get_low_stock():
    r = _get(f"{API_BASE_URL}/reports/low-stock", headers=_headers())
    return _handle(r) if r else []


# ── CUSTOMERS ─────────────────────────────────────────────────────────────────

def get_customers(search: str = ""):
    params = {"search": search} if search else {}
    r = _get(f"{API_BASE_URL}/customers/", headers=_headers(), params=params)
    return _handle(r) if r else []

def get_customer(customer_id: str):
    r = _get(f"{API_BASE_URL}/customers/{customer_id}", headers=_headers())
    return _handle(r) if r else None

def create_customer(data: dict):
    r = _post(f"{API_BASE_URL}/customers/", headers=_headers(), json=data)
    return _handle(r) if r else None

def update_customer(customer_id: str, data: dict):
    r = _patch(f"{API_BASE_URL}/customers/{customer_id}", headers=_headers(), json=data)
    return _handle(r) if r else None

def delete_customer(customer_id: str):
    r = _delete(f"{API_BASE_URL}/customers/{customer_id}", headers=_headers())
    return _handle(r) if r else None


# ── PRODUCTS ──────────────────────────────────────────────────────────────────

def get_products(search: str = "", category: str = "", low_stock: bool = False):
    params = {}
    if search:    params["search"]    = search
    if category and category != "All": params["category"] = category
    if low_stock: params["low_stock"] = True
    r = _get(f"{API_BASE_URL}/products/", headers=_headers(), params=params)
    return _handle(r) if r else []

def get_product(item_id: str):
    r = _get(f"{API_BASE_URL}/products/{item_id}", headers=_headers())
    return _handle(r) if r else None

def create_product(data: dict):
    r = _post(f"{API_BASE_URL}/products/", headers=_headers(), json=data)
    return _handle(r) if r else None

def update_product(item_id: str, data: dict):
    r = _patch(f"{API_BASE_URL}/products/{item_id}", headers=_headers(), json=data)
    return _handle(r) if r else None

def adjust_stock(item_id: str, delta: int):
    r = _patch(f"{API_BASE_URL}/products/{item_id}/stock",
               headers=_headers(), params={"delta": delta})
    return _handle(r) if r else None

def delete_product(item_id: str):
    r = _delete(f"{API_BASE_URL}/products/{item_id}", headers=_headers())
    return _handle(r) if r else None


# ── BILLS ─────────────────────────────────────────────────────────────────────

def get_bills(date: str = "", customer: str = "", payment_mode: str = ""):
    params = {}
    if date:     params["date"]         = date
    if customer: params["customer"]      = customer
    if payment_mode and payment_mode != "All":
        params["payment_mode"] = payment_mode
    r = _get(f"{API_BASE_URL}/bills/", headers=_headers(), params=params)
    return _handle(r) if r else []

def get_bill(bill_no: str):
    r = _get(f"{API_BASE_URL}/bills/{bill_no}", headers=_headers())
    return _handle(r) if r else None

def create_bill(data: dict):
    r = _post(f"{API_BASE_URL}/bills/", headers=_headers(), json=data)
    return _handle(r) if r else None

def get_receipt_pdf_bytes(bill_no: str) -> Optional[bytes]:
    try:
        r = requests.get(f"{API_BASE_URL}/bills/{bill_no}/receipt-pdf",
                         headers=_headers(), timeout=15)
        if r.status_code == 200:
            return r.content
        st.error(f"❌ Could not fetch receipt: {r.status_code}")
        return None
    except requests.exceptions.ConnectionError:
        st.error("❌ Cannot connect to backend.")
        return None

def void_bill(bill_no: str):
    r = _delete(f"{API_BASE_URL}/bills/{bill_no}", headers=_headers())
    return _handle(r) if r else None


# ── TEAM ──────────────────────────────────────────────────────────────────────
# Update the URL prefix below to match your actual backend router prefix

def get_team():
    r = _get(f"{API_BASE_URL}/store-users/", headers=_headers())
    return _handle(r) if r else []

def create_team_user(data: dict):
    r = _post(f"{API_BASE_URL}/store-users/", headers=_headers(), json=data)
    return _handle(r) if r else None

def toggle_team_user(username: str):
    r = _patch(f"{API_BASE_URL}/store-users/{username}/toggle", headers=_headers())
    return _handle(r) if r else None

def change_team_password(username: str, data: dict):
    r = _patch(f"{API_BASE_URL}/store-users/{username}/password",
               headers=_headers(), json=data)
    return _handle(r) if r else None


# ── STORE PROFILE ────────────────────────────────────────────────────────────

def get_store_profile():
    r = _get(f"{API_BASE_URL}/auth/profile", headers=_headers())
    return _handle(r) if r else None

def update_store_profile(data: dict):
    r = _patch(f"{API_BASE_URL}/auth/profile", headers=_headers(), json=data)
    return _handle(r) if r else None


# ── SUPER ADMIN ───────────────────────────────────────────────────────────────

def admin_overview():
    r = _get(f"{API_BASE_URL}/admin/overview", headers=_headers())
    return _handle(r) if r else {}

def admin_list_stores():
    r = _get(f"{API_BASE_URL}/admin/stores", headers=_headers())
    return _handle(r) if r else []

def admin_toggle_store(store_code: str):
    r = _patch(f"{API_BASE_URL}/admin/stores/{store_code}/toggle", headers=_headers())
    return _handle(r) if r else None

def admin_update_store(store_code: str, data: dict):
    r = _patch(f"{API_BASE_URL}/admin/stores/{store_code}", headers=_headers(), json=data)
    return _handle(r) if r else None

def admin_daily_revenue():
    r = _get(f"{API_BASE_URL}/admin/daily-revenue", headers=_headers())
    return _handle(r) if r else []

def admin_revenue_by_store():
    r = _get(f"{API_BASE_URL}/admin/revenue-by-store", headers=_headers())
    return _handle(r) if r else []





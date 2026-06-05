"""
app/schemas/schemas.py
Pydantic v2 request/response schemas for every endpoint.
"""
from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, field_validator, model_validator


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    store_code: Optional[str] = None
    store_name: Optional[str] = None

class StoreRegisterRequest(BaseModel):
    store_name: str
    owner_user: str
    password: str
    confirm_password: str
    email: str
    phone: str
    address: str
    gstin: Optional[str] = ""

    @field_validator("owner_user")
    @classmethod
    def no_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("Username cannot contain spaces")
        return v.lower()

    @field_validator("password")
    @classmethod
    def min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> StoreRegisterRequest:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


# ── Store ─────────────────────────────────────────────────────────────────────

class StoreOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    store_code: str
    store_name: str
    owner_user: str
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    gstin: Optional[str]
    plan: str
    upi_id: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime]
    last_login: Optional[datetime]
    notes: Optional[str]

class StorePatchRequest(BaseModel):
    store_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    plan: Optional[str] = None
    upi_id: Optional[str] = None
    notes: Optional[str] = None


# ── Store Users (team) ────────────────────────────────────────────────────────

class StoreUserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = ""
    role: str = "Cashier"

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("Admin", "Manager", "Cashier", "Viewer"):
            raise ValueError("Role must be Admin, Manager, Cashier, or Viewer")
        return v

class StoreUserOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    username: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: Optional[datetime]

class PasswordChangeRequest(BaseModel):
    new_password: str
    confirm_password: str

    @model_validator(mode="after")
    def check(self) -> PasswordChangeRequest:
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        if len(self.new_password) < 6:
            raise ValueError("Password must be at least 6 characters")
        return self


# ── Customers ─────────────────────────────────────────────────────────────────

class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    pincode: Optional[str] = ""
    gst_no: Optional[str] = ""
    member_type: str = "Regular"
    notes: Optional[str] = ""

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gst_no: Optional[str] = None
    member_type: Optional[str] = None
    loyalty_pts: Optional[int] = None
    notes: Optional[str] = None

class CustomerOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    store_code: str
    customer_id: str
    name: str
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str]
    gst_no: Optional[str]
    loyalty_pts: int
    total_purchase: float
    credit_balance: float = 0.0
    member_since: Optional[str]
    member_type: str
    notes: Optional[str]
    created_at: Optional[datetime]


# ── Products ──────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    product_name: str
    category: Optional[str] = ""
    brand: Optional[str] = ""
    size: Optional[str] = ""
    color: Optional[str] = ""
    material: Optional[str] = ""
    mrp: float
    selling_price: float
    gst_pct: float = 5.0
    hsn_code: Optional[str] = ""
    stock_qty: int = 0
    min_stock: int = 5
    description: Optional[str] = ""
    inventory_date: Optional[str] = ""

    @field_validator("mrp", "selling_price")
    @classmethod
    def positive(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Price cannot be negative")
        return v

class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    material: Optional[str] = None
    mrp: Optional[float] = None
    selling_price: Optional[float] = None
    gst_pct: Optional[float] = None
    hsn_code: Optional[str] = None
    stock_qty: Optional[int] = None
    min_stock: Optional[int] = None
    description: Optional[str] = None
    inventory_date: Optional[str] = None

class ProductOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    store_code: str
    item_id: str
    product_name: str
    category: Optional[str]
    brand: Optional[str]
    size: Optional[str]
    color: Optional[str]
    material: Optional[str]
    mrp: float
    selling_price: float
    discount_pct: float
    gst_pct: float
    hsn_code: Optional[str]
    stock_qty: int
    min_stock: int
    barcode: Optional[str]
    description: Optional[str]
    inventory_date: Optional[str]
    created_at: Optional[datetime]


# ── Bills ─────────────────────────────────────────────────────────────────────

class BillItemIn(BaseModel):
    item_id: str           # "CUSTOM" for unlisted items
    product_name: str
    category: Optional[str] = ""
    size: Optional[str] = ""
    color: Optional[str] = ""
    qty: int = 1
    mrp: float
    selling_price: float
    gst_pct: float = 5.0

class BillCreate(BaseModel):
    customer_id: Optional[str] = "WALKIN"
    customer_name: Optional[str] = "Walk-in"
    phone: Optional[str] = ""
    items: List[BillItemIn]
    discount: float = 0.0
    discount_type: str = "%"          # "%" or "Rs."
    payment_mode: str = "Cash"
    amount_paid: float
    notes: Optional[str] = ""

class BillItemOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    item_id: Optional[str]
    product_name: Optional[str]
    category: Optional[str]
    size: Optional[str]
    color: Optional[str]
    qty: int
    mrp: float
    selling_price: float
    discount_pct: float
    subtotal: float
    gst_pct: float
    gst_amt: float
    total: float

class BillOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    store_code: str
    bill_no: str
    bill_date: Optional[str]
    bill_time: Optional[str]
    customer_id: Optional[str]
    customer_name: Optional[str]
    phone: Optional[str]
    subtotal: float
    discount: float
    discount_type: Optional[str]
    gst_total: float
    grand_total: float
    amount_paid: float
    change_amt: float
    payment_mode: Optional[str]
    cashier: Optional[str]
    status: Optional[str]
    notes: Optional[str]
    share_token: Optional[str] = None
    created_at: Optional[datetime]
    items: List[BillItemOut] = []
    returns: List["ReturnOut"] = []

class BillSummary(BaseModel):
    """Lightweight bill list item (no line items)."""
    model_config = {"from_attributes": True}
    id: int
    bill_no: str
    bill_date: Optional[str]
    customer_name: Optional[str]
    grand_total: float
    amount_paid: float = 0.0
    change_amt: float = 0.0
    payment_mode: Optional[str]
    status: Optional[str]


# ── Bill Returns ─────────────────────────────────────────────────────────────

class ReturnItemIn(BaseModel):
    bill_item_id: int
    return_qty: int

    @field_validator("return_qty")
    @classmethod
    def positive_qty(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Return quantity must be at least 1")
        return v

class ReturnRequest(BaseModel):
    items: List[ReturnItemIn]
    refund_method: str = "Cash"  # "Cash" or "Store Credit"
    notes: Optional[str] = ""

class ReturnItemOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    bill_item_id: int
    item_id: Optional[str]
    product_name: Optional[str]
    return_qty: int
    refund_per_item: float
    refund_subtotal: float

class ReturnOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    bill_no: str
    return_date: Optional[str]
    return_time: Optional[str]
    refund_amount: float
    refund_method: str
    processed_by: Optional[str]
    notes: Optional[str]
    created_at: Optional[datetime]
    return_items: List[ReturnItemOut] = []


# ── Dashboard / Reports ───────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_revenue: float
    total_bills: int
    total_customers: int
    total_products: int
    low_stock_count: int

class StoreStat(BaseModel):
    store_code: str
    store_name: str
    owner_user: str
    plan: str
    is_active: bool
    customers: int
    products: int
    bills: int
    revenue: float
    created_at: Optional[datetime]
    last_login: Optional[datetime]


# ── Generic responses ─────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str

class ErrorResponse(BaseModel):
    detail: str

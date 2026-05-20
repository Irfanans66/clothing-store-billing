"""
app/models/models.py
SQLAlchemy ORM models — all tables for the multi-tenant billing system.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base

def _now():
    return datetime.now(timezone.utc)

# ── Stores (tenants) ──────────────────────────────────────────────────────────
class Store(Base):
    __tablename__ = "stores"

    id           = Column(Integer, primary_key=True, index=True)
    store_code   = Column(String(20), unique=True, nullable=False, index=True)
    store_name   = Column(String(100), nullable=False)
    owner_user   = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    email        = Column(String(100))
    phone        = Column(String(20))
    address      = Column(Text)
    gstin        = Column(String(20))
    plan         = Column(String(20), default="Free")
    upi_id       = Column(String(100), nullable=True)
    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=_now)
    last_login   = Column(DateTime, nullable=True)
    notes        = Column(Text, nullable=True)

    team_members = relationship(
    "StoreUser",
    back_populates="store",
    cascade="all, delete-orphan")

    customers = relationship(
    "Customer",
    back_populates="store",
    cascade="all, delete-orphan")

    products = relationship(
    "Product",
    back_populates="store",
    cascade="all, delete-orphan")

    bills = relationship(
    "Bill",
    back_populates="store",
    cascade="all, delete-orphan")



# ── Store sub-users (cashiers, managers per tenant) ───────────────────────────
class StoreUser(Base):
    __tablename__ = "store_users"
    __table_args__ = (UniqueConstraint("store_code", "username"),)

    id            = Column(Integer, primary_key=True, index=True)
    store_code    = Column(String(20), ForeignKey("stores.store_code", ondelete="CASCADE"), nullable=False)
    username      = Column(String(50), nullable=False)
    password_hash = Column(String(200), nullable=False)
    full_name     = Column(String(100))
    role          = Column(String(20), default="Cashier")
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=_now)

    store = relationship("Store", back_populates="team_members")

# ── Customers ─────────────────────────────────────────────────────────────────
class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("store_code", "customer_id"),)

    id              = Column(Integer, primary_key=True, index=True)
    store_code      = Column(String(20), ForeignKey("stores.store_code", ondelete="CASCADE"), nullable=False)
    customer_id     = Column(String(20), nullable=False)
    name            = Column(String(100), nullable=False)
    phone           = Column(String(20), index=True)
    email           = Column(String(100))
    address         = Column(Text)
    city            = Column(String(50))
    state           = Column(String(50))
    pincode         = Column(String(10))
    gst_no          = Column(String(20))
    loyalty_pts     = Column(Integer, default=0)
    total_purchase  = Column(Float, default=0.0)
    member_since    = Column(String(20))
    member_type     = Column(String(20), default="Regular")
    notes           = Column(Text)
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)

    store = relationship("Store", back_populates="customers")

# ── Products ──────────────────────────────────────────────────────────────────
class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("store_code", "item_id"),)

    id              = Column(Integer, primary_key=True, index=True)
    store_code      = Column(String(20), ForeignKey("stores.store_code", ondelete="CASCADE"), nullable=False)
    item_id         = Column(String(20), nullable=False)
    product_name    = Column(String(200), nullable=False)
    category        = Column(String(50))
    brand           = Column(String(50))
    size            = Column(String(20))
    color           = Column(String(30))
    material        = Column(String(50))
    mrp             = Column(Float, default=0.0)
    selling_price   = Column(Float, default=0.0)
    discount_pct    = Column(Float, default=0.0)
    gst_pct         = Column(Float, default=5.0)
    hsn_code        = Column(String(20))
    stock_qty       = Column(Integer, default=0)
    min_stock       = Column(Integer, default=5)
    barcode         = Column(String(100))
    description     = Column(Text)
    inventory_date  = Column(String(20))
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)

    store      = relationship("Store", back_populates="products")

# ── Bills (header) ────────────────────────────────────────────────────────────
class Bill(Base):
    __tablename__ = "bills"
    id = Column(Integer, primary_key=True, index=True)
    store_code = Column( String(20), ForeignKey("stores.store_code", ondelete="CASCADE"), nullable=False )
    bill_no = Column(String(20), unique=True, nullable=False)
    bill_date = Column(String(20))
    bill_time = Column(String(20))
    customer_id = Column(String(20))
    customer_name = Column(String(100))
    phone = Column(String(20))
    subtotal = Column(Float, default=0)
    discount = Column(Float, default=0)
    discount_type = Column(String(10))
    gst_total = Column(Float, default=0)
    grand_total = Column(Float, default=0)
    amount_paid = Column(Float, default=0)
    change_amt = Column(Float, default=0)
    payment_mode = Column(String(30))
    cashier = Column(String(50))
    status = Column(String(20), default="Paid")
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Relationship

    store = relationship(
        "Store",
        back_populates="bills")

    items = relationship( "BillItem", back_populates="bill", cascade="all, delete-orphan" )

# ── Bill Line Items ───────────────────────────────────────────────────────────
class BillItem(Base):
    __tablename__ = "bill_items"
    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column( Integer, ForeignKey("bills.id", ondelete="CASCADE"), nullable=False )
    store_code = Column(String(20), nullable=False)
    item_id = Column(String(20))
    product_name = Column(String(200))
    category = Column(String(50))
    size = Column(String(20))
    color = Column(String(30))
    qty = Column(Integer)
    mrp = Column(Float)
    selling_price = Column(Float)
    discount_pct = Column(Float)
    subtotal = Column(Float)
    gst_pct = Column(Float)
    gst_amt = Column(Float)
    total = Column(Float)
    # Relationship

    bill = relationship( "Bill", back_populates="items" )


# ── Super Admin (global, not per-store) ──────────────────────────────────────
class SuperAdmin(Base):
    __tablename__ = "super_admins"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    created_at    = Column(DateTime, default=_now)
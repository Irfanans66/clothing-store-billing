"""
app/routers/customers.py
Customer CRUD — all data scoped to the logged-in store.
"""
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access, require_admin_or_manager
from app.models.models import Customer
from app.schemas.schemas import CustomerCreate, CustomerOut, CustomerUpdate, MessageResponse

router = APIRouter(prefix="/customers", tags=["Customers"])


def _next_customer_id(db: Session, store_code: str) -> str:
    count = db.query(Customer).filter(Customer.store_code == store_code).count()
    return f"CUST{(count + 1):03d}"


# ── GET /customers ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CustomerOut])
def list_customers(
    search: Optional[str] = Query(None, description="Search by name, phone, or customer ID"),
    member_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    q = db.query(Customer).filter(Customer.store_code == sc)

    if search:
        like = f"%{search}%"
        q = q.filter(
            Customer.name.ilike(like)
            | Customer.phone.ilike(like)
            | Customer.customer_id.ilike(like)
        )
    if member_type:
        q = q.filter(Customer.member_type == member_type)

    return q.order_by(Customer.name).offset(skip).limit(limit).all()


# ── GET /customers/{customer_id} ──────────────────────────────────────────────

@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cust = db.query(Customer).filter(
        Customer.store_code == sc,
        Customer.customer_id == customer_id,
    ).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return cust


# ── POST /customers ───────────────────────────────────────────────────────────

@router.post("/", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cid = _next_customer_id(db, sc)

    # Prevent duplicate phone within the same store
    if payload.phone:
        exists = db.query(Customer).filter(
            Customer.store_code == sc, Customer.phone == payload.phone
        ).first()
        if exists:
            raise HTTPException(status_code=400, detail=f"Customer with phone {payload.phone} already exists (ID: {exists.customer_id}).")

    cust = Customer(
        store_code=sc,
        customer_id=cid,
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        gst_no=payload.gst_no,
        member_type=payload.member_type,
        member_since=datetime.date.today().strftime("%Y-%m-%d"),
        notes=payload.notes,
    )
    db.add(cust)
    db.commit()
    db.refresh(cust)
    return cust


# ── PATCH /customers/{customer_id} ────────────────────────────────────────────

@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cust = db.query(Customer).filter(
        Customer.store_code == sc, Customer.customer_id == customer_id
    ).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cust, field, value)

    db.commit()
    db.refresh(cust)
    return cust


# ── DELETE /customers/{customer_id} ───────────────────────────────────────────

@router.delete("/{customer_id}", response_model=MessageResponse)
def delete_customer(
    customer_id: str,
    identity: dict = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cust = db.query(Customer).filter(
        Customer.store_code == sc, Customer.customer_id == customer_id
    ).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")

    db.delete(cust)
    db.commit()
    return MessageResponse(message=f"Customer {customer_id} deleted.")

"""
app/routers/admin.py
Super-admin endpoints — platform-wide analytics and store management.
All routes require a valid SuperAdmin JWT.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_superadmin
from app.models.models import Bill, Customer, Product, Store
from app.schemas.schemas import MessageResponse, StorePatchRequest, StoreStat

router = APIRouter(prefix="/admin", tags=["Super Admin"])


def _store_stat(store: Store, db: Session) -> StoreStat:
    bills     = db.query(func.count(Bill.id)).filter(Bill.store_code == store.store_code).scalar() or 0
    revenue   = db.query(func.sum(Bill.grand_total)).filter(Bill.store_code == store.store_code).scalar() or 0.0
    customers = db.query(func.count(Customer.id)).filter(Customer.store_code == store.store_code).scalar() or 0
    products  = db.query(func.count(Product.id)).filter(Product.store_code == store.store_code).scalar() or 0
    return StoreStat(
        store_code=store.store_code,
        store_name=store.store_name,
        owner_user=store.owner_user,
        plan=store.plan,
        is_active=store.is_active,
        customers=customers,
        products=products,
        bills=bills,
        revenue=float(revenue),
        created_at=store.created_at,
        last_login=store.last_login,
    )


# ── GET /admin/overview ───────────────────────────────────────────────────────

@router.get("/overview")
def platform_overview(
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    total_stores  = db.query(func.count(Store.id)).scalar() or 0
    active_stores = db.query(func.count(Store.id)).filter(Store.is_active.is_(True)).scalar() or 0
    total_bills   = db.query(func.count(Bill.id)).scalar() or 0
    total_revenue = db.query(func.sum(Bill.grand_total)).scalar() or 0.0
    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    total_products  = db.query(func.count(Product.id)).scalar() or 0

    plan_counts: dict[str, int] = {}
    for (plan, cnt) in db.query(Store.plan, func.count(Store.id)).group_by(Store.plan).all():
        plan_counts[plan or "Free"] = cnt

    return {
        "total_stores":    total_stores,
        "active_stores":   active_stores,
        "inactive_stores": total_stores - active_stores,
        "total_bills":     total_bills,
        "total_revenue":   float(total_revenue),
        "total_customers": total_customers,
        "total_products":  total_products,
        "plan_breakdown":  plan_counts,
    }


# ── GET /admin/stores ─────────────────────────────────────────────────────────

@router.get("/stores", response_model=list[StoreStat])
def list_stores(
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    stores = db.query(Store).order_by(Store.created_at.desc()).all()
    return [_store_stat(s, db) for s in stores]


# ── GET /admin/stores/{store_code} ────────────────────────────────────────────

@router.get("/stores/{store_code}", response_model=StoreStat)
def get_store(
    store_code: str,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    store = db.query(Store).filter(Store.store_code == store_code).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found.")
    return _store_stat(store, db)


# ── PATCH /admin/stores/{store_code} ─────────────────────────────────────────

@router.patch("/stores/{store_code}", response_model=MessageResponse)
def update_store(
    store_code: str,
    payload: StorePatchRequest,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    store = db.query(Store).filter(Store.store_code == store_code).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found.")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(store, field, val)
    db.commit()
    return MessageResponse(message=f"{store_code} updated successfully.")


# ── PATCH /admin/stores/{store_code}/toggle ───────────────────────────────────

@router.patch("/stores/{store_code}/toggle", response_model=MessageResponse)
def toggle_store(
    store_code: str,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    store = db.query(Store).filter(Store.store_code == store_code).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found.")
    store.is_active = not store.is_active
    db.commit()
    state = "activated" if store.is_active else "frozen"
    return MessageResponse(message=f"{store_code} {state}.")


# ── GET /admin/daily-revenue ──────────────────────────────────────────────────

@router.get("/daily-revenue")
def daily_revenue(
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(
            Bill.bill_date,
            func.sum(Bill.grand_total).label("revenue"),
            func.count(Bill.id).label("bills"),
        )
        .filter(Bill.bill_date.isnot(None))
        .group_by(Bill.bill_date)
        .order_by(Bill.bill_date)
        .all()
    )
    return [{"date": r.bill_date, "revenue": float(r.revenue), "bills": r.bills} for r in rows]


# ── GET /admin/revenue-by-store ───────────────────────────────────────────────

@router.get("/revenue-by-store")
def revenue_by_store(
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Store.store_name, func.sum(Bill.grand_total).label("revenue"))
        .join(Bill, Bill.store_code == Store.store_code)
        .group_by(Store.store_code)
        .order_by(func.sum(Bill.grand_total).desc())
        .all()
    )
    return [{"store": r.store_name, "revenue": float(r.revenue)} for r in rows]
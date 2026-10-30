"""
app/routers/admin.py
Super-admin endpoints — platform-wide analytics and store management.
All routes require a valid SuperAdmin JWT.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_superadmin
from app.models.models import Bill, Customer, Product, Store, SupportMessage, SupportTicket
from app.schemas.schemas import MessageResponse, StorePatchRequest, StoreStat, SupportTicketOut, SupportTicketReply

router = APIRouter(prefix="/admin", tags=["Super Admin"])

# A store counts as active if it made a bill in this many days
ACTIVE_DAYS = 30


def _utcnow() -> datetime:
    # Timestamp columns are stored without a timezone, in UTC
    return datetime.utcnow()


def _today() -> str:
    # Same calendar day bills are stamped with (bills.py uses the server's date)
    return date.today().strftime("%Y-%m-%d")


def _real_store_codes(db: Session):
    """Store codes that count toward platform stats (test/demo stores left out)."""
    return db.query(Store.store_code).filter(Store.is_test.isnot(True))


def _live_bills(db: Session, *cols):
    """Bills from real stores, voided bills left out."""
    return (
        db.query(*cols)
        .filter(Bill.status != "Void")
        .filter(Bill.store_code.in_(_real_store_codes(db)))
    )


def _store_stats(db: Session, store_code: str | None = None) -> list[StoreStat]:
    # One aggregated query instead of four queries per store
    bill_sq = (
        db.query(
            Bill.store_code,
            func.count(Bill.id).label("bills"),
            func.coalesce(func.sum(Bill.grand_total), 0.0).label("revenue"),
            func.max(Bill.created_at).label("last_bill_at"),
        )
        .filter(Bill.status != "Void")
        .group_by(Bill.store_code)
        .subquery()
    )
    today_sq = (
        db.query(
            Bill.store_code,
            func.count(Bill.id).label("bills"),
            func.coalesce(func.sum(Bill.grand_total), 0.0).label("sales"),
        )
        .filter(Bill.status != "Void", Bill.bill_date == _today())
        .group_by(Bill.store_code)
        .subquery()
    )
    customer_sq = (
        db.query(Customer.store_code, func.count(Customer.id).label("customers"))
        .group_by(Customer.store_code)
        .subquery()
    )
    product_sq = (
        db.query(Product.store_code, func.count(Product.id).label("products"))
        .group_by(Product.store_code)
        .subquery()
    )
    q = (
        db.query(
            Store,
            func.coalesce(bill_sq.c.bills, 0),
            func.coalesce(bill_sq.c.revenue, 0.0),
            bill_sq.c.last_bill_at,
            func.coalesce(today_sq.c.bills, 0),
            func.coalesce(today_sq.c.sales, 0.0),
            func.coalesce(customer_sq.c.customers, 0),
            func.coalesce(product_sq.c.products, 0),
        )
        .outerjoin(bill_sq, bill_sq.c.store_code == Store.store_code)
        .outerjoin(today_sq, today_sq.c.store_code == Store.store_code)
        .outerjoin(customer_sq, customer_sq.c.store_code == Store.store_code)
        .outerjoin(product_sq, product_sq.c.store_code == Store.store_code)
        .order_by(Store.created_at.desc())
    )
    if store_code:
        q = q.filter(Store.store_code == store_code)
    return [
        StoreStat(
            store_code=store.store_code,
            store_name=store.store_name,
            owner_user=store.owner_user,
            email=store.email,
            phone=store.phone,
            address=store.address,
            plan=store.plan or "Free",
            notes=store.notes,
            is_active=store.is_active,
            is_test=bool(store.is_test),
            customers=int(customers),
            products=int(products),
            bills=int(bills),
            revenue=float(revenue),
            created_at=store.created_at,
            last_login=store.last_login,
            last_bill_at=last_bill_at,
            today_bills=int(today_bills),
            today_sales=float(today_sales),
        )
        for store, bills, revenue, last_bill_at, today_bills, today_sales, customers, products in q.all()
    ]


# ── GET /admin/overview ───────────────────────────────────────────────────────

@router.get("/overview")
def platform_overview(
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    now = _utcnow()
    week_ago = now - timedelta(days=7)
    real = db.query(Store).filter(Store.is_test.isnot(True))

    total_stores  = real.count()
    frozen_stores = real.filter(Store.is_active.is_(False)).count()
    test_stores   = db.query(func.count(Store.id)).filter(Store.is_test.is_(True)).scalar() or 0
    paid_stores   = real.filter(func.coalesce(Store.plan, "Free") != "Free").count()
    new_signups_7d = real.filter(Store.created_at >= week_ago).count()

    today_row = _live_bills(
        db, func.count(func.distinct(Bill.store_code)), func.count(Bill.id), func.sum(Bill.grand_total)
    ).filter(Bill.bill_date == _today()).one()

    total_bills = _live_bills(db, func.count(Bill.id)).scalar() or 0
    store_sales = _live_bills(db, func.sum(Bill.grand_total)).scalar() or 0.0

    last_bill = dict(
        _live_bills(db, Bill.store_code, func.max(Bill.created_at)).group_by(Bill.store_code).all()
    )
    first_bill = dict(
        _live_bills(db, Bill.store_code, func.min(Bill.created_at)).group_by(Bill.store_code).all()
    )
    active_cutoff = now - timedelta(days=ACTIVE_DAYS)
    idle_cutoff   = now - timedelta(days=14)
    active_stores = sum(1 for t in last_bill.values() if t and t >= active_cutoff)
    # Live stores with no bill in 14+ days (including ones that never billed)
    idle_stores = sum(
        1 for (code,) in real.filter(Store.is_active.is_(True)).with_entities(Store.store_code).all()
        if not last_bill.get(code) or last_bill[code] < idle_cutoff
    )
    first_bill_7d = sum(1 for t in first_bill.values() if t and t >= week_ago)

    plan_counts: dict[str, int] = {}
    for (plan, cnt) in real.with_entities(Store.plan, func.count(Store.id)).group_by(Store.plan).all():
        plan_counts[plan or "Free"] = plan_counts.get(plan or "Free", 0) + cnt

    return {
        "total_stores":    total_stores,
        "active_stores":   active_stores,       # made a bill in the last ACTIVE_DAYS days
        "active_days":     ACTIVE_DAYS,
        "frozen_stores":   frozen_stores,
        "idle_stores":     idle_stores,
        "test_stores":     test_stores,
        "paid_stores":     paid_stores,
        "new_signups_7d":  new_signups_7d,
        "first_bill_7d":   first_bill_7d,
        "open_today":      today_row[0] or 0,   # stores that made a bill today
        "bills_today":     today_row[1] or 0,
        "sales_today":     float(today_row[2] or 0),
        "total_bills":     total_bills,
        "store_sales":     float(store_sales),  # what stores sold, not platform income
        "total_customers": db.query(func.count(Customer.id)).filter(Customer.store_code.in_(_real_store_codes(db))).scalar() or 0,
        "total_products":  db.query(func.count(Product.id)).filter(Product.store_code.in_(_real_store_codes(db))).scalar() or 0,
        "plan_breakdown":  plan_counts,
    }


# ── GET /admin/stores ─────────────────────────────────────────────────────────

@router.get("/stores", response_model=list[StoreStat])
def list_stores(
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return _store_stats(db)


# ── GET /admin/stores/{store_code} ────────────────────────────────────────────

@router.get("/stores/{store_code}", response_model=StoreStat)
def get_store(
    store_code: str,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = _store_stats(db, store_code)
    if not rows:
        raise HTTPException(status_code=404, detail="Store not found.")
    return rows[0]


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
    days: int = 30,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    days = max(1, min(days, 365))
    since = (_utcnow() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    rows = (
        _live_bills(
            db,
            Bill.bill_date,
            func.sum(Bill.grand_total).label("revenue"),
            func.count(Bill.id).label("bills"),
        )
        .filter(Bill.bill_date.isnot(None), Bill.bill_date >= since)
        .group_by(Bill.bill_date)
        .order_by(Bill.bill_date)
        .all()
    )
    return [{"date": r.bill_date, "revenue": float(r.revenue or 0), "bills": r.bills} for r in rows]


# ── GET /admin/revenue-by-store ───────────────────────────────────────────────

@router.get("/revenue-by-store")
def revenue_by_store(
    limit: int = 10,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Store.store_name, func.sum(Bill.grand_total).label("revenue"))
        .join(Bill, Bill.store_code == Store.store_code)
        .filter(Store.is_test.isnot(True), Bill.status != "Void")
        .group_by(Store.store_code, Store.store_name)
        .order_by(func.sum(Bill.grand_total).desc())
        .limit(max(1, min(limit, 50)))
        .all()
    )
    return [{"store": r.store_name, "revenue": float(r.revenue or 0)} for r in rows]


# ── GET /admin/support-tickets ────────────────────────────────────────────────

@router.get("/support-tickets", response_model=list[SupportTicketOut])
def list_support_tickets(
    status: str = None,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    q = db.query(SupportTicket).order_by(SupportTicket.created_at.desc())
    if status:
        q = q.filter(SupportTicket.status == status)
    return q.all()


# ── PATCH /admin/support-tickets/{ticket_id} ──────────────────────────────────

@router.patch("/support-tickets/{ticket_id}", response_model=SupportTicketOut)
def reply_support_ticket(
    ticket_id: int,
    payload: SupportTicketReply,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if payload.status is not None:
        ticket.status = payload.status
    reply = (payload.admin_reply or "").strip()
    if reply and reply != (ticket.admin_reply or "").strip():
        # Keep the latest reply on the ticket (older clients read it) and add it to the conversation
        ticket.admin_reply = reply
        db.add(SupportMessage(ticket_id=ticket.id, author="support", username="Support", message=reply))
    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/support-tickets/{ticket_id}", response_model=MessageResponse)
def delete_support_ticket(
    ticket_id: int,
    _: dict = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.delete(ticket)
    db.commit()
    return MessageResponse(message=f"Ticket #{ticket_id} deleted.")
"""
app/routers/customers.py
Customer CRUD — all data scoped to the logged-in store.
"""
import datetime
from typing import List, Optional

import re
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access, require_admin_or_manager, require_admin
from app.models.models import Bill, BillItem, Customer, LoyaltyProgram
from app.schemas.schemas import CustomerCreate, CustomerMerge, CustomerOut, CustomerUpdate, MessageResponse

router = APIRouter(prefix="/customers", tags=["Customers"])

# Automatic member tiers by lifetime spend (upgrade only — a manual higher tier is kept)
TIER_THRESHOLDS = [("Platinum", 50000), ("Gold", 25000), ("Silver", 10000)]
TIER_RANK = {"Regular": 0, "Silver": 1, "Gold": 2, "Platinum": 3}


def tier_for_spend(total: float, current: str = "Regular") -> str:
    earned = next((name for name, floor in TIER_THRESHOLDS if (total or 0) >= floor), "Regular")
    return earned if TIER_RANK.get(earned, 0) > TIER_RANK.get(current or "Regular", 0) else (current or "Regular")


def phone_key(phone: Optional[str]) -> str:
    """Comparable form of a phone number: digits only, Indian +91 / 0 prefixes dropped."""
    d = re.sub(r"\D", "", phone or "")
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    if len(d) == 11 and d.startswith("0"):
        d = d[1:]
    return d


def _phone_owner(db: Session, sc: str, phone: str, exclude_id: Optional[str] = None) -> Optional[Customer]:
    key = phone_key(phone)
    if not key:
        return None
    for c in db.query(Customer).filter(Customer.store_code == sc, Customer.phone.isnot(None)).all():
        if c.customer_id != exclude_id and phone_key(c.phone) == key:
            return c
    return None


def _next_customer_id(db: Session, store_code: str) -> str:
    # Highest existing number + 1, so deleting a customer never causes an ID clash
    nums = [int(m.group(1)) for (cid,) in db.query(Customer.customer_id).filter(Customer.store_code == store_code).all()
            if (m := re.fullmatch(r"CUST(\d+)", cid or ""))]
    return f"CUST{(max(nums, default=0) + 1):03d}"


def _visit_stats(db: Session, sc: str) -> dict:
    rows = (
        db.query(Bill.customer_id, func.count(Bill.id), func.max(Bill.bill_date))
        .filter(Bill.store_code == sc, Bill.status != "Void", Bill.customer_id != "WALKIN")
        .group_by(Bill.customer_id).all()
    )
    return {cid: (int(n), last) for cid, n, last in rows}


def _with_stats(cust: Customer, stats: dict) -> dict:
    out = CustomerOut.model_validate(cust).model_dump()
    out["visits"], out["last_visit"] = stats.get(cust.customer_id, (0, None))
    return out


# ── GET /customers ────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CustomerOut])
def list_customers(
    search: Optional[str] = Query(None, description="Search by name, phone, or customer ID"),
    member_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = Query(100, le=5000),
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

    stats = _visit_stats(db, sc)
    return [_with_stats(c, stats) for c in q.order_by(Customer.name).offset(skip).limit(limit).all()]


# ── Housekeeping: duplicates, unlinked dues, import ───────────────────────────

@router.get("/duplicates")
def duplicate_customers(identity: dict = Depends(require_store_access), db: Session = Depends(get_db)):
    """Groups of customers sharing the same phone number."""
    sc = identity["store_code"]
    groups: dict = {}
    for c in db.query(Customer).filter(Customer.store_code == sc).all():
        key = phone_key(c.phone)
        if len(key) >= 6:
            groups.setdefault(key, []).append(c)
    stats = _visit_stats(db, sc)
    return [[_with_stats(c, stats) for c in g] for g in groups.values() if len(g) > 1]


@router.get("/unlinked-dues")
def unlinked_dues(identity: dict = Depends(require_store_access), db: Session = Depends(get_db)):
    """Credit bills whose customer isn't in the customer list, so their due isn't tracked."""
    sc = identity["store_code"]
    known = {cid for (cid,) in db.query(Customer.customer_id).filter(Customer.store_code == sc).all()}
    bills = (
        db.query(Bill).filter(Bill.store_code == sc, Bill.status.in_(["Credit", "Partial Return"]), Bill.change_amt < 0)
        .order_by(Bill.bill_date.desc()).all()
    )
    return [
        {"bill_no": b.bill_no, "bill_date": b.bill_date, "customer_name": b.customer_name, "phone": b.phone,
         "due": round(-b.change_amt, 2), "grand_total": b.grand_total}
        for b in bills if b.customer_id not in known
    ]


@router.post("/import")
def import_customers(
    rows: List[CustomerCreate],
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    """Bulk add from a spreadsheet. Rows whose phone already exists are skipped."""
    sc = identity["store_code"]
    seen = {phone_key(p) for (p,) in db.query(Customer.phone).filter(Customer.store_code == sc).all() if p}
    created, skipped = 0, []
    for r in rows:
        key = phone_key(r.phone)
        if not r.name.strip() or not key:
            skipped.append({"name": r.name, "phone": r.phone, "reason": "Name and phone are required"}); continue
        if key in seen:
            skipped.append({"name": r.name, "phone": r.phone, "reason": "Phone already exists"}); continue
        seen.add(key)
        db.add(Customer(
            store_code=sc, customer_id=_next_customer_id(db, sc), name=r.name.strip(), phone=key if len(key) == 10 else r.phone,
            email=r.email, address=r.address, city=r.city, state=r.state, pincode=r.pincode, gst_no=r.gst_no,
            member_type=r.member_type or "Regular", notes=r.notes, birthday=r.birthday or None,
            anniversary=r.anniversary or None, preferences=r.preferences,
            member_since=datetime.date.today().strftime("%Y-%m-%d"),
        ))
        db.flush()
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped}


@router.post("/merge", response_model=MessageResponse)
def merge_customers(
    payload: CustomerMerge,
    identity: dict = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    """Fold a duplicate into the customer to keep: bills, spend, dues and points move over."""
    sc = identity["store_code"]
    if payload.keep_id == payload.merge_id:
        raise HTTPException(status_code=400, detail="Choose two different customers.")
    keep = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == payload.keep_id).first()
    dup  = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == payload.merge_id).first()
    if not keep or not dup:
        raise HTTPException(status_code=404, detail="Customer not found.")
    moved = (db.query(Bill).filter(Bill.store_code == sc, Bill.customer_id == dup.customer_id)
             .update({Bill.customer_id: keep.customer_id, Bill.customer_name: keep.name}, synchronize_session=False))
    keep.total_purchase = round((keep.total_purchase or 0) + (dup.total_purchase or 0), 2)
    keep.credit_balance = round((keep.credit_balance or 0) + (dup.credit_balance or 0), 2)
    keep.loyalty_pts = (keep.loyalty_pts or 0) + (dup.loyalty_pts or 0)
    keep.member_type = tier_for_spend(keep.total_purchase, max([keep.member_type, dup.member_type], key=lambda t: TIER_RANK.get(t, 0)))
    for field in ("email", "address", "city", "state", "pincode", "gst_no", "birthday", "anniversary", "preferences"):
        if not getattr(keep, field) and getattr(dup, field):
            setattr(keep, field, getattr(dup, field))
    db.delete(dup)
    db.commit()
    return MessageResponse(message=f"Merged {dup.name} into {keep.name} ({moved} bill{'s' if moved != 1 else ''} moved).")

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


# ── GET /customers/{customer_id}/profile ──────────────────────────────────────

@router.get("/{customer_id}/profile")
def customer_profile(
    customer_id: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cust = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    bills = (db.query(Bill).filter(Bill.store_code == sc, Bill.customer_id == customer_id)
             .order_by(Bill.bill_date.desc(), Bill.id.desc()).all())
    live = [b for b in bills if b.status != "Void"]
    spent = sum(b.grand_total or 0 for b in live)
    items = (db.query(BillItem.category, BillItem.size, BillItem.color, BillItem.qty)
             .join(Bill, BillItem.bill_id == Bill.id)
             .filter(Bill.store_code == sc, Bill.customer_id == customer_id, Bill.status != "Void").all())

    def favourite(idx):
        c = Counter()
        for row in items:
            if row[idx]:
                c[row[idx]] += row[3] or 1
        return [k for k, _ in c.most_common(3)]

    return {
        "customer": _with_stats(cust, {customer_id: (len(live), live[0].bill_date if live else None)}),
        "stats": {
            "visits": len(live), "spent": round(spent, 2),
            "avg_bill": round(spent / len(live), 2) if live else 0,
            "last_visit": live[0].bill_date if live else None,
            "first_visit": live[-1].bill_date if live else None,
            "items_bought": sum(r[3] or 0 for r in items),
        },
        "favourites": {"categories": favourite(0), "sizes": favourite(1), "colors": favourite(2)},
        "next_tier": next(({"name": n, "at": f, "remaining": round(f - (cust.total_purchase or 0), 2)}
                           for n, f in reversed(TIER_THRESHOLDS) if (cust.total_purchase or 0) < f), None),
        "bills": [
            {"bill_no": b.bill_no, "bill_date": b.bill_date, "bill_time": b.bill_time, "grand_total": b.grand_total,
             "payment_mode": b.payment_mode, "status": b.status, "due": round(-b.change_amt, 2) if (b.change_amt or 0) < 0 and b.status != "Void" else 0,
             "points_earned": b.loyalty_earned_pts or 0, "points_redeemed": b.loyalty_redeemed_pts or 0}
            for b in bills[:100]
        ],
    }


# ── POST /customers ───────────────────────────────────────────────────────────

@router.post("/", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cid = _next_customer_id(db, sc)

    # Prevent duplicate phone within the same store (+91 / spaces don't make a number different)
    exists = _phone_owner(db, sc, payload.phone)
    if exists:
        raise HTTPException(status_code=400, detail=f"This number already belongs to {exists.name} ({exists.customer_id}).")

    # Apply welcome bonus if a loyalty program is enabled
    program = db.query(LoyaltyProgram).filter(LoyaltyProgram.store_code == sc).first()
    welcome_pts = 0
    if program and program.enabled and (program.welcome_bonus or 0) > 0:
        welcome_pts = int(program.welcome_bonus)

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
        birthday=payload.birthday or None,
        anniversary=payload.anniversary or None,
        preferences=payload.preferences,
        loyalty_pts=welcome_pts,
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

    changes = payload.model_dump(exclude_none=True)
    if changes.get("phone"):
        owner = _phone_owner(db, sc, changes["phone"], exclude_id=customer_id)
        if owner:
            raise HTTPException(status_code=400, detail=f"This number already belongs to {owner.name} ({owner.customer_id}).")
    for field in ("birthday", "anniversary"):
        if changes.get(field) == "":
            changes[field] = None
    for field, value in changes.items():
        setattr(cust, field, value)

    db.commit()
    db.refresh(cust)
    return cust


# ── POST /customers/{customer_id}/record-payment ─────────────────────────────

@router.post("/{customer_id}/record-payment", response_model=CustomerOut)
def record_credit_payment(
    customer_id: str,
    amount: float = Query(..., gt=0),
    payment_mode: str = Query("Cash"),
    notes: Optional[str] = Query(None),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cust = db.query(Customer).filter(
        Customer.store_code == sc, Customer.customer_id == customer_id
    ).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    if not cust.credit_balance or cust.credit_balance <= 0:
        raise HTTPException(status_code=400, detail="No outstanding balance for this customer.")

    paid = min(round(amount, 2), round(cust.credit_balance, 2))
    cust.credit_balance = round(max(0, cust.credit_balance - paid), 2)
    db.commit()
    db.refresh(cust)
    return cust


# ── DELETE /customers/{customer_id} ───────────────────────────────────────────

@router.delete("/{customer_id}", response_model=MessageResponse)
def delete_customer(
    customer_id: str,
    identity: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    cust = db.query(Customer).filter(
        Customer.store_code == sc, Customer.customer_id == customer_id
    ).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    n_bills = db.query(Bill).filter(Bill.store_code == sc, Bill.customer_id == customer_id).count()
    if n_bills:
        raise HTTPException(status_code=400, detail=f"{cust.name} has {n_bills} bill{'s' if n_bills > 1 else ''}, so they can't be deleted. "
                                                    "Edit their details, or merge them into another customer.")
    if (cust.credit_balance or 0) > 0:
        raise HTTPException(status_code=400, detail=f"{cust.name} still owes ₹{cust.credit_balance:.0f}.")

    db.delete(cust)
    db.commit()
    return MessageResponse(message=f"Customer {customer_id} deleted.")

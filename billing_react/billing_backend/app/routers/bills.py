"""
app/routers/bills.py
"""
import datetime
import io
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from urllib.parse import quote


def _upi_payment_url(upi_id: str, store_name: str, amount: int, bill_no: str) -> str:
    return (
        f"upi://pay?pa={quote(upi_id, safe='')}"
        f"&pn={quote(store_name or '', safe='')}"
        f"&am={amount}"
        f"&cu=INR"
        f"&tr={quote(bill_no, safe='')}"
        f"&tn={quote(f'Payment for {bill_no}', safe='')}"
    )

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from app.core.database import get_db
from app.core.deps import require_store_access, require_admin
from app.models.models import Bill, BillItem, BillReturn, BillReturnItem, Customer, LoyaltyProgram, Product, Store
from app.schemas.schemas import BillCreate, BillOut, BillSummary, LinkCustomer, MessageResponse, ReceiptPreviewRequest, ReturnRequest, ReturnOut, VoidRequest
from app.routers.customers import tier_for_spend

router = APIRouter(prefix="/bills", tags=["Bills"])


WALK_IN = "Walk-in"


def _round_rupee(x: float) -> int:
    """Round half up to whole rupees (Python's round() is banker's rounding: round(806.5) == 806)."""
    return int(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _next_bill_no(db: Session, store_code: str) -> str:
    from sqlalchemy import func
    max_id = db.query(func.max(Bill.id)).scalar() or 0
    return f"BILL{(max_id + 1):04d}"


def _compute_bill(items_in, discount: float, discount_type: str, amount_paid: float,
                  payment_mode: str = "Cash", loyalty_redeem_rupees: float = 0.0):
    line_items = []
    raw_sub = 0.0
    raw_gst = 0.0

    for it in items_in:
        sub  = round(it.selling_price * it.qty, 2)
        gamt = round(sub * it.gst_pct / 100, 2)
        disc_pct = round((1 - it.selling_price / it.mrp) * 100, 1) if it.mrp > 0 else 0.0
        line_items.append({
            "item_id":       it.item_id,
            "product_name":  it.product_name,
            "category":      getattr(it, "category", "") or "",
            "size":          getattr(it, "size", "") or "",
            "color":         getattr(it, "color", "") or "",
            "qty":           it.qty,
            "mrp":           it.mrp,
            "selling_price": it.selling_price,
            "discount_pct":  disc_pct,
            "subtotal":      sub,
            "gst_pct":       it.gst_pct,
            "gst_amt":       gamt,
            "total":         round(sub + gamt, 2),
        })
        raw_sub += sub
        raw_gst += gamt

    user_disc    = min(round(float(discount), 2), raw_sub)
    loyalty_disc = min(round(float(loyalty_redeem_rupees), 2), max(0.0, raw_sub - user_disc))
    disc_amt     = round(user_disc + loyalty_disc, 2)
    adj_sub      = round(raw_sub - disc_amt, 2)
    adj_gst      = round((raw_gst / raw_sub * adj_sub) if raw_sub else 0, 2)
    grand        = _round_rupee(adj_sub + adj_gst)
    change       = round(amount_paid - grand, 2)

    # Allow underpayment only when Credit line is involved.
    # Matches "Credit" (full credit) and "Cash+Credit" / "UPI+Credit" etc. (split),
    # but NOT "Credit Card" (that's immediate card payment, not a credit line).
    _mode = (payment_mode or "").lower()
    _has_credit_line = _mode == "credit" or _mode.endswith("+credit")
    if change < -0.01 and not _has_credit_line:
        raise HTTPException(
            status_code=400,
            detail=f"Amount paid Rs.{amount_paid} is less than total Rs.{grand}."
        )

    if disc_amt > 0 and line_items:
        per_item = disc_amt / len(line_items)
        for li in line_items:
            adj_s         = round(li["subtotal"] - per_item, 2)
            adj_g         = round(adj_s * li["gst_pct"] / 100, 2)
            li["subtotal"] = adj_s
            li["gst_amt"]  = adj_g
            li["total"]    = round(adj_s + adj_g, 2)

    return line_items, raw_sub, user_disc, loyalty_disc, adj_gst, grand, change


from app.services.receipts import generate_receipt_pdf as _generate_receipt_pdf  # noqa: E402


def _hsn_codes(db: Session, store_code: str, raw_items) -> dict:
    """HSN code per item for the tax invoice (bill lines don't store it; the product does)."""
    ids = {getattr(r, "item_id", None) for r in raw_items}
    rows = db.query(Product.item_id, Product.hsn_code).filter(Product.store_code == store_code, Product.item_id.in_(ids)).all()
    return {i: h for i, h in rows if h}


# ── POST /bills ────────────────────────────────────────────────────────────────
def _refresh_wallet_object(store_code: str, customer_id: str):
    """Background task: push updated point balance to Google Wallet (safe no-op if disabled)."""
    try:
        from app.core.database import SessionLocal
        from app.services.google_wallet import upsert_loyalty_object
        db2 = SessionLocal()
        try:
            store = db2.query(Store).filter(Store.store_code == store_code).first()
            program = db2.query(LoyaltyProgram).filter(LoyaltyProgram.store_code == store_code).first()
            customer = db2.query(Customer).filter(
                Customer.store_code == store_code,
                Customer.customer_id == customer_id,
            ).first()
            if not (store and program and program.enabled and program.wallet_class_id and customer):
                return
            obj_id = upsert_loyalty_object(store, program, customer)
            if obj_id and not customer.wallet_object_id:
                customer.wallet_object_id = obj_id
                db2.commit()
        finally:
            db2.close()
    except Exception:
        # Wallet not configured or transient failure — never break the bill flow.
        pass


@router.post("/", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(
    payload: BillCreate,
    background_tasks: BackgroundTasks,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc      = identity["store_code"]
    cashier = identity["username"]

    if not payload.items:
        raise HTTPException(status_code=400, detail="Bill must have at least one item.")

    # Loyalty: validate redemption against program + customer balance BEFORE computing bill
    program = db.query(LoyaltyProgram).filter(LoyaltyProgram.store_code == sc).first()
    customer = None
    if payload.customer_id and payload.customer_id != "WALKIN":
        customer = db.query(Customer).filter(
            Customer.store_code == sc, Customer.customer_id == payload.customer_id,
        ).first()

    credit_used = round(max(0.0, float(payload.store_credit_used or 0)), 2)
    if credit_used > 0:
        if not customer:
            raise HTTPException(status_code=400, detail="Store credit can only be used by a named customer.")
        if credit_used > round(customer.store_credit or 0, 2):
            raise HTTPException(status_code=400, detail=f"Customer only has ₹{customer.store_credit or 0:.0f} store credit.")

    redeem_pts = max(0, int(payload.points_redeemed or 0))
    if redeem_pts > 0:
        if not (program and program.enabled):
            raise HTTPException(status_code=400, detail="Loyalty program is not enabled for this store.")
        if not customer:
            raise HTTPException(status_code=400, detail="Points can only be redeemed on named customers.")
        if redeem_pts > (customer.loyalty_pts or 0):
            raise HTTPException(status_code=400, detail=f"Customer only has {customer.loyalty_pts or 0} points.")
        if redeem_pts < (program.min_redeem_points or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Minimum {program.min_redeem_points} points required to redeem."
            )

    try:
        line_items, raw_sub, user_disc, loyalty_disc, adj_gst, grand, change = _compute_bill(
            payload.items, payload.discount, payload.discount_type,
            payload.amount_paid + credit_used, payload.payment_mode,
            loyalty_redeem_rupees=float(redeem_pts),  # 1 point = ₹1
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bill calculation error: {str(e)}")

    if credit_used > grand:
        raise HTTPException(status_code=400, detail=f"Store credit used (₹{credit_used:.0f}) is more than the bill total (₹{grand}).")

    # Cap loyalty redemption at program.max_redeem_percent of raw_sub
    if redeem_pts > 0 and program:
        cap_rupees = round(raw_sub * (program.max_redeem_percent or 100) / 100, 2)
        if loyalty_disc > cap_rupees:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot redeem more than {program.max_redeem_percent:.0f}% of the bill (₹{cap_rupees:.0f} max)."
            )
    redeemed_pts_actual = int(round(loyalty_disc))  # 1 pt = ₹1

    # Points earned on the *net after loyalty discount* (adj_sub, before GST): grand - GST portion
    # We use raw_sub - loyalty_disc so store discounts still earn full points.
    earn_pts = 0
    if program and program.enabled and customer:
        earn_base = max(0.0, raw_sub - loyalty_disc)
        earn_pts = int(earn_base * (program.points_per_rupee or 0))

    bill_no    = _next_bill_no(db, sc)
    bill_date  = datetime.date.today().strftime("%Y-%m-%d")
    bill_time  = datetime.datetime.now().strftime("%I:%M %p")
    token      = str(uuid.uuid4())

    # Determine status
    # Full-credit AND partial-credit (e.g. "Cash+Credit") both mark the bill as Credit
    # when there's a shortfall, so the outstanding amount rolls into credit_balance.
    _mode_l = (payload.payment_mode or "").lower()
    _has_credit_line = _mode_l == "credit" or _mode_l.endswith("+credit")
    bill_status = "Paid"
    if _has_credit_line and change < 0:
        bill_status = "Credit"

    try:
        bill = Bill(
            store_code    = sc,
            bill_no       = bill_no,
            bill_date     = bill_date,
            bill_time     = bill_time,
            customer_id   = payload.customer_id   or "WALKIN",
            customer_name = WALK_IN if (payload.customer_id or "WALKIN") == "WALKIN" else (payload.customer_name or WALK_IN),
            phone         = payload.phone         or "",
            subtotal      = raw_sub,
            discount      = round(user_disc + loyalty_disc, 2),  # combined for legacy reports
            discount_type = payload.discount_type,
            gst_total     = adj_gst,
            grand_total   = grand,
            amount_paid   = round(payload.amount_paid + credit_used, 2),
            change_amt    = change,
            payment_mode  = payload.payment_mode,
            cashier       = cashier,
            status        = bill_status,
            notes         = payload.notes or "",
            share_token   = token,
            loyalty_earned_pts   = earn_pts,
            loyalty_redeemed_pts = redeemed_pts_actual,
            stock_deducted       = True,
            store_credit_used    = credit_used,
        )
        db.add(bill)
        db.flush()

        # Take sold items off the shelf (custom/unlisted items have no product row)
        for li in line_items:
            if str(li["item_id"]).startswith("CUSTOM"):
                continue
            prod = db.query(Product).filter(
                Product.store_code == sc, Product.item_id == li["item_id"],
            ).first()
            if prod:
                prod.stock_qty = max(0, (prod.stock_qty or 0) - int(li["qty"]))

        for li in line_items:
            db.execute(
                text("""
                    INSERT INTO bill_items
                        (bill_id, store_code, item_id, product_name, category,
                         size, color, qty, mrp, selling_price, discount_pct,
                         subtotal, gst_pct, gst_amt, total)
                    VALUES
                        (:bill_id, :store_code, :item_id, :product_name, :category,
                         :size, :color, :qty, :mrp, :selling_price, :discount_pct,
                         :subtotal, :gst_pct, :gst_amt, :total)
                """),
                {"bill_id": bill.id, "store_code": sc, **{k: li[k] for k in li}},
            )

        if customer:
            customer.total_purchase = round((customer.total_purchase or 0) + grand, 2)
            customer.member_type = tier_for_spend(customer.total_purchase, customer.member_type)
            if credit_used:
                customer.store_credit = round((customer.store_credit or 0) - credit_used, 2)
            # Apply loyalty: deduct redeemed, add earned. If no program, no change.
            new_pts = (customer.loyalty_pts or 0) - redeemed_pts_actual + earn_pts
            customer.loyalty_pts = max(0, new_pts)
            # Track credit balance for credit payments
            if bill_status == "Credit":
                customer.credit_balance = round((customer.credit_balance or 0) + abs(change), 2)

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bill save failed: {str(e)}")

    db.refresh(bill)
    raw_items = db.execute(
        text("SELECT * FROM bill_items WHERE bill_id=:bill_id ORDER BY id"),
        {"bill_id": bill.id}
    ).fetchall()

    # Push updated point balance to Google Wallet asynchronously (no-op if unconfigured)
    if customer and program and program.enabled and (earn_pts > 0 or redeemed_pts_actual > 0):
        background_tasks.add_task(_refresh_wallet_object, sc, customer.customer_id)

    # On first bill (link never sent), synchronously generate the Add-to-Wallet link
    # so the frontend can include it in the WhatsApp receipt.
    wallet_link = None
    if (customer and program and program.enabled and program.wallet_class_id
            and not customer.wallet_link_sent_at):
        try:
            from app.services.google_wallet import build_add_to_wallet_url
            store_obj = db.query(Store).filter(Store.store_code == sc).first()
            wallet_link = build_add_to_wallet_url(store_obj, program, customer)
            if wallet_link:
                from datetime import datetime as _dt, timezone as _tz
                customer.wallet_link_sent_at = _dt.now(_tz.utc)
                db.commit()
        except Exception:
            wallet_link = None

    return {
        "id": bill.id, "store_code": bill.store_code, "bill_no": bill.bill_no,
        "bill_date": bill.bill_date, "bill_time": bill.bill_time,
        "customer_id": bill.customer_id, "customer_name": bill.customer_name,
        "phone": bill.phone, "subtotal": bill.subtotal, "discount": bill.discount,
        "discount_type": bill.discount_type, "gst_total": bill.gst_total,
        "grand_total": bill.grand_total, "amount_paid": bill.amount_paid,
        "change_amt": bill.change_amt, "payment_mode": bill.payment_mode,
        "cashier": bill.cashier, "status": bill.status, "notes": bill.notes,
        "share_token": bill.share_token, "created_at": bill.created_at,
        "void_reason": bill.void_reason, "voided_by": bill.voided_by, "voided_at": bill.voided_at,
        "loyalty_earned_pts": bill.loyalty_earned_pts or 0,
        "loyalty_redeemed_pts": bill.loyalty_redeemed_pts or 0,
        "store_credit_used": bill.store_credit_used or 0,
        "wallet_link": wallet_link,
        "items": [
            {"id": r[0], "item_id": r[3], "product_name": r[4], "category": r[5],
             "size": r[6], "color": r[7], "qty": r[8], "mrp": r[9],
             "selling_price": r[10], "discount_pct": r[11], "subtotal": r[12],
             "gst_pct": r[13], "gst_amt": r[14], "total": r[15]}
            for r in raw_items
        ],
        "returns": [],
    }


# ── GET /bills (+ /bills/summary) ─────────────────────────────────────────────
PAY_GROUPS = {"cash", "upi", "card", "credit", "split"}


def _filtered_bills(db: Session, sc: str, *, q=None, date=None, customer=None, customer_id=None,
                    payment_mode=None, pay=None, date_from=None, date_to=None, category=None,
                    due_only=False, cashier=None, include_void=True):
    query = db.query(Bill).filter(Bill.store_code == sc)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Bill.bill_no.ilike(like), Bill.customer_name.ilike(like), Bill.phone.ilike(like)))
    if date:         query = query.filter(Bill.bill_date.like(f"%{date}%"))
    if customer:     query = query.filter(Bill.customer_name.ilike(f"%{customer}%"))
    if customer_id:  query = query.filter(Bill.customer_id == customer_id)
    if payment_mode: query = query.filter(Bill.payment_mode == payment_mode)
    if pay in PAY_GROUPS:
        mode = Bill.payment_mode
        if pay == "cash":     query = query.filter(mode.ilike("%cash%"))
        elif pay == "upi":    query = query.filter(mode.ilike("%upi%"))
        elif pay == "card":   query = query.filter(or_(mode.ilike("%card%"), mode.ilike("%net banking%")))
        elif pay == "credit": query = query.filter(or_(mode == "Credit", mode.ilike("%+credit"), Bill.status == "Credit"))
        elif pay == "split":  query = query.filter(mode.like("%+%"))
    if date_from:    query = query.filter(Bill.bill_date >= date_from)
    if date_to:      query = query.filter(Bill.bill_date <= date_to)
    if category is not None:
        names = category.split("|")
        cond = BillItem.category.in_(names)
        if "" in names or "Uncategorized" in names:
            cond = or_(cond, BillItem.category.is_(None), BillItem.category == "")
        query = query.filter(Bill.id.in_(db.query(BillItem.bill_id).filter(BillItem.store_code == sc, cond)))
    if due_only:     query = query.filter(Bill.change_amt < 0, Bill.status != "Void")
    if cashier:      query = query.filter(Bill.cashier == cashier)
    if not include_void: query = query.filter(Bill.status != "Void")
    return query


def _summary_row(b: Bill) -> dict:
    walk_in = (b.customer_id or "WALKIN") == "WALKIN" or (b.customer_name or "").strip().lower() in ("walk-in", "walkin", "")
    return {
        "id": b.id, "bill_no": b.bill_no, "bill_date": b.bill_date, "bill_time": b.bill_time,
        "customer_id": b.customer_id, "customer_name": WALK_IN if walk_in else b.customer_name,
        "phone": b.phone, "grand_total": b.grand_total, "amount_paid": b.amount_paid or 0,
        "change_amt": b.change_amt or 0, "payment_mode": b.payment_mode, "status": b.status,
        "cashier": b.cashier, "void_reason": b.void_reason, "share_token": b.share_token,
    }


@router.get("/", response_model=List[BillSummary])
def list_bills(
    q: Optional[str]            = Query(None, description="Bill no, customer name or phone"),
    date: Optional[str]         = Query(None),
    customer: Optional[str]     = Query(None),
    customer_id: Optional[str]  = Query(None),
    payment_mode: Optional[str] = Query(None),
    pay: Optional[str]          = Query(None, description="cash | upi | card | credit | split"),
    date_from: Optional[str]    = Query(None, description="YYYY-MM-DD, inclusive"),
    date_to: Optional[str]      = Query(None, description="YYYY-MM-DD, inclusive"),
    category: Optional[str]     = Query(None, description="'|'-separated category spellings"),
    due_only: bool              = Query(False),
    cashier: Optional[str]      = Query(None),
    sort: str                   = Query("-date", description="date | total | due, '-' prefix = descending"),
    skip: int = 0,
    limit: int = Query(100, le=5000),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    query = _filtered_bills(db, sc, q=q, date=date, customer=customer, customer_id=customer_id,
                            payment_mode=payment_mode, pay=pay, date_from=date_from, date_to=date_to,
                            category=category, due_only=due_only, cashier=cashier)
    desc = sort.startswith("-")
    key = sort.lstrip("-")
    if key == "total":
        order = [Bill.grand_total.desc() if desc else Bill.grand_total.asc(), Bill.id.desc()]
    elif key == "due":   # most owed first when descending (change_amt is negative for dues)
        order = [Bill.change_amt.asc() if desc else Bill.change_amt.desc(), Bill.id.desc()]
    else:
        order = [Bill.bill_date.desc(), Bill.id.desc()] if desc else [Bill.bill_date.asc(), Bill.id.asc()]
    return [_summary_row(b) for b in query.order_by(*order).offset(skip).limit(limit).all()]


@router.get("/summary")
def bills_summary(
    q: Optional[str]            = Query(None),
    customer: Optional[str]     = Query(None),
    customer_id: Optional[str]  = Query(None),
    pay: Optional[str]          = Query(None),
    date_from: Optional[str]    = Query(None),
    date_to: Optional[str]      = Query(None),
    category: Optional[str]     = Query(None),
    due_only: bool              = Query(False),
    cashier: Optional[str]      = Query(None),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    """Totals for the same filters as GET /bills (voided bills counted separately)."""
    from sqlalchemy import func
    sc = identity["store_code"]
    base = _filtered_bills(db, sc, q=q, customer=customer, customer_id=customer_id, pay=pay,
                           date_from=date_from, date_to=date_to, category=category,
                           due_only=due_only, cashier=cashier)
    live = base.filter(Bill.status != "Void")
    count, total = live.with_entities(func.count(Bill.id), func.coalesce(func.sum(Bill.grand_total), 0)).one()
    due = sum(-c for (c,) in live.with_entities(Bill.change_amt).filter(Bill.change_amt < 0).all())
    by_mode = {"Cash": 0.0, "UPI": 0.0, "Card": 0.0, "Credit": 0.0, "Split": 0.0, "Store credit": 0.0}
    for mode, amt in live.with_entities(Bill.payment_mode, Bill.grand_total).all():
        m = (mode or "").lower()
        if m.startswith("store credit"): k = "Store credit"
        elif "+" in m and not m.endswith("+credit"): k = "Split"
        elif m == "credit" or m.endswith("+credit"): k = "Credit"
        elif "upi" in m: k = "UPI"
        elif "card" in m or "net banking" in m: k = "Card"
        else: k = "Cash"
        by_mode[k] += float(amt or 0)
    cashiers = [c for (c,) in db.query(Bill.cashier).filter(Bill.store_code == sc, Bill.cashier.isnot(None))
                .distinct().order_by(Bill.cashier).all()]
    return {
        "count": int(count), "total": round(float(total), 2), "due": round(due, 2),
        "by_mode": {k: round(v, 2) for k, v in by_mode.items() if v},
        "voided": base.filter(Bill.status == "Void").count(),
        "cashiers": cashiers,
    }


# ── GET /bills/public/{share_token} — no auth, for WhatsApp PDF links ──────────
@router.get("/public/{share_token}")
def get_public_receipt(
    share_token: str,
    paper: Optional[str] = None,
    db: Session = Depends(get_db),
):
    bill = db.query(Bill).filter(Bill.share_token == share_token).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Receipt not found.")

    raw_items = db.execute(
        text("SELECT * FROM bill_items WHERE bill_id=:bill_id ORDER BY id"),
        {"bill_id": bill.id}
    ).fetchall()

    store = db.query(Store).filter(Store.store_code == bill.store_code).first()
    customer = None
    if bill.customer_id and bill.customer_id != "WALKIN":
        customer = db.query(Customer).filter(
            Customer.store_code == bill.store_code,
            Customer.customer_id == bill.customer_id,
        ).first()

    pdf_bytes = _generate_receipt_pdf(bill, raw_items, store, paper_size=paper, customer=customer,
                                      hsn=_hsn_codes(db, bill.store_code, raw_items))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Receipt_{bill.bill_no}.pdf"'},
    )


def _bill_returns_data(db: Session, bill_id: int) -> list:
    """Fetch all returns for a bill as dicts for BillOut.returns."""
    returns = db.query(BillReturn).filter(BillReturn.bill_id == bill_id).order_by(BillReturn.id).all()
    result = []
    for r in returns:
        result.append({
            "id": r.id, "bill_no": r.bill_no, "return_date": r.return_date,
            "return_time": r.return_time, "refund_amount": r.refund_amount,
            "refund_method": r.refund_method, "processed_by": r.processed_by,
            "due_reduced": r.due_reduced, "store_credit_added": r.store_credit_added, "cash_refund": r.cash_refund,
            "notes": r.notes, "created_at": r.created_at,
            "return_items": [
                {
                    "id": ri.id, "bill_item_id": ri.bill_item_id,
                    "item_id": ri.item_id, "product_name": ri.product_name,
                    "return_qty": ri.return_qty, "refund_per_item": ri.refund_per_item,
                    "refund_subtotal": ri.refund_subtotal,
                }
                for ri in r.return_items
            ],
        })
    return result


# ── GET /bills/{bill_no} ───────────────────────────────────────────────────────
@router.get("/{bill_no}", response_model=BillOut)
def get_bill(
    bill_no: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc   = identity["store_code"]
    bill = db.query(Bill).filter(Bill.store_code == sc, Bill.bill_no == bill_no).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")

    raw_items = db.execute(
        text("SELECT * FROM bill_items WHERE bill_id=:bill_id ORDER BY id"),
        {"bill_id": bill.id}
    ).fetchall()

    return {
        "id": bill.id, "store_code": bill.store_code, "bill_no": bill.bill_no,
        "bill_date": bill.bill_date, "bill_time": bill.bill_time,
        "customer_id": bill.customer_id, "customer_name": bill.customer_name,
        "phone": bill.phone, "subtotal": bill.subtotal, "discount": bill.discount,
        "discount_type": bill.discount_type, "gst_total": bill.gst_total,
        "grand_total": bill.grand_total, "amount_paid": bill.amount_paid,
        "change_amt": bill.change_amt, "payment_mode": bill.payment_mode,
        "cashier": bill.cashier, "status": bill.status, "notes": bill.notes,
        "share_token": bill.share_token, "created_at": bill.created_at,
        "void_reason": bill.void_reason, "voided_by": bill.voided_by, "voided_at": bill.voided_at,
        "loyalty_earned_pts": bill.loyalty_earned_pts or 0,
        "loyalty_redeemed_pts": bill.loyalty_redeemed_pts or 0,
        "store_credit_used": bill.store_credit_used or 0,
        "items": [
            {"id": r[0], "item_id": r[3], "product_name": r[4], "category": r[5],
             "size": r[6], "color": r[7], "qty": r[8], "mrp": r[9],
             "selling_price": r[10], "discount_pct": r[11], "subtotal": r[12],
             "gst_pct": r[13], "gst_amt": r[14], "total": r[15]}
            for r in raw_items
        ],
        "returns": _bill_returns_data(db, bill.id),
    }


# ── GET /bills/{bill_no}/receipt-pdf — authenticated print ────────────────────
@router.get("/{bill_no}/receipt-pdf")
def get_receipt_pdf(
    bill_no: str,
    paper: Optional[str] = None,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc   = identity["store_code"]
    bill = db.query(Bill).filter(Bill.store_code == sc, Bill.bill_no == bill_no).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")

    raw_items = db.execute(
        text("SELECT * FROM bill_items WHERE bill_id=:bill_id ORDER BY id"),
        {"bill_id": bill.id}
    ).fetchall()

    store = db.query(Store).filter(Store.store_code == sc).first()
    customer = None
    if bill.customer_id and bill.customer_id != "WALKIN":
        customer = db.query(Customer).filter(
            Customer.store_code == sc,
            Customer.customer_id == bill.customer_id,
        ).first()
    pdf_bytes = _generate_receipt_pdf(bill, raw_items, store, paper_size=paper, customer=customer,
                                      hsn=_hsn_codes(db, bill.store_code, raw_items))

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Receipt_{bill_no}.pdf"'},
    )


# ── POST /bills/{bill_no}/return ──────────────────────────────────────────────
@router.post("/{bill_no}/return", response_model=ReturnOut)
def return_bill_items(
    bill_no: str,
    payload: ReturnRequest,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc      = identity["store_code"]
    cashier = identity["username"]

    bill = db.query(Bill).filter(Bill.store_code == sc, Bill.bill_no == bill_no).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")
    if bill.status in ("Void", "Returned"):
        raise HTTPException(status_code=400, detail=f"Cannot return items on a {bill.status} bill.")
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items specified for return.")
    if payload.refund_method == "Store Credit" and (bill.customer_id or "WALKIN") == "WALKIN":
        raise HTTPException(status_code=400, detail="Store credit needs a named customer. Refund this walk-in bill in cash.")

    # Build map of bill_item_id -> BillItem for this bill
    bill_items = {bi.id: bi for bi in db.query(BillItem).filter(BillItem.bill_id == bill.id).all()}

    # Build map of bill_item_id -> already_returned_qty from previous returns
    already_returned: dict[int, int] = {}
    prev_returns = db.query(BillReturnItem).join(
        BillReturn, BillReturnItem.return_id == BillReturn.id
    ).filter(BillReturn.bill_id == bill.id).all()
    for pri in prev_returns:
        already_returned[pri.bill_item_id] = already_returned.get(pri.bill_item_id, 0) + pri.return_qty

    total_refund = 0.0
    return_item_rows = []

    for req_item in payload.items:
        bi = bill_items.get(req_item.bill_item_id)
        if not bi:
            raise HTTPException(
                status_code=400,
                detail=f"Item ID {req_item.bill_item_id} does not belong to bill {bill_no}."
            )
        max_returnable = bi.qty - already_returned.get(bi.id, 0)
        if req_item.return_qty > max_returnable:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot return {req_item.return_qty} of '{bi.product_name}'. "
                       f"Max returnable: {max_returnable}."
            )

        refund_per_item = round(bi.total / bi.qty, 2) if bi.qty else 0.0
        refund_subtotal = round(refund_per_item * req_item.return_qty, 2)
        total_refund += refund_subtotal

        return_item_rows.append({
            "bill_item_id":    bi.id,
            "item_id":         bi.item_id,
            "product_name":    bi.product_name,
            "return_qty":      req_item.return_qty,
            "refund_per_item": refund_per_item,
            "refund_subtotal": refund_subtotal,
        })

    total_refund = round(total_refund, 2)
    now = datetime.datetime.now()

    # Settle the refund in the right order:
    #  1. anything still unpaid on THIS bill is written off first (no cash for goods never paid for)
    #  2. Store Credit: pays down the customer's other dues, the rest becomes store credit they can spend
    #  3. Cash: the remainder is handed back
    cust = None
    if bill.customer_id and bill.customer_id != "WALKIN":
        cust = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == bill.customer_id).first()
    bill_due     = max(0.0, -(bill.change_amt or 0))
    due_reduced  = round(min(total_refund, bill_due), 2)
    remaining    = round(total_refund - due_reduced, 2)
    credit_added = 0.0
    cash_refund  = 0.0
    if payload.refund_method == "Store Credit":
        if cust:
            other_dues = max(0.0, (cust.credit_balance or 0) - due_reduced)
            pay_down = round(min(remaining, other_dues), 2)
            due_reduced = round(due_reduced + pay_down, 2)
            credit_added = round(remaining - pay_down, 2)
    else:
        cash_refund = remaining

    try:
        # Create return record
        bill_return = BillReturn(
            store_code    = sc,
            bill_id       = bill.id,
            bill_no       = bill_no,
            return_date   = now.strftime("%Y-%m-%d"),
            return_time   = now.strftime("%I:%M %p"),
            refund_amount = total_refund,
            refund_method = payload.refund_method,
            due_reduced        = due_reduced,
            store_credit_added = credit_added,
            cash_refund        = cash_refund,
            processed_by  = cashier,
            notes         = payload.notes or "",
        )
        db.add(bill_return)
        db.flush()

        for row in return_item_rows:
            db.add(BillReturnItem(return_id=bill_return.id, **row))

        # Restore stock for returned products (only if the sale took it off the shelf)
        for row in return_item_rows:
            if bill.stock_deducted and row["item_id"] and not str(row["item_id"]).startswith("CUSTOM"):
                prod = db.query(Product).filter(
                    Product.store_code == sc,
                    Product.item_id    == row["item_id"],
                ).first()
                if prod:
                    prod.stock_qty = (prod.stock_qty or 0) + row["return_qty"]

        # Update bill status
        all_returned = True
        for bi in bill_items.values():
            returned_so_far = already_returned.get(bi.id, 0)
            for row in return_item_rows:
                if row["bill_item_id"] == bi.id:
                    returned_so_far += row["return_qty"]
            if returned_so_far < bi.qty:
                all_returned = False
                break
        bill.status = "Returned" if all_returned else "Partial Return"

        # This bill's own unpaid amount shrinks by what was written off against it
        bill_part = min(due_reduced, bill_due)
        if bill_part:
            bill.change_amt = round((bill.change_amt or 0) + bill_part, 2)

        # Adjust customer totals
        if cust:
            cust.total_purchase = max(0.0, round((cust.total_purchase or 0) - total_refund, 2))
            pts_deduct = int(total_refund // 100)
            cust.loyalty_pts = max(0, (cust.loyalty_pts or 0) - pts_deduct)
            cust.credit_balance = max(0.0, round((cust.credit_balance or 0) - due_reduced, 2))
            cust.store_credit = round((cust.store_credit or 0) + credit_added, 2)

        db.commit()
        db.refresh(bill_return)

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Return failed: {str(e)}")

    return {
        "id": bill_return.id, "bill_no": bill_return.bill_no,
        "return_date": bill_return.return_date, "return_time": bill_return.return_time,
        "refund_amount": bill_return.refund_amount, "refund_method": bill_return.refund_method,
        "due_reduced": bill_return.due_reduced, "store_credit_added": bill_return.store_credit_added,
        "cash_refund": bill_return.cash_refund,
        "processed_by": bill_return.processed_by, "notes": bill_return.notes,
        "created_at": bill_return.created_at,
        "return_items": [
            {
                "id": ri.id, "bill_item_id": ri.bill_item_id,
                "item_id": ri.item_id, "product_name": ri.product_name,
                "return_qty": ri.return_qty, "refund_per_item": ri.refund_per_item,
                "refund_subtotal": ri.refund_subtotal,
            }
            for ri in bill_return.return_items
        ],
    }


# ── DELETE /bills/{bill_no} ────────────────────────────────────────────────────
@router.post("/{bill_no}/void", response_model=MessageResponse)
def void_bill(
    bill_no: str,
    payload: VoidRequest,
    identity: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Cancel a bill: it stays in history (struck through) but leaves reports, stock and balances."""
    sc   = identity["store_code"]
    bill = (
        db.query(Bill)
        .filter(Bill.store_code == sc, Bill.bill_no == bill_no,
                Bill.status.in_(["Paid", "Credit", "Partial Return"]))
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found, or it is already cancelled / fully returned.")

    # Quantities already returned were put back on the shelf by the return itself
    returned: dict[int, int] = {}
    for ri in (db.query(BillReturnItem).join(BillReturn, BillReturnItem.return_id == BillReturn.id)
               .filter(BillReturn.bill_id == bill.id).all()):
        returned[ri.bill_item_id] = returned.get(ri.bill_item_id, 0) + ri.return_qty
    refunded = sum(r.refund_amount or 0 for r in db.query(BillReturn).filter(BillReturn.bill_id == bill.id).all())

    if bill.stock_deducted:
        for bi in db.query(BillItem).filter(BillItem.bill_id == bill.id).all():
            keep = (bi.qty or 0) - returned.get(bi.id, 0)
            if keep <= 0 or str(bi.item_id).startswith("CUSTOM"):
                continue
            prod = db.query(Product).filter(Product.store_code == sc, Product.item_id == bi.item_id).first()
            if prod:
                prod.stock_qty = (prod.stock_qty or 0) + keep

    if bill.customer_id and bill.customer_id != "WALKIN":
        cust = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == bill.customer_id).first()
        if cust:
            cust.total_purchase = max(0.0, round((cust.total_purchase or 0) - (bill.grand_total - refunded), 2))
            if bill.change_amt and bill.change_amt < 0:
                cust.credit_balance = max(0.0, round((cust.credit_balance or 0) + bill.change_amt, 2))
            cust.loyalty_pts = max(0, (cust.loyalty_pts or 0) - (bill.loyalty_earned_pts or 0)
                                   + (bill.loyalty_redeemed_pts or 0))
            if bill.store_credit_used:
                cust.store_credit = round((cust.store_credit or 0) + bill.store_credit_used, 2)

    bill.status      = "Void"
    bill.void_reason = payload.reason
    bill.voided_by   = identity["username"]
    bill.voided_at   = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    return MessageResponse(message=f"Bill {bill_no} has been cancelled.")


@router.post("/receipt-preview")
def receipt_preview(
    payload: ReceiptPreviewRequest,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    """A sample bill rendered with the settings being edited (nothing is saved)."""
    from types import SimpleNamespace as NS
    store = db.query(Store).filter(Store.store_code == identity["store_code"]).first()
    # Same column order as the bill_items table: receipts read rows by name and by position
    from collections import namedtuple
    Row = namedtuple("Row", "id bill_id store_code item_id product_name category size color qty mrp "
                            "selling_price discount_pct subtotal gst_pct gst_amt total")
    items = [
        Row(1, 0, identity["store_code"], "ITM001", "Cotton Kurta", "Kurtis", "M", "Blue", 2, 899, 799, 11.1, 1598, 5, 79.9, 1677.9),
        Row(2, 0, identity["store_code"], "ITM003", "Slim Jeans", "Jeans", "32", "Black", 1, 1499, 1499, 0, 1499, 5, 74.95, 1573.95),
        Row(3, 0, identity["store_code"], "ITM008", "Leather Belt", "Accessories", "Free Size", "Brown", 1, 399, 399, 0, 399, 12, 47.88, 446.88),
    ]
    now = datetime.datetime.now()
    bill = NS(
        id=0, store_code=identity["store_code"], bill_no="BILL0001", bill_date=now.strftime("%Y-%m-%d"),
        bill_time=now.strftime("%I:%M %p"), customer_id="CUST001", customer_name="Priya Sharma", phone="9876543210",
        subtotal=3496.0, discount=100.0, discount_type="Rs.", gst_total=197.0, grand_total=3593.0,
        amount_paid=3600.0, change_amt=7.0, payment_mode="Cash", cashier=identity["username"], status="Paid",
        notes="", share_token=None, loyalty_earned_pts=34, loyalty_redeemed_pts=0, store_credit_used=0,
        created_at=now,
    )
    pdf = _generate_receipt_pdf(bill, items, store, customer=NS(loyalty_pts=120, credit_balance=0, gst_no=None),
                                overrides=payload.model_dump(), hsn={"ITM001": "6211", "ITM003": "6203", "ITM008": "4203"})
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="receipt-preview.pdf"'})


@router.post("/{bill_no}/link-customer", response_model=MessageResponse)
def link_bill_customer(
    bill_no: str,
    payload: LinkCustomer,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    """Attach a bill whose customer isn't on file to a real customer, so its due is tracked."""
    sc = identity["store_code"]
    bill = db.query(Bill).filter(Bill.store_code == sc, Bill.bill_no == bill_no).first()
    cust = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == payload.customer_id).first()
    if not bill or not cust:
        raise HTTPException(status_code=404, detail="Bill or customer not found.")
    known = db.query(Customer).filter(Customer.store_code == sc, Customer.customer_id == bill.customer_id).first()
    if known:
        raise HTTPException(status_code=400, detail=f"{bill_no} already belongs to {known.name}.")
    bill.customer_id, bill.customer_name, bill.phone = cust.customer_id, cust.name, cust.phone or bill.phone
    if bill.status != "Void":
        cust.total_purchase = round((cust.total_purchase or 0) + (bill.grand_total or 0), 2)
        cust.member_type = tier_for_spend(cust.total_purchase, cust.member_type)
        if (bill.change_amt or 0) < 0:
            cust.credit_balance = round((cust.credit_balance or 0) - bill.change_amt, 2)
    db.commit()
    return MessageResponse(message=f"{bill_no} is now linked to {cust.name}.")


@router.delete("/{bill_no}", response_model=MessageResponse)
def void_bill_legacy(
    bill_no: str,
    identity: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Older clients: cancel without a reason."""
    return void_bill(bill_no, VoidRequest(reason="Cancelled (no reason given)"), identity, db)

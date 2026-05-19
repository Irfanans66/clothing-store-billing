"""
app/routers/bills.py  — Fixed version
"""
import datetime
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.deps import require_store_access
from app.models.models import Bill, BillItem, Customer, Store
from app.schemas.schemas import BillCreate, BillOut, BillSummary, MessageResponse

router = APIRouter(prefix="/bills", tags=["Bills"])


def _next_bill_no(db: Session, store_code: str) -> str:
    # Use global max id to ensure bill_no is unique across all stores
    from sqlalchemy import func
    max_id = db.query(func.max(Bill.id)).scalar() or 0
    return f"BILL{(max_id + 1):04d}"


def _compute_bill(items_in, discount: float, discount_type: str, amount_paid: float):
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

    # Apply discount
    if discount_type == "%":
        disc_amt = round(raw_sub * discount / 100, 2)
    else:
        disc_amt = min(float(discount), raw_sub)

    adj_sub   = round(raw_sub - disc_amt, 2)
    adj_gst   = round((raw_gst / raw_sub * adj_sub) if raw_sub else 0, 2)
    grand     = round(adj_sub + adj_gst, 2)
    change    = round(amount_paid - grand, 2)

    if change < -0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Amount paid Rs.{amount_paid} is less than total Rs.{grand}."
        )

    # Distribute discount proportionally
    if disc_amt > 0 and line_items:
        per_item = disc_amt / len(line_items)
        for li in line_items:
            adj_s         = round(li["subtotal"] - per_item, 2)
            adj_g         = round(adj_s * li["gst_pct"] / 100, 2)
            li["subtotal"] = adj_s
            li["gst_amt"]  = adj_g
            li["total"]    = round(adj_s + adj_g, 2)

    return line_items, raw_sub, disc_amt, adj_gst, grand, change


# ── POST /bills ────────────────────────────────────────────────────────────────
@router.post("/", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(
    payload: BillCreate,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc      = identity["store_code"]
    cashier = identity["username"]

    if not payload.items:
        raise HTTPException(status_code=400, detail="Bill must have at least one item.")

    try:
        line_items, raw_sub, disc_amt, adj_gst, grand, change = _compute_bill(
            payload.items, payload.discount, payload.discount_type, payload.amount_paid
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bill calculation error: {str(e)}")

    bill_no   = _next_bill_no(db, sc)
    bill_date = datetime.date.today().strftime("%Y-%m-%d")
    bill_time = datetime.datetime.now().strftime("%I:%M %p")

    try:
        # ── 1. Insert bill header ──────────────────────────────────────────
        bill = Bill(
            store_code    = sc,
            bill_no       = bill_no,
            bill_date     = bill_date,
            bill_time     = bill_time,
            customer_id   = payload.customer_id   or "WALKIN",
            customer_name = payload.customer_name or "Walk-in",
            phone         = payload.phone         or "",
            subtotal      = raw_sub,
            discount      = disc_amt,
            discount_type = payload.discount_type,
            gst_total     = adj_gst,
            grand_total   = grand,
            amount_paid   = payload.amount_paid,
            change_amt    = change,
            payment_mode  = payload.payment_mode,
            cashier       = cashier,
            status        = "Paid",
            notes         = payload.notes or "",
        )
        db.add(bill)
        db.flush()   # write bill header first so bill.id exists

        # ── 2. Insert line items using raw SQL to avoid FK mismatch ────────
        # ── 2. Insert line items ───────────────────────────────────────────
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
                {
                    "bill_id": bill.id,
                    "store_code": sc,
                    "item_id": li["item_id"],
                    "product_name": li["product_name"],
                    "category": li["category"],
                    "size": li["size"],
                    "color": li["color"],
                    "qty": li["qty"],
                    "mrp": li["mrp"],
                    "selling_price": li["selling_price"],
                    "discount_pct": li["discount_pct"],
                    "subtotal": li["subtotal"],
                    "gst_pct": li["gst_pct"],
                    "gst_amt": li["gst_amt"],
                    "total": li["total"],
                }
            )

        # ── 3. Update customer loyalty points ──────────────────────────────
        if payload.customer_id and payload.customer_id != "WALKIN":
            cust = db.query(Customer).filter(
                Customer.store_code  == sc,
                Customer.customer_id == payload.customer_id,
            ).first()
            if cust:
                cust.total_purchase = round((cust.total_purchase or 0) + grand, 2)
                cust.loyalty_pts    = (cust.loyalty_pts or 0) + int(grand // 100)

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Bill save failed: {str(e)}"
        )

    # ── 4. Reload bill with items and return ──────────────────────────────
    db.refresh(bill)
    # Manually attach items since we used raw SQL
    raw_items = db.execute(
        text("SELECT * FROM bill_items WHERE bill_id=:bill_id ORDER BY id"),
        {"bill_id": bill.id}
    ).fetchall()

    # Build response manually
    bill_dict = {
        "id":            bill.id,
        "store_code":    bill.store_code,
        "bill_no":       bill.bill_no,
        "bill_date":     bill.bill_date,
        "bill_time":     bill.bill_time,
        "customer_id":   bill.customer_id,
        "customer_name": bill.customer_name,
        "phone":         bill.phone,
        "subtotal":      bill.subtotal,
        "discount":      bill.discount,
        "discount_type": bill.discount_type,
        "gst_total":     bill.gst_total,
        "grand_total":   bill.grand_total,
        "amount_paid":   bill.amount_paid,
        "change_amt":    bill.change_amt,
        "payment_mode":  bill.payment_mode,
        "cashier":       bill.cashier,
        "status":        bill.status,
        "notes":         bill.notes,
        "created_at":    bill.created_at,
        "items": [
            {
                "id":            row[0],
                "item_id":       row[3],
                "product_name":  row[4],
                "category":      row[5],
                "size":          row[6],
                "color":         row[7],
                "qty":           row[8],
                "mrp":           row[9],
                "selling_price": row[10],
                "discount_pct":  row[11],
                "subtotal":      row[12],
                "gst_pct":       row[13],
                "gst_amt":       row[14],
                "total":         row[15],
            }
            for row in raw_items
        ],
    }
    return bill_dict


# ── GET /bills ─────────────────────────────────────────────────────────────────
@router.get("/", response_model=List[BillSummary])
def list_bills(
    date: Optional[str]         = Query(None),
    customer: Optional[str]     = Query(None),
    payment_mode: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    q  = db.query(Bill).filter(Bill.store_code == sc)
    if date:         q = q.filter(Bill.bill_date.like(f"%{date}%"))
    if customer:     q = q.filter(Bill.customer_name.ilike(f"%{customer}%"))
    if payment_mode: q = q.filter(Bill.payment_mode == payment_mode)
    return q.order_by(Bill.id.desc()).offset(skip).limit(limit).all()


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
        "created_at": bill.created_at,
        "items": [
            {"id": r[0], "item_id": r[3], "product_name": r[4], "category": r[5],
             "size": r[6], "color": r[7], "qty": r[8], "mrp": r[9],
             "selling_price": r[10], "discount_pct": r[11], "subtotal": r[12],
             "gst_pct": r[13], "gst_amt": r[14], "total": r[15]}
            for r in raw_items
        ],
    }


# ── GET /bills/{bill_no}/receipt-pdf ──────────────────────────────────────────
@router.get("/{bill_no}/receipt-pdf")
def get_receipt_pdf(
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

    store = db.query(Store).filter(Store.store_code == sc).first()

    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.units import mm
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab not installed.")

    W   = 80 * mm
    buf = io.BytesIO()
    H   = (65 + len(raw_items) * 14 + 45) * mm
    c   = rl_canvas.Canvas(buf, pagesize=(W, H))
    y   = H - 6 * mm

    def ctr(txt, font="Courier-Bold", sz=9):
        nonlocal y
        c.setFont(font, sz)
        c.drawCentredString(W / 2, y, str(txt))
        y -= (sz + 3) * 0.8 * mm

    def lft(txt, font="Courier", sz=8):
        nonlocal y
        c.setFont(font, sz)
        c.drawString(3 * mm, y, str(txt)[:50])
        y -= (sz + 2) * 0.75 * mm

    def rw(lt, rt, bold=False, sz=8):
        nonlocal y
        c.setFont("Courier-Bold" if bold else "Courier", sz)
        c.drawString(3 * mm, y, str(lt)[:32])
        c.drawRightString(W - 3 * mm, y, str(rt))
        y -= (sz + 2) * 0.75 * mm

    def dash():
        nonlocal y
        c.setFont("Courier", 7)
        c.drawCentredString(W / 2, y, "-" * 44)
        y -= 3.2 * mm

    ctr(store.store_name if store else "STORE", sz=11)
    if store:
        ctr(store.address or "", "Courier", 7)
        ctr(f"Ph: {store.phone or ''}  GSTIN: {store.gstin or ''}", "Courier", 7)
    dash()
    lft(f"Bill #  : {bill.bill_no}")
    lft(f"Date    : {bill.bill_date}  {bill.bill_time}")
    lft(f"Cust    : {bill.customer_name or 'Walk-in'}")
    lft(f"Phone   : {bill.phone or '-'}")
    dash()
    rw("ITEM", "AMT", bold=True)
    dash()

    for r in raw_items:
        lft(f"{str(r[4] or '')[:24]} ({r[6] or ''})", sz=7)
        rw(f"  {r[8]}x Rs.{r[10]:.2f} [GST {r[13]}%]", f"Rs.{r[12]:.2f}", sz=7)

    dash()
    rw("Subtotal",          f"Rs.{bill.subtotal:.2f}")
    if bill.discount > 0:
        rw(f"Discount ({bill.discount_type})", f"-Rs.{bill.discount:.2f}")
    rw("GST",               f"Rs.{bill.gst_total:.2f}")
    rw("TOTAL",             f"Rs.{bill.grand_total:.2f}", bold=True, sz=10)
    dash()
    lft(f"Payment : {bill.payment_mode}")
    rw("Paid",              f"Rs.{bill.amount_paid:.2f}")
    if bill.change_amt > 0:
        rw("Change",        f"Rs.{bill.change_amt:.2f}")
    if bill.notes:
        lft(f"Note: {bill.notes}", sz=7)
    dash()
    ctr("* Thank You! Visit Again *", "Courier-Bold", 8)
    ctr("Exchange within 7 days with receipt", "Courier", 6)
    c.save()

    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Receipt_{bill_no}.pdf"'},
    )


# ── DELETE /bills/{bill_no} ────────────────────────────────────────────────────
@router.delete("/{bill_no}", response_model=MessageResponse)
def void_bill(
    bill_no: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    if identity["role"] not in ("Admin", "Manager"):
        raise HTTPException(status_code=403, detail="Admin/Manager required.")

    sc = identity["store_code"]

    bill = (
        db.query(Bill)
        .filter(
            Bill.store_code == sc,
            Bill.bill_no == bill_no,
            Bill.status == "Paid"
        )
        .first()
    )

    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")

    bill.status = "Void"

    db.commit()

    return MessageResponse(
        message=f"Bill {bill_no} has been voided."
    )
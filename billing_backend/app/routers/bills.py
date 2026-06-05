"""
app/routers/bills.py
"""
import datetime
import io
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.deps import require_store_access
from app.models.models import Bill, BillItem, BillReturn, BillReturnItem, Customer, Product, Store
from app.schemas.schemas import BillCreate, BillOut, BillSummary, MessageResponse, ReturnRequest, ReturnOut

router = APIRouter(prefix="/bills", tags=["Bills"])


def _next_bill_no(db: Session, store_code: str) -> str:
    from sqlalchemy import func
    max_id = db.query(func.max(Bill.id)).scalar() or 0
    return f"BILL{(max_id + 1):04d}"


def _compute_bill(items_in, discount: float, discount_type: str, amount_paid: float, payment_mode: str = "Cash"):
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

    disc_amt = min(round(float(discount), 2), raw_sub)
    adj_sub  = round(raw_sub - disc_amt, 2)
    adj_gst  = round((raw_gst / raw_sub * adj_sub) if raw_sub else 0, 2)
    grand    = round(adj_sub + adj_gst)
    change   = round(amount_paid - grand, 2)

    # Allow underpayment only for Credit mode
    if change < -0.01 and payment_mode.lower() != "credit":
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

    return line_items, raw_sub, disc_amt, adj_gst, grand, change


def _generate_receipt_pdf(bill, raw_items, store, paper_size: str = "3inch") -> bytes:
    """Generate thermal receipt PDF bytes. Reusable by both auth and public endpoints."""
    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.units import mm
        from reportlab.lib.utils import ImageReader
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab not installed.")

    is_2inch = paper_size == "2inch"
    upi_id    = (store.upi_id or "").strip() if store else ""
    has_qr    = bool(upi_id) and not is_2inch  # skip QR on 2-inch to save space
    qr_size_mm = 28 if has_qr else 0

    W   = (58 if is_2inch else 80) * mm
    buf = io.BytesIO()
    H   = (75 + len(raw_items) * 13 + 55 + (qr_size_mm + 18 if has_qr else 0)) * mm if is_2inch \
          else (85 + len(raw_items) * 15 + 65 + (qr_size_mm + 22 if has_qr else 0)) * mm
    c   = rl_canvas.Canvas(buf, pagesize=(W, H))
    y   = H - 5 * mm

    # font/layout constants differ by paper size
    _ctr_sz  = 8  if is_2inch else 9
    _lft_sz  = 7  if is_2inch else 8
    _rw_sz   = 7  if is_2inch else 8
    _dash_ch = 32 if is_2inch else 44
    _lft_max = 36 if is_2inch else 50
    _rw_max  = 22 if is_2inch else 32
    _pad     = 2 * mm

    def ctr(txt, font="Courier-Bold", sz=None):
        nonlocal y
        sz = sz or _ctr_sz
        c.setFont(font, sz)
        c.drawCentredString(W / 2, y, str(txt))
        y -= (sz + 3) * 0.8 * mm

    def lft(txt, font="Courier", sz=None):
        nonlocal y
        sz = sz or _lft_sz
        c.setFont(font, sz)
        c.drawString(_pad, y, str(txt)[:_lft_max])
        y -= (sz + 2) * 0.75 * mm

    def rw(lt, rt, bold=False, sz=None):
        nonlocal y
        sz = sz or _rw_sz
        c.setFont("Courier-Bold" if bold else "Courier", sz)
        c.drawString(_pad, y, str(lt)[:_rw_max])
        c.drawRightString(W - _pad, y, str(rt))
        y -= (sz + 2) * 0.75 * mm

    def dash():
        nonlocal y
        c.setFont("Courier", 7)
        c.drawCentredString(W / 2, y, "-" * _dash_ch)
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
        # Columns: id, bill_id, store_code, item_id, product_name, category, size, color,
        #          qty, mrp, selling_price, discount_pct, subtotal, gst_pct, gst_amt, total
        lft(f"{str(r[4] or '')[:24]} ({r[6] or ''})", sz=7)
        rw(f"  {r[8]}x Rs.{r[10]:.2f} [GST {r[13]}%]", f"Rs.{r[12]:.2f}", sz=7)

    dash()
    rw("Subtotal", f"Rs.{bill.subtotal:.2f}")
    if bill.discount > 0:
        rw(f"Discount ({bill.discount_type})", f"-Rs.{bill.discount:.2f}")
    rw("GST", f"Rs.{bill.gst_total:.2f}")
    rw("TOTAL", f"Rs.{int(bill.grand_total)}", bold=True, sz=10)
    dash()
    lft(f"Payment : {bill.payment_mode}")
    rw("Paid", f"Rs.{bill.amount_paid:.0f}")
    if bill.change_amt > 0:
        rw("Change", f"Rs.{bill.change_amt:.0f}")
    elif bill.change_amt < 0:
        rw("Balance Due", f"Rs.{abs(bill.change_amt):.0f}", bold=True)
    if bill.notes:
        lft(f"Note: {bill.notes}", sz=7)
    dash()
    ctr("* Thank You! Visit Again *", "Courier-Bold", 8)
    ctr("Exchange within 7 days with receipt", "Courier", 6)

    if has_qr:
        try:
            import qrcode
            upi_url = (
                f"upi://pay?pa={upi_id}&pn={store.store_name}"
                f"&am={int(bill.grand_total)}&cu=INR"
                f"&tn=Bill%20{bill.bill_no}"
            )
            qr_img = qrcode.make(upi_url)
            qr_buf = io.BytesIO()
            qr_img.save(qr_buf, format="PNG")
            qr_buf.seek(0)
            dash()
            ctr("Scan to Pay via UPI", "Courier-Bold", 8)
            qr_side = qr_size_mm * mm
            qr_y    = max(y - qr_side, 6 * mm)
            c.drawImage(ImageReader(qr_buf), (W - qr_side) / 2, qr_y, width=qr_side, height=qr_side)
            y = qr_y - 2 * mm
            ctr(upi_id, "Courier", 7)
        except Exception:
            pass

    c.save()
    return buf.getvalue()


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
            payload.items, payload.discount, payload.discount_type,
            payload.amount_paid, payload.payment_mode,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bill calculation error: {str(e)}")

    bill_no    = _next_bill_no(db, sc)
    bill_date  = datetime.date.today().strftime("%Y-%m-%d")
    bill_time  = datetime.datetime.now().strftime("%I:%M %p")
    token      = str(uuid.uuid4())

    # Determine status
    bill_status = "Paid"
    if payload.payment_mode.lower() == "credit" and change < 0:
        bill_status = "Credit"

    try:
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
            status        = bill_status,
            notes         = payload.notes or "",
            share_token   = token,
        )
        db.add(bill)
        db.flush()

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

        if payload.customer_id and payload.customer_id != "WALKIN":
            cust = db.query(Customer).filter(
                Customer.store_code  == sc,
                Customer.customer_id == payload.customer_id,
            ).first()
            if cust:
                cust.total_purchase = round((cust.total_purchase or 0) + grand, 2)
                cust.loyalty_pts    = (cust.loyalty_pts or 0) + int(grand // 100)
                # Track credit balance for credit payments
                if bill_status == "Credit":
                    cust.credit_balance = round((cust.credit_balance or 0) + abs(change), 2)

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
        "items": [
            {"id": r[0], "item_id": r[3], "product_name": r[4], "category": r[5],
             "size": r[6], "color": r[7], "qty": r[8], "mrp": r[9],
             "selling_price": r[10], "discount_pct": r[11], "subtotal": r[12],
             "gst_pct": r[13], "gst_amt": r[14], "total": r[15]}
            for r in raw_items
        ],
        "returns": [],
    }


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


# ── GET /bills/public/{share_token} — no auth, for WhatsApp PDF links ──────────
@router.get("/public/{share_token}")
def get_public_receipt(
    share_token: str,
    paper: str = "3inch",
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

    pdf_bytes = _generate_receipt_pdf(bill, raw_items, store, paper_size=paper)
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
    paper: str = "3inch",
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
    pdf_bytes = _generate_receipt_pdf(bill, raw_items, store, paper_size=paper)

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
            processed_by  = cashier,
            notes         = payload.notes or "",
        )
        db.add(bill_return)
        db.flush()

        for row in return_item_rows:
            db.add(BillReturnItem(return_id=bill_return.id, **row))

        # Restore stock for returned products
        for row in return_item_rows:
            if row["item_id"] and row["item_id"] != "CUSTOM":
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

        # Adjust customer totals
        if bill.customer_id and bill.customer_id != "WALKIN":
            cust = db.query(Customer).filter(
                Customer.store_code  == sc,
                Customer.customer_id == bill.customer_id,
            ).first()
            if cust:
                cust.total_purchase = max(0.0, round((cust.total_purchase or 0) - total_refund, 2))
                pts_deduct = int(total_refund // 100)
                cust.loyalty_pts = max(0, (cust.loyalty_pts or 0) - pts_deduct)
                if payload.refund_method == "Store Credit":
                    cust.credit_balance = round((cust.credit_balance or 0) + total_refund, 2)

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
@router.delete("/{bill_no}", response_model=MessageResponse)
def void_bill(
    bill_no: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    if identity["role"] not in ("Admin", "Manager"):
        raise HTTPException(status_code=403, detail="Admin/Manager required.")

    sc   = identity["store_code"]
    bill = (
        db.query(Bill)
        .filter(Bill.store_code == sc, Bill.bill_no == bill_no, Bill.status.in_(["Paid", "Credit"]))
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")

    bill.status = "Void"
    db.commit()
    return MessageResponse(message=f"Bill {bill_no} has been voided.")
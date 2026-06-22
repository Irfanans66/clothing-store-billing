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


def _amount_to_words(amount: float) -> str:
    """Convert float rupee amount to Indian English words."""
    ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
            'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
            'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
    tens_w = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

    def _two(n):
        return ones[n] if n < 20 else (tens_w[n // 10] + (' ' + ones[n % 10] if n % 10 else '')).strip()

    def _three(n):
        h, r2 = divmod(n, 100)
        return ' '.join(([ones[h] + ' HUNDRED'] if h else []) + ([_two(r2)] if r2 else []))

    rup, pai = int(amount), round((amount - int(amount)) * 100)
    if rup == 0:
        return ('RUPEES ZERO AND ' + _two(pai) + ' PAISA ONLY') if pai else 'RUPEES ZERO ONLY'
    parts, r = [], rup
    for div, lbl in [(10000000, 'CRORE'), (100000, 'LAKH'), (1000, 'THOUSAND')]:
        if r >= div:
            parts.append(_three(r // div) + ' ' + lbl)
            r %= div
    if r:
        parts.append(_three(r))
    result = 'RUPEES ' + ' '.join(parts)
    if pai:
        result += ' AND ' + _two(pai) + ' PAISA'
    return result + ' ONLY'


def _receipt_design1(bill, raw_items, store) -> bytes:
    """Design 1 — Sales Invoice: rounded border, red store name, blue header, colored item table."""
    from reportlab.pdfgen import canvas as rc
    from reportlab.lib.units import mm
    import io

    W, pad = 80 * mm, 3.5 * mm
    n = len(raw_items)
    saddr  = (store.address or '') if store else ''
    tc_txt = (store.notes or 'NO RETURN, ONLY EXCHANGE WITHIN 7 DAYS WITH BILL.') if store else 'NO RETURN, ONLY EXCHANGE WITHIN 7 DAYS WITH BILL.'
    addr_l = max(1, -(-len(saddr) // 38))
    tc_l   = max(2, -(-len(tc_txt) // 40))
    H = (60 + addr_l * 4 + n * 14 + 38 + tc_l * 3.5 + 38) * mm

    buf = io.BytesIO()
    c = rc.Canvas(buf, pagesize=(W, H))
    y = H - 5.5 * mm

    c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(1.2)
    c.roundRect(1.5 * mm, 1.5 * mm, W - 3 * mm, H - 3 * mm, 2.5 * mm)
    c.setLineWidth(0.5)

    def hline(gap=3):
        nonlocal y
        c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(0.5)
        c.line(pad, y, W - pad, y); y -= gap * mm

    gstin = (store.gstin or '') if store else ''
    phone = (store.phone or '') if store else ''
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 6.5)
    c.drawString(pad, y, f'GSTIN : {gstin}')
    c.drawRightString(W - pad, y, phone); y -= 4 * mm

    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 15)
    c.drawCentredString(W / 2, y, store.store_name if store else 'STORE'); y -= 7 * mm

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
    for i in range(0, len(saddr), 38):
        c.drawCentredString(W / 2, y, saddr[i:i + 38]); y -= 4 * mm

    hline(3)
    c.setFillColorRGB(0, 0, 0.8); c.setFont('Courier-Bold', 10)
    c.drawCentredString(W / 2, y, 'SALES INVOICE'); y -= 5 * mm
    hline(4)

    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8)
    c.drawString(pad, y, 'Bill No :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad + 17 * mm, y, bill.bill_no)
    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(W / 2 + 3 * mm, y, 'Date :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(W / 2 + 14 * mm, y, bill.bill_date); y -= 4.5 * mm
    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(W / 2 + 3 * mm, y, 'Time :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(W / 2 + 14 * mm, y, bill.bill_time); y -= 5 * mm

    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8)
    c.drawString(pad, y, 'Customer Details :'); y -= 4 * mm
    for lbl, val in [('Name :', bill.customer_name or 'Cash'), ('Address :', 'Local'), ('Contact :', bill.phone or '-')]:
        c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(pad, y, lbl)
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad + 17 * mm, y, str(val)[:24]); y -= 4 * mm
    y -= 1 * mm

    hline(1)
    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8)
    _c1, _c2, _c3, _c4 = pad, pad + 9 * mm, pad + 40 * mm, pad + 52 * mm
    c.drawString(_c1, y, 'Sr.'); c.drawString(_c2, y, 'Product')
    c.drawString(_c3, y, 'Qty'); c.drawString(_c4, y, 'Rate')
    c.drawRightString(W - pad, y, 'Amount'); y -= 3 * mm; hline(3)

    for i, r in enumerate(raw_items, 1):
        nm = str(r[4] or '')[:18]; qty, price, total = float(r[8]), float(r[10]), float(r[15])
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(_c1, y, str(i))
        c.setFont('Courier', 8); c.drawString(_c2, y, nm)
        c.drawString(_c3, y, f'{qty:.3f}'); c.drawString(_c4, y, f'{price:.2f}')
        c.drawRightString(W - pad, y, f'{total:.2f}'); y -= 4 * mm
        c.setFont('Courier', 7); c.drawString(_c3, y, 'PCS'); y -= 4 * mm

    hline(2)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad, y, str(len(raw_items)))
    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(W / 2 - 5 * mm, y, 'Total :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
    c.drawRightString(W - pad, y, f'{float(bill.subtotal):.2f}'); y -= 4.5 * mm

    disc = float(bill.discount or 0); grand = float(bill.grand_total)
    saved_top = y
    for lbl, val, big in [('Bill Discount', f'{disc:.2f}', False), ('Round Off', '0.00', False), ('Net Total', f'{grand:.2f}', True)]:
        c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 10 if big else 8)
        c.drawString(W / 2 - 5 * mm, y, lbl)
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold' if big else 'Courier', 10 if big else 8)
        c.drawRightString(W - pad, y, val); y -= (6 if big else 4.5) * mm

    if disc > 0:
        c.setFillColorRGB(0, 0, 0.8); c.setFont('Courier-Bold', 10)
        c.drawString(pad, saved_top, 'YOU'); c.drawString(pad, saved_top - 5 * mm, 'SAVED')
        c.setFont('Courier-Bold', 11); c.drawString(pad, saved_top - 10 * mm, f'₹ {disc:.2f}')

    hline(3)
    words = _amount_to_words(grand)
    c.setFillColorRGB(0.85, 0.35, 0); c.setFont('Courier-Bold', 7)
    c.drawString(pad, y, 'Amount in words :'); y -= 3.5 * mm
    for i in range(0, len(words), 38):
        c.drawString(pad, y, words[i:i + 38]); y -= 3.5 * mm
    y -= 1 * mm; hline(3)

    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 7)
    c.drawString(pad, y, 'Terms & Conditions'); y -= 3.5 * mm
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 6.5)
    for i in range(0, len(tc_txt), 40):
        c.drawString(pad, y, tc_txt[i:i + 40]); y -= 3 * mm
    y -= 2 * mm

    try:
        from reportlab.graphics.barcode import code128
        bc = code128.Code128(bill.bill_no, barWidth=0.65 * mm, barHeight=10 * mm, humanReadable=False)
        bc.drawOn(c, (W - bc.width) / 2, y - 10 * mm); y -= 14 * mm
    except Exception:
        pass

    c.setFillColorRGB(0, 0, 0.7); c.setFont('Courier-BoldOblique', 8)
    c.drawCentredString(W / 2, y, 'Thank You... Visit Again !'); y -= 6 * mm

    c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(0.5)
    col_w = W / 2 - pad
    for lbl, val in [('Bill Points', '0.00'), ('Used Point', '0'), ('Used Amt', '0'), ('Balance Points', '0.00')]:
        c.rect(pad, y - 4 * mm, col_w, 4 * mm)
        c.rect(pad + col_w, y - 4 * mm, W - pad * 2 - col_w, 4 * mm)
        c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 7); c.drawString(pad + 1 * mm, y - 3 * mm, lbl)
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 7); c.drawRightString(W - pad - 1 * mm, y - 3 * mm, val)
        y -= 4 * mm

    c.save()
    return buf.getvalue()


def _receipt_design2(bill, raw_items, store) -> bytes:
    """Design 2 — Dark header, per-item discount rows, MRP total, payment details table."""
    from reportlab.pdfgen import canvas as rc
    from reportlab.lib.units import mm
    import io

    W, pad = 80 * mm, 3 * mm
    n = len(raw_items)
    sname  = store.store_name if store else 'STORE'
    saddr  = (store.address or '') if store else ''
    phone  = (store.phone or '') if store else ''
    addr_l = max(1, -(-len(saddr) // 38))
    H = (70 + addr_l * 5 + n * 18 + 72) * mm

    buf = io.BytesIO()
    c = rc.Canvas(buf, pagesize=(W, H))
    y = H

    def hline(gap=3, color=(0.5, 0.5, 0.5), lw=0.5, dash=False):
        nonlocal y
        c.setStrokeColorRGB(*color); c.setLineWidth(lw)
        if dash: c.setDash(3, 2)
        c.line(pad, y, W - pad, y)
        if dash: c.setDash()
        c.setLineWidth(0.5); y -= gap * mm

    # Black header
    hdr_h = (16 + addr_l * 5) * mm
    c.setFillColorRGB(0, 0, 0); c.rect(0, H - hdr_h, W, hdr_h, fill=1, stroke=0)
    y = H - 5 * mm
    c.setFillColorRGB(1, 1, 1); c.setFont('Courier-Bold', 13)
    c.drawCentredString(W / 2, y, sname); y -= 6 * mm
    c.setFont('Courier', 8)
    for i in range(0, len(saddr), 38):
        c.drawCentredString(W / 2, y, saddr[i:i + 38]); y -= 4 * mm
    c.drawCentredString(W / 2, y, 'Bihar'); y -= 5 * mm

    # Contact rounded gray box
    c.setFillColorRGB(0.85, 0.85, 0.85); c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.roundRect(pad, y - 5 * mm, W - pad * 2, 6 * mm, 2 * mm, fill=1, stroke=1)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 9)
    c.drawCentredString(W / 2, y - 3.5 * mm, f'Contact : {phone}'); y -= 9 * mm

    # Dashed-border customer block
    box_h = 24 * mm
    c.setFillColorRGB(0.96, 0.96, 0.96); c.setStrokeColorRGB(0.5, 0.5, 0.5)
    c.setDash(3, 2); c.rect(pad, y - box_h, W - pad * 2, box_h, fill=1, stroke=1); c.setDash()
    y -= 3 * mm
    c.setFillColorRGB(0.8, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(pad + 2 * mm, y, 'Inv No')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad + 15 * mm, y, bill.bill_no)
    c.setFillColorRGB(0.8, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(W / 2 + 2 * mm, y, 'Date :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(W / 2 + 13 * mm, y, bill.bill_date); y -= 4 * mm
    c.setFillColorRGB(0.8, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(W / 2 + 2 * mm, y, 'Time :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(W / 2 + 13 * mm, y, bill.bill_time); y -= 4 * mm
    for lbl, val in [('Customer Name :', bill.customer_name or 'Cash'), ('Address :', 'Local'), ('State :', 'Bihar')]:
        c.setFillColorRGB(0.8, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(pad + 2 * mm, y, lbl)
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad + 30 * mm, y, str(val)); y -= 4 * mm
    y -= 2 * mm

    # Items table header
    c.setFillColorRGB(0.15, 0.15, 0.15); c.setFont('Courier-Bold', 8)
    _c = [pad, pad + 22 * mm, pad + 34 * mm, pad + 48 * mm]
    c.drawString(_c[0], y, 'Product'); c.drawString(_c[1], y, 'MRP')
    c.drawString(_c[2], y, 'Rate'); c.drawString(_c[3], y, 'Qty')
    c.drawRightString(W - pad, y, 'Amount'); y -= 2.5 * mm; hline(2, dash=True)

    mrp_total = 0.0
    for r in raw_items:
        nm = str(r[4] or '')[:18]; qty, mrp_v, price, total = float(r[8]), float(r[9]), float(r[10]), float(r[15])
        per_disc = round((mrp_v - price) * qty, 2); mrp_total += mrp_v * qty
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(pad, y, nm); y -= 4 * mm
        c.setFont('Courier', 8)
        c.drawString(_c[1], y, f'{mrp_v:.2f}'); c.drawString(_c[2], y, f'{price:.2f}')
        c.drawString(_c[3], y, f'{qty:.3f} PCS'); c.drawRightString(W - pad, y, f'{total:.2f}'); y -= 4 * mm
        if per_disc > 0:
            c.setFillColorRGB(0.35, 0.35, 0.35); c.setFont('Courier', 7)
            c.drawString(pad + 10 * mm, y, f'Disc : {per_disc:.2f}'); y -= 3.5 * mm
        hline(2.5, dash=True)

    grand = float(bill.grand_total); disc = float(bill.discount or 0); saved = round(mrp_total - grand, 2)
    sum_y = y
    for lbl, val, bold in [('MRP Total :', f'{mrp_total:.2f}', True), ('Bill Discount :', f'{disc:.2f}', False),
                             ('Grand Total :', f'{grand:.2f}', True), ('Round Off :', '0.00', False),
                             ('Net Total :', f'{grand:.2f}', True)]:
        c.setFillColorRGB(0, 0, 0.65); c.setFont('Courier-Bold' if bold else 'Courier', 8)
        c.drawString(W / 2, y, lbl)
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold' if bold else 'Courier', 8)
        c.drawRightString(W - pad, y, val); y -= 4.5 * mm

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad, sum_y, f'Items: {len(raw_items)}')
    if saved > 0:
        c.setFillColorRGB(0, 0, 0.7); c.setFont('Courier-Bold', 8); c.drawString(pad, sum_y - 5 * mm, 'You Saved')
        c.setFont('Courier-Bold', 10); c.drawString(pad, sum_y - 10 * mm, f'₹ {saved:.2f}')
    y -= 2 * mm; hline(2, (0.7, 0.7, 0.7))

    words = _amount_to_words(grand)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 7); c.drawString(pad, y, 'Amount in Words:'); y -= 3.5 * mm
    c.setFont('Courier', 7)
    for i in range(0, len(words), 40):
        c.drawString(pad, y, words[i:i + 40]); y -= 3.5 * mm
    y -= 2 * mm

    paid = float(bill.amount_paid or grand); pending = round(paid - grand, 2)
    for lbl, val, red in [('Paid Amount :', f'{paid:.2f}', False), ('Pending Amount :', f'{pending:.2f}', True),
                           ('Tend Amount :', f'{paid:.2f}', False), ('Balance Amount :', '0.00', False),
                           ('Cust. Credit Balance :', '0.00 Cr', False)]:
        c.setFillColorRGB(*(0.8, 0, 0) if red else (0, 0, 0.65)); c.setFont('Courier-Bold', 7.5)
        c.drawString(pad, y, lbl)
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 7.5); c.drawRightString(W - pad, y, val); y -= 4 * mm
    y -= 2 * mm

    try:
        from reportlab.graphics.barcode import code128
        bc = code128.Code128(bill.bill_no, barWidth=0.65 * mm, barHeight=10 * mm, humanReadable=False)
        bc.drawOn(c, (W - bc.width) / 2, y - 10 * mm); y -= 14 * mm
    except Exception:
        pass

    upi_id = (store.upi_id or '').strip() if store else ''
    if upi_id:
        try:
            import qrcode
            from reportlab.lib.utils import ImageReader
            qr_img = qrcode.make(f'upi://pay?pa={upi_id}&pn={sname}&am={int(grand)}&cu=INR&tn=Bill%20{bill.bill_no}')
            qr_buf = io.BytesIO(); qr_img.save(qr_buf, format='PNG'); qr_buf.seek(0)
            sz = 25 * mm
            c.drawImage(ImageReader(qr_buf), (W - sz) / 2, y - sz, sz, sz); y -= sz + 3 * mm
        except Exception:
            pass

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-BoldOblique', 8)
    c.drawCentredString(W / 2, y, 'Thank You... Visit Again !')
    c.save()
    return buf.getvalue()


def _receipt_design3(bill, raw_items, store) -> bytes:
    """Design 3 — BILL header bar, logo placeholder, red item headers, totals & payment boxes."""
    from reportlab.pdfgen import canvas as rc
    from reportlab.lib.units import mm
    import io

    W, pad = 80 * mm, 3 * mm
    n = len(raw_items)
    sname  = store.store_name if store else 'STORE'
    saddr  = (store.address or '') if store else ''
    phone  = (store.phone or '') if store else ''
    gstin  = (store.gstin or '') if store else ''
    tc_txt = (store.notes or 'NO RETURN, ONLY EXCHANGE WITHIN 7 DAYS WITH BILL.') if store else 'NO RETURN, ONLY EXCHANGE WITHIN 7 DAYS WITH BILL.'
    tc_l   = max(2, -(-len(tc_txt) // 40))
    H = (70 + n * 13 + 65 + tc_l * 3.5 + 14) * mm

    buf = io.BytesIO()
    c = rc.Canvas(buf, pagesize=(W, H))
    y = H

    # Black BILL bar
    c.setFillColorRGB(0, 0, 0); c.rect(0, H - 9 * mm, W, 9 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1); c.setFont('Courier-Bold', 12)
    c.drawCentredString(W / 2, H - 6.5 * mm, 'BILL')
    y = H - 11 * mm

    # Logo placeholder box (right)
    logo_w, logo_h = 19 * mm, 16 * mm
    lx = W - pad - logo_w
    c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(1)
    c.rect(lx, y - logo_h, logo_w, logo_h)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 9)
    c.drawCentredString(lx + logo_w / 2, y - 7 * mm, 'LOGO')
    c.drawCentredString(lx + logo_w / 2, y - 12 * mm, 'HERE')
    c.setLineWidth(0.5)

    # Store info (left)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 11)
    c.drawString(pad, y, sname); y -= 5.5 * mm
    c.setFont('Courier', 8)
    if saddr: c.drawString(pad, y, saddr[:28]); y -= 4 * mm
    c.drawString(pad, y, f'Contact :{phone}'); y -= 4 * mm
    c.drawString(pad, y, f'GSTIN :{gstin}')
    y -= max(0, (y - (H - 11 * mm - logo_h - 3 * mm)))
    y = H - 11 * mm - logo_h - 4 * mm

    c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(1)
    c.line(pad, y, W - pad, y); c.setLineWidth(0.5); y -= 4 * mm

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 8)
    c.drawString(pad, y, f'Inv No : {bill.bill_no}')
    c.drawRightString(W - pad, y, f'Date : {bill.bill_date}'); y -= 4.5 * mm
    c.drawString(pad, y, f'Customer Name : {bill.customer_name or "Cash"}')
    c.drawRightString(W - pad, y, f'Contact No : {bill.phone or "-"}'); y -= 4.5 * mm

    c.setStrokeColorRGB(0, 0, 0); c.line(pad, y, W - pad, y); y -= 3 * mm

    # Items header (red)
    c.setFillColorRGB(0.85, 0, 0); c.setFont('Courier-Bold', 8)
    _c = [pad, pad + 22 * mm, pad + 33 * mm, pad + 47 * mm]
    c.drawString(_c[0], y, 'Product'); c.drawString(_c[1], y, 'MRP')
    c.drawString(_c[2], y, 'Rate'); c.drawString(_c[3], y, 'Qty')
    c.drawRightString(W - pad, y, 'Amount'); y -= 3 * mm
    c.setStrokeColorRGB(0.85, 0, 0); c.line(pad, y, W - pad, y); y -= 3 * mm; c.setStrokeColorRGB(0, 0, 0)

    mrp_total = 0.0
    for r in raw_items:
        nm = str(r[4] or '')[:18]; qty, mrp_v, price, total = float(r[8]), float(r[9]), float(r[10]), float(r[15])
        mrp_total += mrp_v * qty
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
        c.drawString(_c[0], y, nm); c.drawString(_c[1], y, f'{mrp_v:.2f}')
        c.drawString(_c[2], y, f'{price:.2f}'); c.drawString(_c[3], y, f'{qty:.3f} PCS')
        c.drawRightString(W - pad, y, f'{total:.2f}'); y -= 4.5 * mm
        c.setDash(2, 2); c.setStrokeColorRGB(0.65, 0.65, 0.65)
        c.line(pad, y, W - pad, y); c.setDash(); c.setStrokeColorRGB(0, 0, 0); y -= 2.5 * mm

    grand = float(bill.grand_total); disc = float(bill.discount or 0)
    sub   = float(bill.subtotal); paid = float(bill.amount_paid or grand)
    saved = round(mrp_total - grand, 2)

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 8)
    c.drawString(pad, y, f'Items : {len(raw_items)}')
    c.drawRightString(W - pad, y, f'Sub Total :  {sub:.2f}'); y -= 5 * mm

    # Totals box
    box_h = 24 * mm; bx = y - box_h
    c.setFillColorRGB(0.97, 0.97, 0.97); c.setStrokeColorRGB(0, 0, 0)
    c.roundRect(pad, bx, W - pad * 2, box_h, 2 * mm, fill=1, stroke=1); y -= 4 * mm
    for lbl, val, bld in [('Bill Sundry', '0.00', False), ('Bill Discount :', f'{disc:.2f}', False),
                            ('Grand Total :', f'{grand:.2f}', True), ('Round Off :', '0.00', False),
                            ('Net Total :', f'{grand:.2f}', True)]:
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold' if bld else 'Courier', 8)
        c.drawString(pad + 2 * mm, y, lbl); c.drawRightString(W - pad - 1 * mm, y, val); y -= 4 * mm
    y = bx - 4 * mm

    # Payment box (light green)
    py_h = 10 * mm; py = y - py_h
    c.setFillColorRGB(0.95, 1, 0.88); c.setStrokeColorRGB(0.4, 0.7, 0.3)
    c.roundRect(pad, py, W - pad * 2, py_h, 2 * mm, fill=1, stroke=1); y -= 2.5 * mm
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 9)
    c.drawString(pad + 2 * mm, y, 'Paid Amount :'); c.drawRightString(W - pad - 1 * mm, y, f'{paid:.2f}'); y -= 4.5 * mm
    c.drawString(pad + 2 * mm, y, 'Pending Amount :'); c.drawRightString(W - pad - 1 * mm, y, f'{-disc:.2f}')
    y = py - 4 * mm

    if saved > 0:
        c.setFillColorRGB(0, 0, 0.7); c.setFont('Courier-Bold', 9)
        c.drawCentredString(W / 2, y, f'You Saved : ₹ {saved:.2f}'); y -= 5 * mm

    upi_id = (store.upi_id or '').strip() if store else ''
    if upi_id:
        try:
            import qrcode
            from reportlab.lib.utils import ImageReader
            qr_img = qrcode.make(f'upi://pay?pa={upi_id}&pn={sname}&am={int(grand)}&cu=INR&tn=Bill%20{bill.bill_no}')
            qr_buf = io.BytesIO(); qr_img.save(qr_buf, format='PNG'); qr_buf.seek(0)
            sz = 26 * mm; c.drawImage(ImageReader(qr_buf), (W - sz) / 2, y - sz, sz, sz); y -= sz + 3 * mm
        except Exception:
            pass

    y -= 2 * mm
    tc_h = tc_l * 3.5 * mm + 7 * mm
    c.setStrokeColorRGB(0, 0, 0); c.rect(pad, y - tc_h, W - pad * 2, tc_h); y -= 2 * mm
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 7)
    c.drawString(pad + 1 * mm, y, 'Terms and Conditions'); y -= 3.5 * mm
    c.setFont('Courier', 7)
    for i in range(0, len(tc_txt), 40):
        c.drawString(pad + 1 * mm, y, tc_txt[i:i + 40]); y -= 3.5 * mm
    y -= 2 * mm

    c.setFillColorRGB(0, 0, 0); c.rect(0, y - 9 * mm, W, 9 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1); c.setFont('Courier-BoldOblique', 9)
    c.drawCentredString(W / 2, y - 6 * mm, 'Thank You... Visit Again !')
    c.save()
    return buf.getvalue()


def _receipt_design4(bill, raw_items, store) -> bytes:
    """Design 4 — Tax Invoice: large blue store name, GST breakdown table, big total."""
    from reportlab.pdfgen import canvas as rc
    from reportlab.lib.units import mm
    import io

    W, pad = 80 * mm, 3 * mm
    n = len(raw_items)
    sname  = store.store_name if store else 'STORE'
    saddr  = (store.address or '') if store else ''
    phone  = (store.phone or '') if store else ''
    gstin  = (store.gstin or '') if store else ''
    tc_txt = (store.notes or 'NO RETURN, ONLY EXCHANGE WITHIN 7 DAYS WITH BILL.') if store else 'NO RETURN, ONLY EXCHANGE WITHIN 7 DAYS WITH BILL.'
    tc_l   = max(2, -(-len(tc_txt) // 40))
    addr_l = max(1, -(-len(saddr) // 38))
    H = (58 + addr_l * 4 + n * 12 + 60 + tc_l * 3.5) * mm

    buf = io.BytesIO()
    c = rc.Canvas(buf, pagesize=(W, H))
    y = H - 5 * mm

    def hline(gap=3, lw=0.5):
        nonlocal y
        c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(lw)
        c.line(pad, y, W - pad, y); y -= gap * mm; c.setLineWidth(0.5)

    def dline(gap=3):
        nonlocal y
        c.setDash(3, 2); c.setStrokeColorRGB(0.5, 0.5, 0.5)
        c.line(pad, y, W - pad, y); c.setDash(); y -= gap * mm

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
    c.drawCentredString(W / 2, y, 'TAX INVOICE'); y -= 5 * mm

    c.setFillColorRGB(0, 0, 0.8); c.setFont('Courier-Bold', 17)
    c.drawCentredString(W / 2, y, sname); y -= 9 * mm

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
    for i in range(0, len(saddr), 38):
        c.drawCentredString(W / 2, y, saddr[i:i + 38]); y -= 4 * mm
    if phone: c.drawCentredString(W / 2, y, f'Contact :{phone}'); y -= 4 * mm
    if gstin: c.drawCentredString(W / 2, y, f'GSTIN : {gstin}'); y -= 4 * mm

    hline(3, lw=1)

    c.setFillColorRGB(0.8, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(pad, y, 'Inv No')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(pad + 13 * mm, y, bill.bill_no)
    c.setFillColorRGB(0.8, 0, 0); c.setFont('Courier-Bold', 8); c.drawString(W / 2 + 2 * mm, y, 'Date :')
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8); c.drawString(W / 2 + 13 * mm, y, bill.bill_date); y -= 5 * mm

    for lbl, val in [('Customer Na', bill.customer_name or 'Cash'), ('Address :', 'Local'), ('Contact :', bill.phone or '-')]:
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
        c.drawString(pad, y, f'{lbl}  {val}'); y -= 4 * mm
    y -= 1 * mm; dline(3)

    c.setFillColorRGB(0.2, 0.2, 0.2); c.setFont('Courier-Bold', 8)
    tc1, tc2, tc3, tc4 = pad, pad + 12 * mm, pad + 42 * mm, pad + 55 * mm
    c.drawString(tc1, y, 'Sl.No.'); c.drawString(tc2, y, 'Item Name')
    c.drawString(tc3, y, 'QTY.'); c.drawString(tc4, y, 'Price')
    c.drawRightString(W - pad, y, 'Amount'); y -= 3 * mm; dline(2)

    total_qty = 0.0; sub = float(bill.subtotal)
    for i, r in enumerate(raw_items, 1):
        nm = str(r[4] or '')[:20]; qty, price, total = float(r[8]), float(r[10]), float(r[15])
        total_qty += qty
        c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
        c.drawString(tc1, y, f'{i}.'); c.drawString(tc2, y, nm)
        c.drawString(tc3, y, f'{qty:.3f}'); c.drawString(tc4, y, f'{price:.2f}')
        c.drawRightString(W - pad, y, f'{total:.2f}'); y -= 4 * mm; dline(2)

    grand = float(bill.grand_total); gst = float(bill.gst_total or 0)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
    c.drawString(pad, y, f'Total Item(s): {len(raw_items)}  Qty.: {total_qty:.2f}')
    c.setFont('Courier-Bold', 14); c.drawRightString(W - pad, y, f'{sub:.2f}'); y -= 7 * mm; dline(3)

    # GST table
    c.setFillColorRGB(0.15, 0.15, 0.15); c.setFont('Courier-Bold', 7.5)
    gc = [pad, pad + 11 * mm, pad + 25 * mm, pad + 38 * mm, pad + 51 * mm]
    c.drawString(gc[0], y, 'Tax %'); c.drawString(gc[1], y, 'Taxable Val')
    c.drawString(gc[2], y, 'CGST'); c.drawString(gc[3], y, 'SGST'); c.drawString(gc[4], y, 'TOTAL G')
    y -= 4 * mm
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 7.5)
    cgst = round(gst / 2, 2)
    c.drawString(gc[0], y, '0.00'); c.drawString(gc[1], y, f'{sub:.2f}')
    c.drawString(gc[2], y, f'{cgst:.2f}'); c.drawString(gc[3], y, f'{cgst:.2f}'); c.drawString(gc[4], y, f'{gst:.2f}')
    y -= 5 * mm; dline(3)

    c.setFillColorRGB(0, 0, 0); c.setFont('Courier-Bold', 16)
    c.drawString(pad, y, 'Total')
    c.drawRightString(W - pad, y, f'₹ {grand:.2f}'); y -= 9 * mm

    upi_id = (store.upi_id or '').strip() if store else ''
    if upi_id:
        try:
            import qrcode
            from reportlab.lib.utils import ImageReader
            qr_img = qrcode.make(f'upi://pay?pa={upi_id}&pn={sname}&am={int(grand)}&cu=INR&tn=Bill%20{bill.bill_no}')
            qr_buf = io.BytesIO(); qr_img.save(qr_buf, format='PNG'); qr_buf.seek(0)
            sz = 26 * mm; c.drawImage(ImageReader(qr_buf), (W - sz) / 2, y - sz, sz, sz); y -= sz + 4 * mm
        except Exception:
            pass

    dline(2)
    c.setFillColorRGB(0, 0, 0); c.setFont('Courier', 8)
    c.drawCentredString(W / 2, y, 'Terms and Conditions'); y -= 4 * mm
    c.setFont('Courier-Bold', 7)
    for i in range(0, len(tc_txt), 40):
        c.drawString(pad, y, tc_txt[i:i + 40]); y -= 3.5 * mm

    c.save()
    return buf.getvalue()


def _generate_receipt_pdf(bill, raw_items, store, paper_size: str = "3inch") -> bytes:
    """Generate receipt PDF bytes. Routes to design templates or thermal formats."""
    if paper_size == "design1":
        return _receipt_design1(bill, raw_items, store)
    if paper_size == "design2":
        return _receipt_design2(bill, raw_items, store)
    if paper_size == "design3":
        return _receipt_design3(bill, raw_items, store)
    if paper_size == "design4":
        return _receipt_design4(bill, raw_items, store)

    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.lib.units import mm
        from reportlab.lib.utils import ImageReader
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab not installed.")

    is_2inch = paper_size == "2inch"
    is_bold  = paper_size == "3inch-bold"
    upi_id    = (store.upi_id or "").strip() if store else ""
    has_qr    = bool(upi_id)
    qr_size_mm = 22 if is_2inch else 32

    W = (58 if is_2inch else 80) * mm
    buf = io.BytesIO()

    if is_2inch:
        H = (65 + len(raw_items) * 11 + 45 + (qr_size_mm + 18 if has_qr else 0)) * mm
    elif is_bold:
        H = (82 + len(raw_items) * 14 + 58 + (qr_size_mm + 22 if has_qr else 0)) * mm
    else:
        H = (50 + len(raw_items) * 9 + 38 + (qr_size_mm + 14 if has_qr else 0)) * mm

    c   = rl_canvas.Canvas(buf, pagesize=(W, H))
    y   = H - 6 * mm

    # font/layout constants
    _ctr_sz  = 9  if is_2inch else (12 if is_bold else 10)
    _lft_sz  = 9  if is_2inch else (11 if is_bold else 9)
    _rw_sz   = 9  if is_2inch else (11 if is_bold else 9)
    _dash_ch = 32 if is_2inch else 44
    _lft_max = 36 if is_2inch else 50
    _rw_max  = 22 if is_2inch else 32
    _pad     = 2 * mm
    # compact line spacing for standard 3inch; bold/2inch keep original spacing
    _ctr_lead = 0.56 if (is_2inch or is_bold) else 0.48
    _row_lead = 0.52 if (is_2inch or is_bold) else 0.44
    _dash_h   = (3.0 if is_bold else 2.6) if is_2inch else (3.0 if is_bold else 1.6)

    def ctr(txt, font="Courier-Bold", sz=None):
        nonlocal y
        sz = sz or _ctr_sz
        c.setFont(font, sz)
        c.drawCentredString(W / 2, y, str(txt))
        y -= (sz + 2) * _ctr_lead * mm

    def lft(txt, font="Courier", sz=None):
        nonlocal y
        sz = sz or _lft_sz
        c.setFont(font, sz)
        c.drawString(_pad, y, str(txt)[:_lft_max])
        y -= (sz + 1) * _row_lead * mm

    def rw(lt, rt, bold=False, sz=None):
        nonlocal y
        sz = sz or _rw_sz
        c.setFont("Courier-Bold" if bold else "Courier", sz)
        c.drawString(_pad, y, str(lt)[:_rw_max])
        c.drawRightString(W - _pad, y, str(rt))
        y -= (sz + 1) * _row_lead * mm

    def dash():
        nonlocal y
        _dsz = 8 if is_2inch else (9 if is_bold else 7)
        c.setFont("Courier", _dsz)
        c.drawCentredString(W / 2, y, "-" * _dash_ch)
        y -= _dash_h * mm

    def thick_line():
        nonlocal y
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(1.2)
        c.line(_pad, y, W - _pad, y)
        y -= 2.5 * mm
        c.setLineWidth(0.5)

    # ── Header ────────────────────────────────────────────────────────────────
    store_name = store.store_name if store else "STORE"
    if is_bold:
        ctr(store_name, sz=18)
        if store:
            ctr(store.address or "", "Courier", 9)
            ctr(f"Ph: {store.phone or ''}   GST: {store.gstin or ''}", "Courier", 9)
        thick_line()
        lft(f"Bill No : {bill.bill_no}", "Courier-Bold", 11)
        lft(f"Date    : {bill.bill_date}  {bill.bill_time}", sz=10)
        lft(f"Customer: {bill.customer_name or 'Walk-in'}", "Courier-Bold", 11)
        if bill.phone:
            lft(f"Phone   : {bill.phone}", sz=10)
        thick_line()
        rw("ITEM", "AMOUNT", bold=True, sz=12)
        thick_line()
    else:
        ctr(store_name, sz=13)
        if store:
            ctr(store.address or "", "Courier", 8)
            ctr(f"Ph: {store.phone or ''}  GSTIN: {store.gstin or ''}", "Courier", 8)
        dash()
        lft(f"Bill #  : {bill.bill_no}")
        lft(f"Date    : {bill.bill_date}  {bill.bill_time}")
        lft(f"Cust    : {bill.customer_name or 'Walk-in'}")
        lft(f"Phone   : {bill.phone or '-'}")
        dash()
        rw("ITEM", "AMT", bold=True)
        dash()

    # ── Items ─────────────────────────────────────────────────────────────────
    for r in raw_items:
        _item_sz = 9 if is_2inch else (11 if is_bold else 8)
        _price_sz = 9 if is_2inch else (10 if is_bold else 8)
        lft(f"{str(r[4] or '')[:24]} ({r[6] or ''})", sz=_item_sz)
        rw(f"  {r[8]}x Rs.{r[10]:.2f} [GST {r[13]}%]", f"Rs.{r[12]:.2f}", sz=_price_sz)

    # ── Totals ────────────────────────────────────────────────────────────────
    if is_bold:
        thick_line()
        rw("Subtotal", f"Rs.{bill.subtotal:.2f}", sz=11)
        if bill.discount > 0:
            rw(f"Discount ({bill.discount_type})", f"-Rs.{bill.discount:.2f}", sz=11)
        rw("GST", f"Rs.{bill.gst_total:.2f}", sz=11)
        thick_line()
        rw("TOTAL", f"Rs.{int(bill.grand_total)}", bold=True, sz=16)
        thick_line()
        rw(f"Payment : {bill.payment_mode}", f"Paid: Rs.{bill.amount_paid:.0f}", sz=11)
        if bill.change_amt > 0:
            rw("Change", f"Rs.{bill.change_amt:.0f}", sz=11)
        elif bill.change_amt < 0:
            rw("BALANCE DUE", f"Rs.{abs(bill.change_amt):.0f}", bold=True, sz=12)
        if bill.notes:
            lft(f"Note: {bill.notes}", sz=9)
        thick_line()
        ctr("** THANK YOU! VISIT AGAIN **", "Courier-Bold", 11)
        ctr("Exchange within 7 days with receipt", "Courier", 8)
    else:
        dash()
        rw("Subtotal", f"Rs.{bill.subtotal:.2f}")
        if bill.discount > 0:
            rw(f"Discount ({bill.discount_type})", f"-Rs.{bill.discount:.2f}")
        rw("GST", f"Rs.{bill.gst_total:.2f}")
        rw("TOTAL", f"Rs.{int(bill.grand_total)}", bold=True, sz=12)
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
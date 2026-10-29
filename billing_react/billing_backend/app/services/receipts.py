"""
app/services/receipts.py
Receipt PDFs (7 layouts) built on a small layout engine so that text never overlaps:
every line is measured and wrapped, divider lines sit in the gap *between* rows,
boxes are sized to their contents, and the page height fits the content.

Fonts: DejaVu Sans / Sans Mono (bundled, free licence) — they include the ₹ sign.
"""
from __future__ import annotations

import base64
import datetime
import io
from pathlib import Path
from types import SimpleNamespace
from typing import Callable, Optional
from urllib.parse import quote

from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas

DEFAULT_FOOTER = "Thank you! Visit again"
DEFAULT_POLICY = "Exchange within 7 days with receipt"
RUPEE = "₹"

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"
_fonts_ready = False


def _register_fonts():
    global _fonts_ready
    if _fonts_ready:
        return
    for name, file in (("Sans", "DejaVuSans.ttf"), ("Sans-Bold", "DejaVuSans-Bold.ttf"),
                       ("Mono", "DejaVuSansMono.ttf"), ("Mono-Bold", "DejaVuSansMono-Bold.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    _fonts_ready = True


# ── Formatting ────────────────────────────────────────────────────────────────

def inr(v, sym: str = RUPEE) -> str:
    """₹1,23,456.00 (Indian digit grouping, always 2 decimals)."""
    v = float(v or 0)
    neg = v < 0
    whole, frac = f"{abs(v):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{'-' if neg else ''}{sym}{whole}.{frac}"


def num(v) -> str:
    """Money without the symbol (for tables): 1,23,456.00"""
    return inr(v, sym="")


def qty_str(q) -> str:
    q = float(q or 0)
    return str(int(q)) if q == int(q) else f"{q:g}"


def date_str(d: Optional[str], short: bool = False) -> str:
    try:
        dt = datetime.date.fromisoformat(str(d)[:10])
        return dt.strftime("%d/%m/%y") if short else dt.strftime("%d %b %Y").lstrip("0")
    except (TypeError, ValueError):
        return str(d or "")


def time_str(t: Optional[str]) -> str:
    return (t or "").lstrip("0").replace(" ", " ")


def amount_in_words(amount: float) -> str:
    """Indian English words, e.g. RUPEES THREE THOUSAND FIVE HUNDRED NINETY THREE ONLY."""
    ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
            'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
    tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

    def two(n):
        return ones[n] if n < 20 else (tens[n // 10] + (' ' + ones[n % 10] if n % 10 else '')).strip()

    def three(n):
        h, r = divmod(n, 100)
        return ' '.join(([ones[h] + ' HUNDRED'] if h else []) + ([two(r)] if r else []))

    rup, pai = int(amount), round((amount - int(amount)) * 100)
    if rup == 0:
        return 'RUPEES ZERO' + (f' AND {two(pai)} PAISA' if pai else '') + ' ONLY'
    parts, r = [], rup
    for div, lbl in ((10000000, 'CRORE'), (100000, 'LAKH'), (1000, 'THOUSAND')):
        if r >= div:
            parts.append(three(r // div) + ' ' + lbl)
            r %= div
    if r:
        parts.append(three(r))
    return 'RUPEES ' + ' '.join(parts) + (f' AND {two(pai)} PAISA' if pai else '') + ' ONLY'


def upi_url(upi_id: str, store_name: str, amount: int, bill_no: str) -> str:
    return (f"upi://pay?pa={quote(upi_id, safe='')}&pn={quote(store_name or '', safe='')}&am={amount}"
            f"&cu=INR&tr={quote(bill_no, safe='')}&tn={quote(f'Payment for {bill_no}', safe='')}")


GST_STATES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
    "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
    "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
    "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
}


# ── What the receipt shows (store settings applied) ───────────────────────────

def receipt_view(store, overrides: Optional[dict] = None):
    o = overrides or {}

    def get(k, d=None):
        return o[k] if k in o else (getattr(store, k, d) if store is not None else d)

    def show(k):
        return get(k, True) is not False

    gstin = (get("gstin") or "").strip().upper()
    return SimpleNamespace(
        store_name=get("store_name") or "STORE", address=get("address") or "", phone=get("phone") or "",
        gstin_raw=gstin, gstin=gstin if show("receipt_show_gstin") else "",
        upi_id=((get("upi_id") or "").strip()) if show("receipt_show_qr") else "",
        footer=(get("receipt_footer") or "").strip() or DEFAULT_FOOTER,
        policy=(get("receipt_policy") or "").strip() or DEFAULT_POLICY,
        logo_data=get("logo_data"), show_points=show("receipt_show_points"),
    )


def _logo_reader(logo_data: Optional[str]):
    if not logo_data or "," not in logo_data:
        return None
    try:
        from reportlab.lib.utils import ImageReader
        return ImageReader(io.BytesIO(base64.b64decode(logo_data.split(",", 1)[1])))
    except Exception:
        return None


def _qr_reader(data: str):
    try:
        import qrcode
        from reportlab.lib.utils import ImageReader
        buf = io.BytesIO()
        qrcode.make(data, border=1).save(buf, format="PNG")
        buf.seek(0)
        return ImageReader(buf)
    except Exception:
        return None


# ── Bill figures shared by every layout (line amounts are BEFORE GST) ─────────

def bill_figures(bill, items, show_points: bool, hsn: Optional[dict] = None):
    lines = []
    for r in items:
        q = float(getattr(r, "qty", 0) or 0)
        sp = float(getattr(r, "selling_price", 0) or 0)
        mrp = float(getattr(r, "mrp", 0) or 0) or sp
        lines.append(SimpleNamespace(
            name=str(getattr(r, "product_name", "") or ""), size=getattr(r, "size", "") or "",
            color=getattr(r, "color", "") or "", qty=q, rate=sp, mrp=mrp, amount=round(q * sp, 2),
            gst_pct=float(getattr(r, "gst_pct", 0) or 0),
            hsn=(hsn or {}).get(getattr(r, "item_id", None)) or "",
        ))
    gross = round(sum(li.amount for li in lines), 2)
    sub = float(getattr(bill, "subtotal", None) or gross)
    disc = float(getattr(bill, "discount", 0) or 0)
    taxable = round(sub - disc, 2)
    gst = float(getattr(bill, "gst_total", 0) or 0)
    grand = float(getattr(bill, "grand_total", 0) or 0)
    item_savings = round(sum(max(0.0, li.mrp - li.rate) * li.qty for li in lines), 2)

    # GST per rate, shared out so the rows add up exactly to the bill's GST
    by_rate: dict = {}
    for li in lines:
        by_rate.setdefault(li.gst_pct, 0.0)
        by_rate[li.gst_pct] += li.amount
    weight = sum(g * r for r, g in by_rate.items()) or 1
    factor = (taxable / sub) if sub else 1
    gst_rows, gst_left = [], gst
    rates = sorted(by_rate)
    for i, rate in enumerate(rates):
        g = by_rate[rate]
        tax = round(gst * (g * rate) / weight, 2) if i < len(rates) - 1 else round(gst_left, 2)
        gst_left -= tax
        gst_rows.append(SimpleNamespace(rate=rate, taxable=round(g * factor, 2), cgst=round(tax / 2, 2),
                                        sgst=round(tax - round(tax / 2, 2), 2), total=tax))

    earned = int(getattr(bill, "loyalty_earned_pts", 0) or 0) if show_points else 0
    redeemed = int(getattr(bill, "loyalty_redeemed_pts", 0) or 0) if show_points else 0
    return SimpleNamespace(
        lines=lines, count=len(lines), total_qty=sum(li.qty for li in lines), gross=gross, sub=sub, disc=disc,
        taxable=taxable, gst=gst, grand=grand, round_off=round(grand - (taxable + gst), 2),
        mrp_total=round(sum(li.mrp * li.qty for li in lines), 2), item_savings=item_savings,
        saved=round(item_savings + disc, 2), gst_rows=gst_rows,
        paid=float(getattr(bill, "amount_paid", 0) or 0), change=float(getattr(bill, "change_amt", 0) or 0),
        credit_used=float(getattr(bill, "store_credit_used", 0) or 0), earned=earned, redeemed=redeemed,
    )


# ── Layout engine ─────────────────────────────────────────────────────────────

BLACK = (0, 0, 0)
GREY = (0.35, 0.35, 0.35)
WHITE = (1, 1, 1)


class Layout:
    """Top-down writer. In dry mode nothing is drawn — used to measure page height and box sizes."""

    def __init__(self, c, width_pt: float, height_pt: float, margin_pt: float, family: str = "Sans", dry: bool = False):
        self.c, self.W, self.H, self.m, self.family, self.dry = c, width_pt, height_pt, margin_pt, family, dry
        self.y = height_pt - margin_pt
        self.x0, self.x1 = margin_pt, width_pt - margin_pt

    # fonts / measuring
    def font(self, bold=False, family=None):
        return f"{family or self.family}{'-Bold' if bold else ''}"

    def sw(self, s, size, bold=False):
        return pdfmetrics.stringWidth(s, self.font(bold), size)

    def wrap(self, s, size, bold, width):
        out = []
        for para in str(s or "").split("\n"):
            words, line = para.split(" "), ""
            for w in words:
                cand = (line + " " + w).strip()
                if self.sw(cand, size, bold) <= width:
                    line = cand
                    continue
                if line:
                    out.append(line)
                while self.sw(w, size, bold) > width and len(w) > 1:   # one very long word: split it
                    cut = len(w)
                    while cut > 1 and self.sw(w[:cut], size, bold) > width:
                        cut -= 1
                    out.append(w[:cut])
                    w = w[cut:]
                line = w
            out.append(line)
        return out or [""]

    # drawing primitives (skipped in dry mode)
    def _fill(self, rgb):
        if not self.dry:
            self.c.setFillColorRGB(*rgb)

    def _draw(self, s, x, y, size, bold, align, color):
        if self.dry:
            return
        self.c.setFillColorRGB(*color)
        self.c.setFont(self.font(bold), size)
        if align == "center":
            self.c.drawCentredString(x, y, s)
        elif align == "right":
            self.c.drawRightString(x, y, s)
        else:
            self.c.drawString(x, y, s)

    def gap(self, pts):
        self.y -= pts

    def text(self, s, size=8, bold=False, align="left", color=BLACK, lead=1.3, x0=None, x1=None):
        x0 = self.x0 if x0 is None else x0
        x1 = self.x1 if x1 is None else x1
        for line in self.wrap(s, size, bold, x1 - x0):
            self.y -= size * lead
            x = (x0 + x1) / 2 if align == "center" else (x1 if align == "right" else x0)
            self._draw(line, x, self.y, size, bold, align, color)

    def row(self, left, right, size=8, bold=False, color=BLACK, rcolor=None, lbold=None, lead=1.3, x0=None, x1=None):
        """Label on the left (wraps if long), value on the right on the first line."""
        x0 = self.x0 if x0 is None else x0
        x1 = self.x1 if x1 is None else x1
        rw = self.sw(right, size, bold) if right else 0
        lines = self.wrap(left, size, bold if lbold is None else lbold, max(20, x1 - x0 - rw - 6))
        for i, line in enumerate(lines):
            self.y -= size * lead
            self._draw(line, x0, self.y, size, bold if lbold is None else lbold, "left", color)
            if i == 0 and right:
                self._draw(right, x1, self.y, size, bold, "right", rcolor or color)

    def rule(self, style="solid", weight=0.6, color=GREY, before=3.5, after=1.5, x0=None, x1=None):
        """A divider in the gap below the previous line — never through text."""
        self.y -= before
        if not self.dry:
            self.c.setStrokeColorRGB(*color)
            self.c.setLineWidth(weight)
            self.c.setDash(2, 2) if style == "dash" else self.c.setDash()
            self.c.line(self.x0 if x0 is None else x0, self.y, self.x1 if x1 is None else x1, self.y)
            self.c.setDash()
        self.y -= after

    def boxed(self, draw_fn: Callable, fill=None, stroke=None, pad=4, radius=0, dash=False, bleed=False):
        """Draw a box sized to whatever draw_fn writes, behind it."""
        top = self.y
        saved_dry = self.dry
        self.dry = True
        self.y -= pad
        draw_fn()
        height = (top - self.y) + pad
        self.dry, self.y = saved_dry, top
        if not self.dry:
            x, w = (0, self.W) if bleed else (self.x0, self.x1 - self.x0)
            if fill:
                self.c.setFillColorRGB(*fill)
            if stroke:
                self.c.setStrokeColorRGB(*stroke)
                self.c.setLineWidth(0.8)
            self.c.setDash(3, 2) if dash else self.c.setDash()
            if radius:
                self.c.roundRect(x, top - height, w, height, radius, fill=1 if fill else 0, stroke=1 if stroke else 0)
            else:
                self.c.rect(x, top - height, w, height, fill=1 if fill else 0, stroke=1 if stroke else 0)
            self.c.setDash()
        self.y -= pad
        inner = (self.x0, self.x1)
        if not bleed:
            self.x0, self.x1 = self.x0 + pad, self.x1 - pad
        draw_fn()
        self.x0, self.x1 = inner
        self.y = top - height

    def image(self, reader, w, h, align="center"):
        if reader is not None and not self.dry:
            x = (self.x0 + self.x1 - w) / 2 if align == "center" else (self.x1 - w if align == "right" else self.x0)
            self.c.drawImage(reader, x, self.y - h, w, h, preserveAspectRatio=True, anchor="c", mask="auto")
        self.y -= h

    def barcode(self, value, height=9 * mm):
        try:
            from reportlab.graphics.barcode import code128
            bc = code128.Code128(value, barWidth=0.6 * mm, barHeight=height, humanReadable=False)
            if bc.width > (self.x1 - self.x0):
                bc = code128.Code128(value, barWidth=(self.x1 - self.x0) / bc.width * 0.6 * mm, barHeight=height, humanReadable=False)
            if not self.dry:
                self.c.setFillColorRGB(*BLACK)   # bars take the current fill colour
                bc.drawOn(self.c, (self.W - bc.width) / 2, self.y - height)
            self.y -= height
        except Exception:
            pass


def _render(width_mm: float, margin_mm: float, family: str, body: Callable[[Layout], None], frame: Optional[Callable] = None) -> bytes:
    """Measure, then draw on a page exactly as tall as the content."""
    _register_fonts()
    W = width_mm * mm
    probe = Layout(None, W, 5000 * mm, margin_mm * mm, family, dry=True)
    body(probe)
    used = (5000 * mm - probe.y) + margin_mm * mm
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(W, used))
    lay = Layout(c, W, used, margin_mm * mm, family)
    body(lay)
    if frame:
        frame(c, W, used)
    c.save()
    return buf.getvalue()


# ── Shared blocks ─────────────────────────────────────────────────────────────

def _items(L: Layout, f, size=8, show_hsn=False, show_gst=False, per_item_saving=False, accent=BLACK):
    for li in f.lines:
        L.gap(1)
        meta = " · ".join(x for x in (li.size, li.color) if x)
        L.text(li.name + (f"  ({meta})" if meta else ""), size, True)
        extra = []
        if show_hsn and li.hsn:
            extra.append(f"HSN {li.hsn}")
        if show_gst:
            extra.append(f"GST {li.gst_pct:g}%")
        left = f"{qty_str(li.qty)} × {inr(li.rate)}" + (f"   {' · '.join(extra)}" if extra else "")
        L.row(left, inr(li.amount), size - 0.5, color=GREY, rcolor=BLACK)
        if per_item_saving and li.mrp > li.rate:
            L.text(f"MRP {inr(li.mrp)} · you save {inr((li.mrp - li.rate) * li.qty)}", size - 1.5, color=accent)


def _totals(L: Layout, f, size=8, india=True, big=12, grand_label="Grand total", grand_color=BLACK, short=False):
    label = "Subtotal" if short else f"Subtotal ({f.count} item{'s' if f.count != 1 else ''}, qty {qty_str(f.total_qty)})"
    L.row(label, inr(f.sub), size)
    if f.disc:
        L.row("Discount" + (" & points" if f.redeemed else ""), "-" + inr(f.disc), size)
        L.row("Taxable value", inr(f.taxable), size)
    if f.gst:
        if india:
            L.row("CGST", inr(f.gst / 2), size)
            L.row("SGST", inr(f.gst - round(f.gst / 2, 2)), size)
        else:
            L.row("Tax", inr(f.gst), size)
    if abs(f.round_off) >= 0.01:
        L.row("Round off", ("+" if f.round_off > 0 else "-") + inr(abs(f.round_off)), size)
    L.rule("solid", 1, BLACK, before=3, after=1)
    L.row(grand_label, inr(f.grand), big, True, color=grand_color)


def _payment(L: Layout, bill, f, size=8, customer=None):
    L.row(f"Paid ({bill.payment_mode})" if getattr(bill, "payment_mode", None) else "Paid", inr(f.paid), size)
    if f.credit_used:
        L.row("  of which store credit", inr(f.credit_used), size - 0.5, color=GREY)
    if f.change > 0:
        L.row("Change given", inr(f.change), size)
    elif f.change < 0:
        L.row("Balance due", inr(-f.change), size, True)
    if customer is not None and float(getattr(customer, "credit_balance", 0) or 0) > 0:
        L.row("Total account balance due", inr(customer.credit_balance), size - 0.5, color=GREY)


def _points(L: Layout, f, size=8, customer=None, color=BLACK):
    if not (f.earned or f.redeemed):
        return
    if f.redeemed:
        L.row("Points used", f"-{f.redeemed}", size, color=color)
    if f.earned:
        L.row("Points earned", f"+{f.earned}", size, color=color)
    if customer is not None:
        L.row("Points balance", str(int(getattr(customer, "loyalty_pts", 0) or 0)), size, color=color)


def _qr(L: Layout, s, bill, f, size=7.5, side=26 * mm):
    """UPI QR (when the store shows it): for the balance due if any, otherwise the bill total."""
    if not s.upi_id:
        return
    due = int(round(-f.change)) if f.change < 0 else int(round(f.grand))
    L.gap(3)
    L.text(f"Scan to pay {'balance ' if f.change < 0 else ''}{inr(due)} by UPI", size, True, "center")
    L.gap(2)
    L.image(_qr_reader(upi_url(s.upi_id, s.store_name, due, bill.bill_no)), side, side)
    L.text(s.upi_id, size - 0.5, align="center", color=GREY)


def _void_banner(L: Layout, bill, size=10):
    if getattr(bill, "status", "") == "Void":
        L.gap(2)
        L.boxed(lambda: L.text("CANCELLED BILL", size, True, "center", color=(0.75, 0, 0)), stroke=(0.75, 0, 0), pad=3)


def _footer(L: Layout, s, size=8, color=BLACK):
    L.gap(3)
    L.text(s.footer, size, True, "center", color)
    L.text(s.policy, size - 1.5, align="center", color=GREY)


# ── Thermal rolls (58 / 80 mm, monospaced) ────────────────────────────────────

def thermal(bill, items, s, customer, f, width_mm=80, bold=False):
    narrow = width_mm < 70
    base = 7 if narrow else (9 if bold else 8)
    title = base + (3 if bold else 3.5)

    def body(L: Layout):
        L.text(s.store_name, title, True, "center")
        if s.address:
            L.text(s.address, base - 0.5, align="center")
        contact = " · ".join(x for x in (s.phone and f"Ph {s.phone}", s.gstin and f"GSTIN {s.gstin}") if x)
        if contact:
            L.text(contact, base - 1, align="center")
        _void_banner(L, bill)
        L.rule("dash")
        when = f"{date_str(bill.bill_date, short=narrow)} {time_str(bill.bill_time)}"
        L.row(f"Bill {bill.bill_no}", when, base - 0.5, bold)
        if bill.customer_name:
            L.row(bill.customer_name, bill.phone or "", base - 0.5, bold)
        L.rule("dash")
        _items(L, f, base, show_gst=False)
        L.rule("dash")
        if narrow:
            L.text(f"{f.count} items · qty {qty_str(f.total_qty)}", base - 1, color=GREY)
        _totals(L, f, base, big=base + (3 if bold else 2.5), grand_label="TOTAL", short=narrow)
        L.rule("dash")
        _payment(L, bill, f, base - 0.5, customer)
        if f.saved > 0:
            L.text(f"You saved {inr(f.saved)}", base, True, "center")
        _points(L, f, base - 0.5, customer)
        if getattr(bill, "notes", None):
            L.text(f"Note: {bill.notes}", base - 1.5, color=GREY)
        L.rule("dash")
        _footer(L, s, base)
        _qr(L, s, bill, f, base - 0.5, side=(22 if narrow else 28) * mm)

    return _render(width_mm, 3, "Mono", body)


# ── Design 1: Sales invoice ───────────────────────────────────────────────────

RED = (0.75, 0.05, 0.05)
BLUE = (0.12, 0.22, 0.55)


def design1(bill, items, s, customer, f):
    def body(L: Layout):
        L.gap(2)
        L.text(s.store_name, 14, True, "center", RED)
        if s.address:
            L.text(s.address, 7.5, align="center")
        if s.phone:
            L.text(f"Phone: {s.phone}", 7.5, align="center")
        if s.gstin:
            L.text(f"GSTIN: {s.gstin}", 7.5, True, "center")
        L.gap(4)
        L.boxed(lambda: L.text("SALES INVOICE", 9, True, "center", WHITE), fill=BLUE, pad=3)
        _void_banner(L, bill)
        L.gap(1)
        L.row(f"Bill {bill.bill_no}", f"{date_str(bill.bill_date)}, {time_str(bill.bill_time)}", 7.5)
        L.row(f"Customer: {bill.customer_name or 'Walk-in'}", bill.phone or "", 7.5)
        L.rule("solid", 0.8, BLUE, before=3)
        L.row("Item", "Amount", 7.5, True, color=BLUE)
        L.rule("solid", 0.4)
        _items(L, f, 8, per_item_saving=True, accent=RED)
        L.rule("solid", 0.8, BLUE)
        _totals(L, f, 8, big=12, grand_color=BLUE)
        if f.saved > 0:
            L.gap(4)
            L.boxed(lambda: L.text(f"You saved {inr(f.saved)}", 9.5, True, "center", (0.1, 0.45, 0.15)),
                    fill=(0.9, 0.97, 0.9), stroke=(0.4, 0.7, 0.4), pad=3, radius=3)
        L.rule("dash")
        _payment(L, bill, f, 7.5, customer)
        if f.earned or f.redeemed:
            L.rule("dash")
            _points(L, f, 7.5, customer, RED)
        if getattr(bill, "notes", None):
            L.text(f"Note: {bill.notes}", 6.5, color=GREY)
        L.gap(5)
        L.barcode(bill.bill_no)
        _footer(L, s, 8.5, BLUE)
        _qr(L, s, bill, f)

    def frame(c, W, H):
        c.setStrokeColorRGB(*BLUE)
        c.setLineWidth(1)
        c.roundRect(1.5 * mm, 1.5 * mm, W - 3 * mm, H - 3 * mm, 3 * mm)

    return _render(80, 4.5, "Sans", body, frame)


# ── Design 2: Dark header ─────────────────────────────────────────────────────

def design2(bill, items, s, customer, f):
    def header(L: Layout):
        L.gap(2)
        L.text(s.store_name, 14, True, "center", WHITE)
        if s.address:
            L.text(s.address, 7.5, align="center", color=WHITE)
        contact = " · ".join(x for x in (s.phone and f"Ph {s.phone}", s.gstin and f"GSTIN {s.gstin}") if x)
        if contact:
            L.text(contact, 7, align="center", color=WHITE)
        L.gap(2)

    def info(L: Layout):
        L.row(f"Invoice {bill.bill_no}", date_str(bill.bill_date), 7.5)
        L.row(f"Customer: {bill.customer_name or 'Walk-in'}", time_str(bill.bill_time), 7.5)
        if bill.phone:
            L.text(f"Phone: {bill.phone}", 7.5)

    def body(L: Layout):
        L.y = L.H   # header bleeds to the top edge
        L.boxed(lambda: header(L), fill=BLACK, pad=3, bleed=True)
        L.gap(5)
        _void_banner(L, bill)
        L.boxed(lambda: info(L), fill=(0.95, 0.95, 0.95), stroke=(0.5, 0.5, 0.5), dash=True, pad=3)
        L.gap(2)
        L.row("Item", "Amount", 7.5, True)
        L.rule("solid", 0.8, BLACK, before=2.5)
        _items(L, f, 8, per_item_saving=True, accent=(0.45, 0.45, 0.45))
        L.rule("solid", 0.8, BLACK)
        if f.item_savings:
            L.row("MRP total", inr(f.mrp_total), 7.5, color=GREY)
            L.row("Savings on MRP", "-" + inr(f.item_savings), 7.5, color=GREY)
        _totals(L, f, 8, big=12, grand_label="Net total")
        if f.saved > 0:
            L.gap(2)
            L.row("You saved", inr(f.saved), 9.5, True, color=BLUE)
        L.rule("dash")
        L.text("Amount in words", 7, True)
        L.text(amount_in_words(f.grand), 7, color=GREY)
        L.rule("dash")
        _payment(L, bill, f, 7.5, customer)
        _points(L, f, 7.5, customer, (0.55, 0.4, 0.05))
        if getattr(bill, "notes", None):
            L.text(f"Note: {bill.notes}", 6.5, color=GREY)
        L.gap(5)
        L.barcode(bill.bill_no)
        _footer(L, s, 8.5)
        _qr(L, s, bill, f)

    return _render(80, 4.5, "Sans", body)


# ── Design 3: Bill with logo ──────────────────────────────────────────────────

def design3(bill, items, s, customer, f):
    logo = _logo_reader(s.logo_data)

    def body(L: Layout):
        L.y = L.H
        L.boxed(lambda: L.text("BILL", 11, True, "center", WHITE), fill=BLACK, pad=3, bleed=True)
        L.gap(6)
        # Store details on the left, logo (or initials) on the right — side by side, no overlap
        top, logo_w, logo_h = L.y, 20 * mm, 16 * mm
        text_x1 = L.x1 - logo_w - 4
        L.text(s.store_name, 12, True, x1=text_x1)
        if s.address:
            L.text(s.address, 7.5, x1=text_x1)
        if s.phone:
            L.text(f"Phone: {s.phone}", 7.5, x1=text_x1)
        if s.gstin:
            L.text(f"GSTIN: {s.gstin}", 7.5, True, x1=text_x1)
        left_end = L.y
        L.y = top
        if logo:
            L.image(logo, logo_w, logo_h, "right")
        else:
            initials = "".join(w[0] for w in s.store_name.split()[:2]).upper() or "S"
            if not L.dry:
                L.c.setStrokeColorRGB(*BLACK)
                L.c.setLineWidth(1)
                L.c.rect(L.x1 - logo_w, top - logo_h, logo_w, logo_h)
                L.c.setFont("Sans-Bold", 18)
                L.c.setFillColorRGB(*BLACK)
                L.c.drawCentredString(L.x1 - logo_w / 2, top - logo_h / 2 - 6, initials)
            L.y -= logo_h
        L.y = min(left_end, L.y)
        _void_banner(L, bill)
        L.rule("solid", 1, BLACK, before=4)
        L.row(f"Bill {bill.bill_no}", f"{date_str(bill.bill_date)}, {time_str(bill.bill_time)}", 7.5)
        L.text(f"Customer: {bill.customer_name or 'Walk-in'}", 7.5)
        if bill.phone:
            L.text(f"Phone: {bill.phone}", 7.5)
        L.gap(3)
        L.row("Item", "Amount", 7.5, True, color=RED)
        L.rule("solid", 0.8, RED, before=2.5)
        _items(L, f, 8)
        L.gap(5)
        L.boxed(lambda: _totals(L, f, 8, big=11.5), fill=(0.96, 0.96, 0.96), stroke=(0.3, 0.3, 0.3), pad=4, radius=3)
        L.gap(4)
        L.boxed(lambda: _payment(L, bill, f, 8, customer), fill=(0.93, 0.98, 0.88), stroke=(0.4, 0.65, 0.3), pad=4, radius=3)
        if f.saved > 0:
            L.gap(2)
            L.text(f"You saved {inr(f.saved)}", 9, True, "center", BLUE)
        _points(L, f, 7.5, customer, (0.55, 0.4, 0.05))
        if getattr(bill, "notes", None):
            L.text(f"Note: {bill.notes}", 6.5, color=GREY)
        _qr(L, s, bill, f)
        L.gap(5)
        L.boxed(lambda: (L.text("Terms and conditions", 7, True), L.text(s.policy, 7)), stroke=BLACK, pad=3)
        L.gap(6)
        L.boxed(lambda: L.text(s.footer, 9, True, "center", WHITE), fill=BLACK, pad=4, bleed=True)
        L.y += 4.5 * mm   # the footer bar runs to the bottom edge

    return _render(80, 4.5, "Sans", body)


# ── Design 4: Tax invoice ─────────────────────────────────────────────────────

def design4(bill, items, s, customer, f):
    gstin = s.gstin_raw   # a tax invoice always shows the GSTIN
    state = GST_STATES.get(gstin[:2], "") if gstin else ""

    def gst_table(L: Layout):
        cols = [L.x0, L.x0 + (L.x1 - L.x0) * 0.16, L.x0 + (L.x1 - L.x0) * 0.46, L.x0 + (L.x1 - L.x0) * 0.73, L.x1]

        def tr(cells, bold=False, size=7):
            L.y -= size * 1.35
            L._draw(cells[0], cols[0], L.y, size, bold, "left", BLACK)
            for i, v in enumerate(cells[1:], start=1):
                L._draw(v, cols[i + 1] - 2 if i < 3 else cols[4], L.y, size, bold, "right", BLACK)

        tr(["Rate", "Taxable ₹", "CGST ₹", "SGST ₹"], True)
        L.rule("solid", 0.4, before=2.5, after=0.5)
        for g in f.gst_rows:
            tr([f"{g.rate:g}%", num(g.taxable), num(g.cgst), num(g.sgst)])
        L.rule("solid", 0.4, before=2.5, after=0.5)
        tr(["Total", num(f.taxable), num(f.gst / 2), num(f.gst - round(f.gst / 2, 2))], True)

    def body(L: Layout):
        L.text("TAX INVOICE", 8, True, "center", GREY)
        L.text(s.store_name, 14, True, "center", (0.08, 0.25, 0.65))
        if s.address:
            L.text(s.address, 7.5, align="center")
        if s.phone:
            L.text(f"Phone: {s.phone}", 7.5, align="center")
        L.text(f"GSTIN: {gstin or 'NOT PROVIDED'}", 8, True, "center", BLACK if gstin else RED)
        if state:
            L.text(f"State: {gstin[:2]}-{state} · Place of supply: {gstin[:2]}-{state}", 7, align="center", color=GREY)
        _void_banner(L, bill)
        L.rule("solid", 1, BLACK)
        L.row(f"Invoice {bill.bill_no}", f"{date_str(bill.bill_date)}, {time_str(bill.bill_time)}", 7.5)
        L.text(f"Customer: {bill.customer_name or 'Walk-in'}", 7.5)
        if bill.phone:
            L.text(f"Phone: {bill.phone}", 7.5)
        cust_gst = getattr(customer, "gst_no", None) if customer is not None else None
        if cust_gst:
            L.text(f"Customer GSTIN: {cust_gst}", 7.5, True)
        L.rule("solid", 0.6)
        L.row("Item", "Amount", 7.5, True)
        L.rule("solid", 0.4, before=2.5)
        _items(L, f, 8, show_hsn=True, show_gst=True)
        L.rule("solid", 0.6)
        _totals(L, f, 8, big=13, grand_label="Total")
        L.gap(4)
        gst_table(L)
        L.rule("dash")
        L.text("Amount in words", 7, True)
        L.text(amount_in_words(f.grand), 7, color=GREY)
        L.rule("dash")
        _payment(L, bill, f, 7.5, customer)
        _points(L, f, 7.5, customer)
        if getattr(bill, "notes", None):
            L.text(f"Note: {bill.notes}", 6.5, color=GREY)
        _qr(L, s, bill, f)
        L.rule("dash")
        L.text("Terms and conditions", 7, True)
        L.text(s.policy, 7)
        _footer(L, s, 8.5)

    return _render(80, 4.5, "Sans", body)


# ── Entry point ───────────────────────────────────────────────────────────────

def generate_receipt_pdf(bill, raw_items, store, paper_size: Optional[str] = None, customer=None,
                         overrides: Optional[dict] = None, hsn: Optional[dict] = None) -> bytes:
    """paper_size None → the store's saved receipt design."""
    paper = paper_size or (overrides or {}).get("receipt_design") or getattr(store, "receipt_design", None) or "3inch"
    s = receipt_view(store, overrides)
    f = bill_figures(bill, raw_items, s.show_points, hsn)
    if paper == "design4" and not s.gstin_raw:
        paper = "design1"   # a tax invoice needs a GSTIN; fall back to the sales invoice
    if paper == "design1":
        return design1(bill, raw_items, s, customer, f)
    if paper == "design2":
        return design2(bill, raw_items, s, customer, f)
    if paper == "design3":
        return design3(bill, raw_items, s, customer, f)
    if paper == "design4":
        return design4(bill, raw_items, s, customer, f)
    if paper == "2inch":
        return thermal(bill, raw_items, s, customer, f, 58)
    return thermal(bill, raw_items, s, customer, f, 80, bold=(paper == "3inch-bold"))

"""
app/routers/products.py
Product CRUD — scoped to the logged-in store.
Auto-generates barcode: ITEMID-YYMMDD
"""
import datetime
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access, require_admin_or_manager
from app.models.models import Product, Store
from app.schemas.schemas import ProductCreate, ProductOut, ProductUpdate, MessageResponse

router = APIRouter(prefix="/products", tags=["Products"])


def _next_item_id(db: Session, store_code: str) -> str:
    count = db.query(Product).filter(Product.store_code == store_code).count()
    return f"ITM{(count + 1):03d}"


def _auto_barcode(item_id: str, inv_date: Optional[str]) -> str:
    if inv_date:
        try:
            d = datetime.datetime.strptime(inv_date, "%Y-%m-%d").date()
            return f"{item_id}-{d.strftime('%y%m%d')}"
        except ValueError:
            pass
    today = datetime.date.today().strftime("%y%m%d")
    return f"{item_id}-{today}"


# ── GET /products ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ProductOut])
def list_products(
    search: Optional[str] = Query(None, description="Search by name, ID, or category"),
    category: Optional[str] = Query(None),
    low_stock: bool = Query(False, description="Return only low-stock items"),
    skip: int = 0,
    limit: int = 200,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    q = db.query(Product).filter(Product.store_code == sc)

    if search:
        like = f"%{search}%"
        q = q.filter(
            Product.product_name.ilike(like)
            | Product.item_id.ilike(like)
            | Product.category.ilike(like)
        )
    if category:
        q = q.filter(Product.category == category)
    if low_stock:
        q = q.filter(Product.stock_qty <= Product.min_stock)

    return q.order_by(Product.product_name).offset(skip).limit(limit).all()


# ── GET /products/labels ─────────────────────────────────────────────────────

_LABEL_SIZES = {
    "50x25": (50, 25),
    "40x30": (40, 30),
    "38x25": (38, 25),
    "60x40": (60, 40),
    "100x50": (100, 50),
}

@router.get("/labels")
def get_labels(
    ids: str = Query(..., description="Comma-separated item IDs"),
    copies: int = Query(2, ge=1, le=200),
    size: str = Query("50x25", description="Label size in mm, e.g. 50x25"),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    store = db.query(Store).filter(Store.store_code == sc).first()
    store_name = store.store_name if store else sc

    id_list = [i.strip().upper() for i in ids.split(",") if i.strip()]
    products = db.query(Product).filter(
        Product.store_code == sc, Product.item_id.in_(id_list)
    ).all()
    if not products:
        raise HTTPException(status_code=404, detail="No matching products found.")

    wh = _LABEL_SIZES.get(size, (50, 25))

    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.graphics.barcode import code128
        from reportlab.lib.units import mm as MM
        from reportlab.lib import colors
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab not installed.")

    W, H = wh[0] * MM, wh[1] * MM
    buf = io.BytesIO()
    # Store the PDF as portrait (H_page > W_page) so printers don't auto-rotate.
    # We rotate the canvas 90° and draw as if the page is W×H (landscape).
    W_page, H_page = (H, W) if W > H else (W, H)
    c = rl_canvas.Canvas(buf, pagesize=(W_page, H_page))
    mg = 1.2 * MM

    hdr_h = H * 0.20
    ftr_h = H * 0.22
    body_h = H - hdr_h - ftr_h

    import datetime as _dt
    today_str = _dt.date.today().strftime("%y%m%d")

    for prod in products:
        bc = prod.barcode or f"{prod.item_id}-{today_str}"
        mrp_val = float(prod.mrp or 0)

        for _ in range(copies):
            # Rotate content 90° CW so landscape content prints correctly
            # on portrait-oriented printers (H_page is the full long side).
            if W > H:
                c.saveState()
                c.translate(0, H_page)
                c.rotate(-90)

            c.setStrokeColor(colors.HexColor("#1A237E"))
            c.setLineWidth(0.5)
            c.rect(0, 0, W, H, fill=0, stroke=1)

            c.setFillColor(colors.HexColor("#1A237E"))
            c.rect(0, H - hdr_h, W, hdr_h, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", min(6.5, hdr_h * 0.52))
            c.drawCentredString(W / 2, H - hdr_h * 0.68, store_name[:30])

            c.setFillColor(colors.HexColor("#F5F5F5"))
            c.rect(0, 0, W, ftr_h, fill=1, stroke=0)
            c.setFillColor(colors.HexColor("#1A237E"))
            c.setFont("Helvetica-Bold", min(8, ftr_h * 0.55))
            c.drawCentredString(W / 2, ftr_h * 0.32, f"MRP  Rs. {mrp_val:,.2f}")

            c.setFillColor(colors.black)
            body_top = H - hdr_h
            name_y = body_top - body_h * 0.28
            max_ch = max(16, int(W / (2.1 * MM)))
            c.setFont("Helvetica-Bold", min(5.5, body_h * 0.22))
            c.drawCentredString(W / 2, name_y, prod.product_name[:max_ch])

            c.setStrokeColor(colors.HexColor("#CCCCCC"))
            c.setLineWidth(0.25)
            c.line(mg * 2, name_y - 1.2 * MM, W - mg * 2, name_y - 1.2 * MM)

            bar_h = body_h * 0.48
            bar_bot = ftr_h + (body_h - bar_h - body_h * 0.28 - 1.8 * MM) / 2
            try:
                bco = code128.Code128(bc, barWidth=0.27 * MM, barHeight=bar_h,
                                      humanReadable=False)
                bco.drawOn(c, (W - bco.width) / 2, bar_bot)
            except Exception:
                pass

            c.setFillColor(colors.HexColor("#555555"))
            c.setFont("Helvetica", min(3.5, body_h * 0.14))
            c.drawCentredString(W / 2, bar_bot - 2.2 * MM, bc)
            c.setFillColor(colors.black)

            if W > H:
                c.restoreState()
            c.showPage()

    c.save()
    pdf_bytes = buf.getvalue()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="labels_{sc}.pdf"'},
    )


# ── GET /products/{item_id} ───────────────────────────────────────────────────

@router.get("/{item_id}", response_model=ProductOut)
def get_product(
    item_id: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    prod = db.query(Product).filter(
        Product.store_code == sc, Product.item_id == item_id
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found.")
    return prod


# ── POST /products ────────────────────────────────────────────────────────────

@router.post("/", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    identity: dict = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    pid = _next_item_id(db, sc)
    bc  = _auto_barcode(pid, payload.inventory_date)

    disc = 0.0
    if payload.mrp > 0 and payload.selling_price > 0:
        disc = round((1 - payload.selling_price / payload.mrp) * 100, 2)

    prod = Product(
        store_code=sc,
        item_id=pid,
        barcode=bc,
        discount_pct=disc,
        **payload.model_dump(),
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)
    return prod


# ── PATCH /products/{item_id} ─────────────────────────────────────────────────

@router.patch("/{item_id}", response_model=ProductOut)
def update_product(
    item_id: str,
    payload: ProductUpdate,
    identity: dict = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    prod = db.query(Product).filter(
        Product.store_code == sc, Product.item_id == item_id
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found.")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(prod, field, value)

    # Recalc discount if price changed
    if prod.mrp > 0 and prod.selling_price > 0:
        prod.discount_pct = round((1 - prod.selling_price / prod.mrp) * 100, 2)

    # Re-generate barcode if inventory_date changed
    if payload.inventory_date:
        prod.barcode = _auto_barcode(prod.item_id, prod.inventory_date)

    db.commit()
    db.refresh(prod)
    return prod


# ── PATCH /products/{item_id}/stock ───────────────────────────────────────────

@router.patch("/{item_id}/stock", response_model=ProductOut)
def adjust_stock(
    item_id: str,
    delta: int = Query(..., description="Positive = restock, Negative = sold"),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    prod = db.query(Product).filter(
        Product.store_code == sc, Product.item_id == item_id
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found.")
    if prod.stock_qty + delta < 0:
        raise HTTPException(status_code=400, detail="Stock cannot go below zero.")

    prod.stock_qty += delta
    db.commit()
    db.refresh(prod)
    return prod


# ── DELETE /products/{item_id} ────────────────────────────────────────────────

@router.delete("/{item_id}", response_model=MessageResponse)
def delete_product(
    item_id: str,
    identity: dict = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    prod = db.query(Product).filter(
        Product.store_code == sc, Product.item_id == item_id
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found.")

    db.delete(prod)
    db.commit()
    return MessageResponse(message=f"Product {item_id} deleted.")

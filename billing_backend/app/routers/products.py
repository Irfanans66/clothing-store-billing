"""
app/routers/products.py
Product CRUD — scoped to the logged-in store.
Auto-generates barcode: ITEMID-YYMMDD
"""
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access, require_admin_or_manager
from app.models.models import Product
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

"""
app/routers/reports.py
Dashboard KPIs, sales analytics, GST summary.
"""
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access
from app.models.models import Bill, BillItem, Customer, Product
from app.schemas.schemas import DashboardStats

router = APIRouter(prefix="/reports", tags=["Reports & Dashboard"])


# ── GET /reports/dashboard ────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStats)
def dashboard(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]

    revenue = (
        db.query(func.coalesce(func.sum(Bill.grand_total), 0))
        .filter(Bill.store_code == sc, Bill.status == "Paid")
        .scalar()
    )
    total_bills     = db.query(func.count(Bill.id)).filter(Bill.store_code == sc).scalar()
    total_customers = db.query(func.count(Customer.id)).filter(Customer.store_code == sc).scalar()
    total_products  = db.query(func.count(Product.id)).filter(Product.store_code == sc).scalar()
    low_stock       = (
        db.query(func.count(Product.id))
        .filter(Product.store_code == sc, Product.stock_qty <= Product.min_stock)
        .scalar()
    )

    return DashboardStats(
        total_revenue=round(float(revenue), 2),
        total_bills=total_bills,
        total_customers=total_customers,
        total_products=total_products,
        low_stock_count=low_stock,
    )


# ── GET /reports/sales-by-category ───────────────────────────────────────────

@router.get("/sales-by-category")
def sales_by_category(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    rows = (
        db.query(BillItem.category, func.sum(BillItem.total).label("revenue"))
        .filter(BillItem.store_code == sc)
        .group_by(BillItem.category)
        .order_by(func.sum(BillItem.total).desc())
        .all()
    )
    return [{"category": r.category or "Uncategorized", "revenue": round(float(r.revenue), 2)} for r in rows]


# ── GET /reports/sales-by-payment-mode ───────────────────────────────────────

@router.get("/sales-by-payment-mode")
def sales_by_payment_mode(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    rows = (
        db.query(Bill.payment_mode, func.sum(Bill.grand_total).label("revenue"))
        .filter(Bill.store_code == sc, Bill.status == "Paid")
        .group_by(Bill.payment_mode)
        .all()
    )
    return [{"payment_mode": r.payment_mode, "revenue": round(float(r.revenue), 2)} for r in rows]


# ── GET /reports/daily-sales ──────────────────────────────────────────────────

@router.get("/daily-sales")
def daily_sales(
    period: str = Query("month", description="today | week | month | year"),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    import datetime
    sc = identity["store_code"]
    today = datetime.date.today()

    if period == "today":
        rows = (
            db.query(Bill.bill_date,
                     func.sum(Bill.grand_total).label("revenue"),
                     func.count(Bill.id).label("bills"))
            .filter(Bill.store_code == sc, Bill.status.in_(["Paid", "Credit"]),
                    Bill.bill_date == str(today))
            .group_by(Bill.bill_date)
            .all()
        )
        return [{"date": r.bill_date, "revenue": round(float(r.revenue), 2),
                 "bills": int(r.bills)} for r in rows]

    elif period == "week":
        start = str(today - datetime.timedelta(days=6))
        rows = (
            db.query(Bill.bill_date,
                     func.sum(Bill.grand_total).label("revenue"),
                     func.count(Bill.id).label("bills"))
            .filter(Bill.store_code == sc, Bill.status.in_(["Paid", "Credit"]),
                    Bill.bill_date >= start)
            .group_by(Bill.bill_date)
            .order_by(Bill.bill_date)
            .all()
        )
        return [{"date": r.bill_date, "revenue": round(float(r.revenue), 2),
                 "bills": int(r.bills)} for r in rows]

    elif period == "year":
        start = str(today - datetime.timedelta(days=364))
        rows = (
            db.query(func.substr(Bill.bill_date, 1, 7).label("month"),
                     func.sum(Bill.grand_total).label("revenue"),
                     func.count(Bill.id).label("bills"))
            .filter(Bill.store_code == sc, Bill.status.in_(["Paid", "Credit"]),
                    Bill.bill_date >= start)
            .group_by(func.substr(Bill.bill_date, 1, 7))
            .order_by(func.substr(Bill.bill_date, 1, 7))
            .all()
        )
        return [{"date": r.month, "revenue": round(float(r.revenue), 2),
                 "bills": int(r.bills)} for r in rows]

    else:  # month (default)
        start = str(today - datetime.timedelta(days=29))
        rows = (
            db.query(Bill.bill_date,
                     func.sum(Bill.grand_total).label("revenue"),
                     func.count(Bill.id).label("bills"))
            .filter(Bill.store_code == sc, Bill.status.in_(["Paid", "Credit"]),
                    Bill.bill_date >= start)
            .group_by(Bill.bill_date)
            .order_by(Bill.bill_date)
            .all()
        )
        return [{"date": r.bill_date, "revenue": round(float(r.revenue), 2),
                 "bills": int(r.bills)} for r in rows]


# ── GET /reports/top-products ─────────────────────────────────────────────────

@router.get("/top-products")
def top_products(
    limit: int = Query(10),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    rows = (
        db.query(BillItem.product_name, func.sum(BillItem.qty).label("units_sold"))
        .filter(BillItem.store_code == sc)
        .group_by(BillItem.product_name)
        .order_by(func.sum(BillItem.qty).desc())
        .limit(limit)
        .all()
    )
    return [{"product": r.product_name, "units_sold": int(r.units_sold)} for r in rows]


# ── GET /reports/gst-summary ──────────────────────────────────────────────────

@router.get("/gst-summary")
def gst_summary(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    rows = (
        db.query(
            BillItem.gst_pct,
            func.count(BillItem.id).label("line_items"),
            func.sum(BillItem.subtotal).label("taxable"),
            func.sum(BillItem.gst_amt).label("gst_collected"),
        )
        .filter(BillItem.store_code == sc)
        .group_by(BillItem.gst_pct)
        .all()
    )
    return [
        {
            "gst_rate": r.gst_pct,
            "line_items": r.line_items,
            "taxable_value": round(float(r.taxable), 2),
            "gst_collected": round(float(r.gst_collected), 2),
        }
        for r in rows
    ]


# ── GET /reports/low-stock ────────────────────────────────────────────────────

@router.get("/low-stock")
def low_stock_items(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    items = (
        db.query(Product)
        .filter(Product.store_code == sc, Product.stock_qty <= Product.min_stock)
        .order_by(Product.stock_qty)
        .all()
    )
    return [
        {
            "item_id": p.item_id,
            "product_name": p.product_name,
            "stock_qty": p.stock_qty,
            "min_stock": p.min_stock,
            "category": p.category,
        }
        for p in items
    ]

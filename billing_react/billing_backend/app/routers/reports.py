"""
app/routers/reports.py
Dashboard KPIs, sales analytics, GST summary.
"""
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
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


# ── GET /reports/overview ─────────────────────────────────────────────────────
# Everything the dashboard needs in one call, for an inclusive date range.

SALE_STATUSES = ["Paid", "Credit"]


def _parse_day(value: Optional[str], default: datetime.date) -> datetime.date:
    try:
        return datetime.date.fromisoformat(value) if value else default
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date: {value}. Use YYYY-MM-DD.")


def _category_key(name: str) -> str:
    """'Shirt', 'shirts ' and 'Shirts' all merge into one bucket."""
    k = name.strip().lower()
    if k.endswith("s") and not k.endswith("ss"):
        k = k[:-1]
    return k


def _period_totals(db: Session, sc: str, start: str, end: str) -> dict:
    revenue, bills, gst = (
        db.query(func.coalesce(func.sum(Bill.grand_total), 0),
                 func.count(Bill.id),
                 func.coalesce(func.sum(Bill.gst_total), 0))
        .filter(Bill.store_code == sc, Bill.status.in_(SALE_STATUSES),
                Bill.bill_date >= start, Bill.bill_date <= end)
        .one()
    )
    items_sold = (
        db.query(func.coalesce(func.sum(BillItem.qty), 0))
        .join(Bill, BillItem.bill_id == Bill.id)
        .filter(Bill.store_code == sc, Bill.status.in_(SALE_STATUSES),
                Bill.bill_date >= start, Bill.bill_date <= end)
        .scalar()
    )
    revenue = float(revenue)
    return {
        "revenue": round(revenue, 2),
        "bills": int(bills),
        "avg_bill": round(revenue / bills, 2) if bills else 0.0,
        "items_sold": int(items_sold),
        "gst": round(float(gst), 2),
    }


@router.get("/overview")
def overview(
    start: Optional[str] = Query(None, description="YYYY-MM-DD, inclusive (default: 6 days ago)"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD, inclusive (default: today)"),
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    today = datetime.date.today()
    d_end = _parse_day(end, today)
    d_start = _parse_day(start, d_end - datetime.timedelta(days=6))
    if d_start > d_end:
        d_start, d_end = d_end, d_start
    days = (d_end - d_start).days + 1
    prev_end = d_start - datetime.timedelta(days=1)
    prev_start = prev_end - datetime.timedelta(days=days - 1)
    s, e = str(d_start), str(d_end)

    in_range = (Bill.store_code == sc, Bill.status.in_(SALE_STATUSES),
                Bill.bill_date >= s, Bill.bill_date <= e)

    # Sales trend, with empty days/months filled in so it reads as a trend
    monthly = days > 92
    if monthly:
        bucket = func.substr(Bill.bill_date, 1, 7)
        keys, y, m = [], d_start.year, d_start.month
        while (y, m) <= (d_end.year, d_end.month):
            keys.append(f"{y:04d}-{m:02d}")
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    else:
        bucket = Bill.bill_date
        keys = [str(d_start + datetime.timedelta(days=i)) for i in range(days)]
    rows = (
        db.query(bucket.label("k"), func.sum(Bill.grand_total), func.count(Bill.id))
        .filter(*in_range).group_by(bucket).all()
    )
    found = {r[0]: (float(r[1]), int(r[2])) for r in rows}
    series = [{"date": k, "revenue": round(found.get(k, (0, 0))[0], 2),
               "bills": found.get(k, (0, 0))[1]} for k in keys]

    # Category split — merge spelling variants, drop zero rows
    cat_rows = (
        db.query(BillItem.category, func.sum(BillItem.total), func.sum(BillItem.qty))
        .join(Bill, BillItem.bill_id == Bill.id)
        .filter(*in_range).group_by(BillItem.category).all()
    )
    merged: dict = {}
    for name, revenue, qty in cat_rows:
        label = (name or "").strip() or "Uncategorized"
        key = _category_key(label)
        bucket_ = merged.setdefault(key, {"category": label, "revenue": 0.0, "qty": 0,
                                          "variants": [], "_best": -1.0})
        bucket_["revenue"] += float(revenue or 0)
        bucket_["qty"] += int(qty or 0)
        bucket_["variants"].append(name or "")
        if float(revenue or 0) > bucket_["_best"]:   # show the most-used spelling
            bucket_["category"], bucket_["_best"] = label, float(revenue or 0)
    by_category = sorted(
        ({"category": v["category"], "revenue": round(v["revenue"], 2), "qty": v["qty"],
          "variants": v["variants"]} for v in merged.values() if v["revenue"] > 0),
        key=lambda r: r["revenue"], reverse=True,
    )

    pay_rows = (
        db.query(Bill.payment_mode, func.sum(Bill.grand_total), func.count(Bill.id))
        .filter(*in_range).group_by(Bill.payment_mode).all()
    )
    by_payment = sorted(
        ({"payment_mode": r[0] or "Other", "revenue": round(float(r[1]), 2), "bills": int(r[2])}
         for r in pay_rows if r[1]),
        key=lambda r: r["revenue"], reverse=True,
    )

    def top(col, n=5):
        q = (
            db.query(col, func.sum(BillItem.qty), func.sum(BillItem.total))
            .join(Bill, BillItem.bill_id == Bill.id)
            .filter(*in_range, col.isnot(None), col != "")
            .group_by(col).order_by(func.sum(BillItem.qty).desc()).limit(n).all()
        )
        return [{"name": r[0], "qty": int(r[1] or 0), "revenue": round(float(r[2] or 0), 2)} for r in q]

    recent = (
        db.query(Bill).filter(Bill.store_code == sc)
        .order_by(Bill.id.desc()).limit(8).all()
    )

    credit_outstanding, credit_customers = (
        db.query(func.coalesce(func.sum(Customer.credit_balance), 0), func.count(Customer.id))
        .filter(Customer.store_code == sc, Customer.credit_balance > 0)
        .one()
    )

    month_start = today.replace(day=1)
    gst_month = _period_totals(db, sc, str(month_start), str(today))["gst"]

    low = (
        db.query(Product)
        .filter(Product.store_code == sc, Product.stock_qty <= Product.min_stock)
        .order_by(Product.stock_qty).all()
    )

    return {
        "range": {"start": s, "end": e, "prev_start": str(prev_start), "prev_end": str(prev_end),
                  "days": days, "granularity": "month" if monthly else "day"},
        "totals": _period_totals(db, sc, s, e),
        "prev_totals": _period_totals(db, sc, str(prev_start), str(prev_end)),
        "today": _period_totals(db, sc, str(today), str(today)),
        "series": series,
        "by_category": by_category,
        "by_payment": by_payment,
        "top_products": top(BillItem.product_name),
        "top_sizes": top(BillItem.size),
        "top_colors": top(BillItem.color),
        "recent_bills": [
            {"bill_no": b.bill_no, "bill_date": b.bill_date, "bill_time": b.bill_time,
             "customer_name": b.customer_name, "phone": b.phone,
             "grand_total": round(float(b.grand_total or 0), 2),
             "payment_mode": b.payment_mode, "status": b.status, "share_token": b.share_token}
            for b in recent
        ],
        "credit": {"outstanding": round(float(credit_outstanding), 2),
                   "customers": int(credit_customers)},
        "gst_month": {"gst": gst_month, "month": month_start.strftime("%b %Y")},
        "counts": {
            "customers": db.query(func.count(Customer.id)).filter(Customer.store_code == sc).scalar(),
            "products": db.query(func.count(Product.id)).filter(Product.store_code == sc).scalar(),
            "low_stock": len(low),
            "bills_all_time": db.query(func.count(Bill.id)).filter(Bill.store_code == sc).scalar(),
        },
        "low_stock": [
            {"item_id": p.item_id, "product_name": p.product_name, "stock_qty": p.stock_qty,
             "min_stock": p.min_stock, "category": p.category, "size": p.size}
            for p in low
        ],
    }


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

"""
main.py  —  FastAPI application entry point
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import get_settings
from app.core.database import engine, Base, SessionLocal
from app.core.security import hash_password
from app.models.models import Customer, SuperAdmin, Store
from app.routers import auth, customers, products, bills, reports, store_users, admin, support, loyalty

settings = get_settings()

# ── Create all DB tables on startup ──────────────────────────────────────────
Base.metadata.create_all(bind=engine)


# ── Migrate existing tables (add new columns if missing) ─────────────────────
def _migrate_db():
    from sqlalchemy import text
    db = SessionLocal()
    migrations = [
        "ALTER TABLE bills ADD COLUMN share_token TEXT",
        "ALTER TABLE customers ADD COLUMN credit_balance REAL DEFAULT 0.0",
        "ALTER TABLE bills ADD COLUMN loyalty_earned_pts INTEGER DEFAULT 0",
        "ALTER TABLE bills ADD COLUMN loyalty_redeemed_pts INTEGER DEFAULT 0",
        "ALTER TABLE customers ADD COLUMN wallet_object_id VARCHAR(120)",
        # TIMESTAMP works on both Postgres and SQLite; DATETIME is SQLite-only.
        "ALTER TABLE customers ADD COLUMN wallet_link_sent_at TIMESTAMP",
        "ALTER TABLE stores ADD COLUMN country VARCHAR(50) DEFAULT 'India'",
        # Voiding bills (reason + who/when) and whether a bill took stock off the shelf
        "ALTER TABLE bills ADD COLUMN void_reason TEXT",
        "ALTER TABLE bills ADD COLUMN voided_by VARCHAR(50)",
        "ALTER TABLE bills ADD COLUMN voided_at TIMESTAMP",
        "ALTER TABLE bills ADD COLUMN stock_deducted BOOLEAN DEFAULT FALSE",
        # Customer dates (YYYY-MM-DD) and clothing preferences
        "ALTER TABLE customers ADD COLUMN birthday VARCHAR(10)",
        "ALTER TABLE customers ADD COLUMN anniversary VARCHAR(10)",
        "ALTER TABLE customers ADD COLUMN preferences TEXT",
        # Store credit: money the store owes the customer (separate from credit_balance = what they owe)
        "ALTER TABLE customers ADD COLUMN store_credit REAL DEFAULT 0.0",
        "ALTER TABLE bills ADD COLUMN store_credit_used REAL DEFAULT 0.0",
        # How each refund was settled (NULL on returns made before this was tracked)
        "ALTER TABLE bill_returns ADD COLUMN due_reduced REAL",
        "ALTER TABLE bill_returns ADD COLUMN store_credit_added REAL",
        "ALTER TABLE bill_returns ADD COLUMN cash_refund REAL",
        # Barcode label printing
        "ALTER TABLE products ADD COLUMN last_label_printed TIMESTAMP",
        "ALTER TABLE products ADD COLUMN labels_printed INTEGER DEFAULT 0",
        # Receipt settings (shared by every device in the store, and used for WhatsApp receipt links)
        "ALTER TABLE stores ADD COLUMN receipt_design VARCHAR(20) DEFAULT '3inch'",
        "ALTER TABLE stores ADD COLUMN receipt_footer VARCHAR(120)",
        "ALTER TABLE stores ADD COLUMN receipt_policy VARCHAR(300)",
        "ALTER TABLE stores ADD COLUMN receipt_show_gstin BOOLEAN DEFAULT TRUE",
        "ALTER TABLE stores ADD COLUMN receipt_show_qr BOOLEAN DEFAULT TRUE",
        "ALTER TABLE stores ADD COLUMN receipt_show_points BOOLEAN DEFAULT TRUE",
        "ALTER TABLE stores ADD COLUMN logo_data TEXT",
        # Support tickets: category + optional screenshot
        "ALTER TABLE support_tickets ADD COLUMN category VARCHAR(30)",
        "ALTER TABLE support_tickets ADD COLUMN screenshot TEXT",
        # Super Admin: flag demo/test stores so they stay out of platform stats
        "ALTER TABLE stores ADD COLUMN is_test BOOLEAN DEFAULT FALSE",
    ]
    for stmt in migrations:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception:
            db.rollback()
    db.close()

_migrate_db()


def _backfill_tiers():
    """Give existing customers the tier their spend has earned (upgrade only; safe to repeat)."""
    from app.routers.customers import tier_for_spend
    db = SessionLocal()
    try:
        for c in db.query(Customer).all():
            tier = tier_for_spend(c.total_purchase or 0, c.member_type)
            if tier != c.member_type:
                c.member_type = tier
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


_backfill_tiers()


def _fix_store_credit_refunds():
    """One-time repair: store-credit refunds used to be added to what the customer OWES.
    Undo that, then apply the correct rule (pay down their dues first, the rest becomes store credit).
    Returns made before the fix have store_credit_added = NULL; repaired rows get a value, so this runs once."""
    from app.models.models import Bill, BillReturn
    db = SessionLocal()
    try:
        old = db.query(BillReturn).filter(BillReturn.refund_method == "Store Credit",
                                          BillReturn.store_credit_added.is_(None)).all()
        for r in old:
            bill = db.query(Bill).filter(Bill.id == r.bill_id).first()
            cust = bill and db.query(Customer).filter(Customer.store_code == bill.store_code,
                                                      Customer.customer_id == bill.customer_id).first()
            amount = float(r.refund_amount or 0)
            if cust and amount > 0:
                owed = max(0.0, round((cust.credit_balance or 0) - amount, 2))   # remove the wrong increase
                offset = min(amount, owed)
                cust.credit_balance = round(owed - offset, 2)
                cust.store_credit = round((cust.store_credit or 0) + amount - offset, 2)
                r.due_reduced, r.store_credit_added, r.cash_refund = offset, round(amount - offset, 2), 0.0
            else:
                r.due_reduced, r.store_credit_added, r.cash_refund = 0.0, 0.0, 0.0
            print(f"ℹ️  Repaired store-credit refund on {r.bill_no}: ₹{amount:.0f}")
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


_fix_store_credit_refunds()


# ── Seed super admin if not exists ───────────────────────────────────────────
def seed_super_admin():
    db = SessionLocal()
    try:
        existing = db.query(SuperAdmin).filter(
            SuperAdmin.username == settings.SUPER_ADMIN_USERNAME
        ).first()
        if not existing:
            db.add(SuperAdmin(
                username=settings.SUPER_ADMIN_USERNAME,
                password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
            ))
            db.commit()
            print(f"✅ Super admin created: {settings.SUPER_ADMIN_USERNAME}")
        else:
            print(f"ℹ️  Super admin already exists: {settings.SUPER_ADMIN_USERNAME}")
    finally:
        db.close()


seed_super_admin()


def seed_default_store():
    if not settings.SEED_DEMO_STORE:
        return
    db = SessionLocal()
    try:
        existing = db.query(Store).filter(Store.owner_user == "admin").first()
        if not existing:
            n = db.query(Store).count() + 1
            store_code = f"STORE{n:03d}"
            db.add(Store(
                store_code=store_code,
                store_name="Demo Store",
                owner_user="admin",
                password_hash=hash_password("admin123"),
                email="admin@demo.com",
                phone="",
                address="",
            ))
            db.commit()
            print(f"✅ Default store created: admin / admin123 ({store_code})")
        else:
            print("ℹ️  Default admin store already exists.")
    finally:
        db.close()


seed_default_store()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# ── CORS middleware ───────────────────────────────────────────────────────────
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(auth.router,      prefix=PREFIX)
app.include_router(customers.router, prefix=PREFIX)
app.include_router(products.router,  prefix=PREFIX)
app.include_router(bills.router,     prefix=PREFIX)
app.include_router(reports.router,     prefix=PREFIX)
app.include_router(store_users.router, prefix=PREFIX)
app.include_router(admin.router,      prefix=PREFIX)
app.include_router(support.router,    prefix=PREFIX)
app.include_router(loyalty.router,    prefix=PREFIX)


# ── Version ───────────────────────────────────────────────────────────────────
@app.get("/api/version", include_in_schema=False)
def version():
    return {"version": "receipt-designs-v1", "designs": ["design1","design2","design3","design4"]}


# ── APK Download ─────────────────────────────────────────────────────────────
_STATIC = os.path.join(os.path.dirname(__file__), "static")

@app.get("/download/app", include_in_schema=False)
def download_apk():
    apk_path = os.path.join(_STATIC, "LocalBilling.apk")
    return FileResponse(
        apk_path,
        media_type="application/vnd.android.package-archive",
        filename="LocalBilling.apk"
    )

# ── Digital Asset Links (required for TWA / Play Store) ──────────────────────
@app.get("/.well-known/assetlinks.json", include_in_schema=False)
def assetlinks():
    fingerprints = [fp.strip() for fp in settings.TWA_SHA256_FINGERPRINTS.split(",") if fp.strip()]
    return JSONResponse([{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": settings.TWA_PACKAGE_NAME,
            "sha256_cert_fingerprints": fingerprints
        }
    }])

# ── Serve React frontend ──────────────────────────────────────────────────────
_DIST = os.path.join(os.path.dirname(__file__), "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        file_path = os.path.join(_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_DIST, "index.html"))
else:
    @app.get("/")
    def root():
        return {"app": settings.APP_NAME, "version": settings.APP_VERSION, "status": "running ✅"}

    @app.get("/health")
    def health():
        return {"status": "ok"}
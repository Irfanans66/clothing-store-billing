"""
main.py  —  FastAPI application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import engine, Base, SessionLocal
from app.core.security import hash_password
from app.models.models import SuperAdmin, Store
from app.routers import auth, customers, products, bills, reports, store_users, admin

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
    ]
    for stmt in migrations:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception:
            db.rollback()
    db.close()

_migrate_db()


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


# ── Root endpoints ────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "status": "running ✅",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
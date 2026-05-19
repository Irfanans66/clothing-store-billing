"""
main.py  —  FastAPI application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import engine, Base, SessionLocal
from app.core.security import hash_password
from app.models.models import SuperAdmin
from app.routers import auth, customers, products, bills, reports, store_users

settings = get_settings()

# ── Create all DB tables on startup ──────────────────────────────────────────
Base.metadata.create_all(bind=engine)


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

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS middleware ───────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
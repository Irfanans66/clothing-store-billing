"""
app/routers/auth.py
Login (store owner, sub-user, superadmin) and store registration.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import Store, StoreUser, SuperAdmin
from app.schemas.schemas import (
    LoginRequest, MessageResponse, StoreOut, StorePatchRequest,
    StoreRegisterRequest, TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _next_store_code(db: Session) -> str:
    n = db.query(Store).count() + 1
    return f"STORE{n:03d}"


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Universal login.
    Checks in order: super admin → store owner → store sub-user.
    Returns a JWT containing identity type, role, and store_code.
    """
    username = payload.username.strip().lower()
    password = payload.password

    # 1. Super admin
    sa = db.query(SuperAdmin).filter(SuperAdmin.username == username).first()
    if sa and verify_password(password, sa.password_hash):
        token = create_access_token({"sub": username, "type": "superadmin"})
        return TokenResponse(access_token=token, role="SuperAdmin")

    # 2. Store owner
    store = db.query(Store).filter(Store.owner_user == username).first()
    if store:
        if not store.is_active:
            raise HTTPException(status_code=403, detail="This store account has been frozen.")
        if verify_password(password, store.password_hash):
            store.last_login = datetime.now(timezone.utc)
            db.commit()
            token = create_access_token({
                "sub": username,
                "type": "store_owner",
                "store_code": store.store_code,
            })
            return TokenResponse(
                access_token=token,
                role="Admin",
                store_code=store.store_code,
                store_name=store.store_name,
            )

    # 3. Store sub-user (search across all stores)
    user = (
        db.query(StoreUser)
        .filter(StoreUser.username == username, StoreUser.is_active.is_(True))
        .first()
    )
    if user and verify_password(password, user.password_hash):
        parent = db.query(Store).filter(Store.store_code == user.store_code).first()
        if not parent or not parent.is_active:
            raise HTTPException(status_code=403, detail="Store account is frozen.")
        token = create_access_token({
            "sub": username,
            "type": "store_user",
            "store_code": user.store_code,
        })
        return TokenResponse(
            access_token=token,
            role=user.role,
            store_code=user.store_code,
            store_name=parent.store_name if parent else "",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
    )


# ── POST /auth/register ───────────────────────────────────────────────────────

@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register_store(payload: StoreRegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new store.
    Creates an isolated tenant — all future data is scoped to this store_code.
    """
    username = payload.owner_user.lower()

    # Username must not already exist as owner or sub-user
    if db.query(Store).filter(Store.owner_user == username).first():
        raise HTTPException(status_code=400, detail="Username already taken.")
    if db.query(StoreUser).filter(StoreUser.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken.")

    store_code = _next_store_code(db)

    new_store = Store(
        store_code=store_code,
        store_name=payload.store_name,
        owner_user=username,
        password_hash=hash_password(payload.password),
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        gstin=payload.gstin or "",
    )
    db.add(new_store)
    db.commit()
    db.refresh(new_store)

    return MessageResponse(
        message=f"Store registered successfully! Store code: {store_code}. Login with your username."
    )


# ── GET /auth/profile ─────────────────────────────────────────────────────────

@router.get("/profile", response_model=StoreOut)
def get_profile(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    store = db.query(Store).filter(Store.store_code == sc).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found.")
    return store


# ── PATCH /auth/profile ───────────────────────────────────────────────────────

@router.patch("/profile", response_model=StoreOut)
def update_profile(
    payload: StorePatchRequest,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    store = db.query(Store).filter(Store.store_code == sc).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found.")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(store, field, value)

    db.commit()
    db.refresh(store)
    return store

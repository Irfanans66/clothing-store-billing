"""
app/routers/store_users.py
Team (sub-user) management — scoped to the logged-in store.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin_or_manager, require_admin
from app.core.security import hash_password
from app.models.models import StoreUser
from app.schemas.schemas import (
    MessageResponse, PasswordChangeRequest,
    StoreUserCreate, StoreUserOut,
)

router = APIRouter(prefix="/store-users", tags=["Team"])


# ── GET /store-users/ ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[StoreUserOut])
def list_team(
    identity: dict = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    return (
        db.query(StoreUser)
        .filter(StoreUser.store_code == identity["store_code"])
        .order_by(StoreUser.created_at)
        .all()
    )


# ── POST /store-users/ ────────────────────────────────────────────────────────

@router.post("/", response_model=StoreUserOut, status_code=status.HTTP_201_CREATED)
def create_team_user(
    payload: StoreUserCreate,
    identity: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    exists = db.query(StoreUser).filter(
        StoreUser.store_code == sc,
        StoreUser.username == payload.username,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"Username '{payload.username}' already exists in this store.")

    user = StoreUser(
        store_code=sc,
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── PATCH /store-users/{username}/toggle ──────────────────────────────────────

@router.patch("/{username}/toggle", response_model=StoreUserOut)
def toggle_user(
    username: str,
    identity: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(StoreUser).filter(
        StoreUser.store_code == identity["store_code"],
        StoreUser.username == username,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user


# ── PATCH /store-users/{username}/password ────────────────────────────────────

@router.patch("/{username}/password", response_model=MessageResponse)
def change_password(
    username: str,
    payload: PasswordChangeRequest,
    identity: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(StoreUser).filter(
        StoreUser.store_code == identity["store_code"],
        StoreUser.username == username,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message=f"Password updated for '{username}'.")
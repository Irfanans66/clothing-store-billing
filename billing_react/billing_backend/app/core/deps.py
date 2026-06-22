"""
app/core/deps.py
FastAPI dependencies for authentication and authorization.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import Store, StoreUser, SuperAdmin

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_identity(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> dict:
    """
    Returns a dict describing who is logged in:
      { "type": "superadmin", "username": "...", "role": "SuperAdmin", "store_code": None }
      { "type": "store_owner" | "store_user", "username": "...", "role": "...", "store_code": "..." }
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if payload is None:
        raise credentials_exc

    subject: str = payload.get("sub", "")
    identity_type: str = payload.get("type", "")

    if identity_type == "superadmin":
        sa = db.query(SuperAdmin).filter(SuperAdmin.username == subject).first()
        if not sa:
            raise credentials_exc
        return {"type": "superadmin", "username": subject, "role": "SuperAdmin", "store_code": None}

    elif identity_type in ("store_owner", "store_user"):
        store_code: str = payload.get("store_code", "")
        store = db.query(Store).filter(Store.store_code == store_code, Store.is_active.is_(True)).first()
        if not store:
            raise HTTPException(status_code=403, detail="Store is frozen or does not exist.")

        if identity_type == "store_owner":
            return {
                "type": "store_owner",
                "username": subject,
                "role": "Admin",
                "store_code": store_code,
                "store": store,
            }
        else:
            user = db.query(StoreUser).filter(
                StoreUser.store_code == store_code,
                StoreUser.username == subject,
                StoreUser.is_active.is_(True),
            ).first()
            if not user:
                raise credentials_exc
            return {
                "type": "store_user",
                "username": subject,
                "role": user.role,
                "store_code": store_code,
                "store": store,
            }

    raise credentials_exc


# ── Role guards ────────────────────────────────────────────────────────────────

def require_superadmin(identity: dict = Depends(get_current_identity)) -> dict:
    if identity["type"] != "superadmin":
        raise HTTPException(status_code=403, detail="Super admin access required.")
    return identity


def require_store_access(identity: dict = Depends(get_current_identity)) -> dict:
    """Any logged-in store owner or sub-user."""
    if identity["type"] == "superadmin":
        raise HTTPException(status_code=403, detail="Use store credentials.")
    return identity


def require_admin_or_manager(identity: dict = Depends(get_current_identity)) -> dict:
    if identity["type"] == "superadmin":
        raise HTTPException(status_code=403, detail="Use store credentials.")
    if identity["role"] not in ("Admin", "Manager"):
        raise HTTPException(status_code=403, detail="Admin or Manager role required.")
    return identity


def require_admin(identity: dict = Depends(get_current_identity)) -> dict:
    if identity["type"] == "superadmin":
        raise HTTPException(status_code=403, detail="Use store credentials.")
    if identity["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Store Admin role required.")
    return identity

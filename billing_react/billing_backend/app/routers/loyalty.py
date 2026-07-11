"""
app/routers/loyalty.py
Loyalty program config per store + Google Wallet integration endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access
from app.models.models import Customer, LoyaltyProgram, Store
from app.schemas.schemas import CustomerLoyaltyOut, LoyaltyProgramOut, LoyaltyProgramPatch

router = APIRouter(prefix="/loyalty", tags=["Loyalty"])


def _get_or_create_program(db: Session, store_code: str) -> LoyaltyProgram:
    program = db.query(LoyaltyProgram).filter(LoyaltyProgram.store_code == store_code).first()
    if not program:
        program = LoyaltyProgram(store_code=store_code)
        db.add(program)
        db.commit()
        db.refresh(program)
    return program


def _to_out(program: LoyaltyProgram) -> LoyaltyProgramOut:
    return LoyaltyProgramOut(
        enabled=bool(program.enabled),
        program_name=program.program_name or "Rewards",
        points_per_rupee=float(program.points_per_rupee or 0.01),
        welcome_bonus=int(program.welcome_bonus or 0),
        min_redeem_points=int(program.min_redeem_points or 0),
        max_redeem_percent=float(program.max_redeem_percent or 100.0),
        terms=program.terms,
        wallet_configured=bool(program.wallet_class_id),
    )


@router.get("/program", response_model=LoyaltyProgramOut)
def get_program(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    program = _get_or_create_program(db, identity["store_code"])
    return _to_out(program)


@router.patch("/program", response_model=LoyaltyProgramOut)
def update_program(
    payload: LoyaltyProgramPatch,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    program = _get_or_create_program(db, identity["store_code"])
    changed = payload.model_dump(exclude_none=True)
    for field, value in changed.items():
        setattr(program, field, value)

    # If enabling and Google Wallet is configured, ensure a LoyaltyClass exists.
    if changed.get("enabled") and not program.wallet_class_id:
        try:
            from app.services.google_wallet import ensure_loyalty_class
            store = db.query(Store).filter(Store.store_code == identity["store_code"]).first()
            class_id = ensure_loyalty_class(store, program)
            if class_id:
                program.wallet_class_id = class_id
        except Exception:
            # Wallet not configured or API failure — feature still works locally.
            pass

    db.commit()
    db.refresh(program)
    return _to_out(program)


@router.get("/customer/{customer_id}", response_model=CustomerLoyaltyOut)
def get_customer_loyalty(
    customer_id: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    customer = db.query(Customer).filter(
        Customer.store_code == sc, Customer.customer_id == customer_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    program = db.query(LoyaltyProgram).filter(LoyaltyProgram.store_code == sc).first()
    wallet_link = None
    if program and program.enabled and program.wallet_class_id:
        try:
            from app.services.google_wallet import build_add_to_wallet_url
            store = db.query(Store).filter(Store.store_code == sc).first()
            wallet_link = build_add_to_wallet_url(store, program, customer)
        except Exception:
            wallet_link = None

    return CustomerLoyaltyOut(
        customer_id=customer.customer_id,
        name=customer.name,
        phone=customer.phone,
        loyalty_pts=int(customer.loyalty_pts or 0),
        wallet_object_id=customer.wallet_object_id,
        wallet_link_sent_at=customer.wallet_link_sent_at,
        wallet_link=wallet_link,
    )


@router.post("/customer/{customer_id}/resend-wallet-link")
def resend_wallet_link(
    customer_id: str,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    from datetime import datetime, timezone
    sc = identity["store_code"]
    customer = db.query(Customer).filter(
        Customer.store_code == sc, Customer.customer_id == customer_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    program = db.query(LoyaltyProgram).filter(LoyaltyProgram.store_code == sc).first()
    if not (program and program.enabled):
        raise HTTPException(status_code=400, detail="Loyalty program not enabled.")

    store = db.query(Store).filter(Store.store_code == sc).first()
    link = None
    try:
        from app.services.google_wallet import build_add_to_wallet_url
        link = build_add_to_wallet_url(store, program, customer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Wallet link generation failed: {e}")
    if not link:
        raise HTTPException(status_code=503, detail="Google Wallet not configured on the server.")

    customer.wallet_link_sent_at = datetime.now(timezone.utc)
    db.commit()
    return {"wallet_link": link}
"""
app/routers/support.py
Support ticket endpoints — store users submit concerns; super admin replies.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access
from app.models.models import Store, SupportTicket
from app.schemas.schemas import SupportTicketCreate, SupportTicketOut

router = APIRouter(prefix="/support", tags=["Support"])


@router.post("/", response_model=SupportTicketOut, status_code=201)
def submit_ticket(
    payload: SupportTicketCreate,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    sc = identity["store_code"]
    store = db.query(Store).filter(Store.store_code == sc).first()
    ticket = SupportTicket(
        store_code=sc,
        store_name=store.store_name if store else sc,
        username=identity["username"],
        subject=payload.subject.strip(),
        message=payload.message.strip(),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/", response_model=list[SupportTicketOut])
def my_tickets(
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    return (
        db.query(SupportTicket)
        .filter(SupportTicket.store_code == identity["store_code"])
        .order_by(SupportTicket.created_at.desc())
        .all()
    )
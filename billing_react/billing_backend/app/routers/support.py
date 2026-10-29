"""
app/routers/support.py
Support ticket endpoints — store users submit concerns; super admin replies.
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_store_access
from app.models.models import Store, SupportMessage, SupportTicket
from app.schemas.schemas import MessageResponse, SupportFollowUp, SupportTicketCreate, SupportTicketOut

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
        category=payload.category,
        screenshot=payload.screenshot,
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

def _own_ticket(db: Session, identity: dict, ticket_id: int) -> SupportTicket:
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id,
                                       SupportTicket.store_code == identity["store_code"]).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    return t


@router.post("/{ticket_id}/reply", response_model=SupportTicketOut)
def reply_to_ticket(
    ticket_id: int,
    payload: SupportFollowUp,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    """Add a follow-up on an existing ticket instead of opening a new one (re-opens resolved tickets)."""
    t = _own_ticket(db, identity, ticket_id)
    db.add(SupportMessage(ticket_id=t.id, author="store", username=identity["username"], message=payload.message))
    if t.status == "Resolved":
        t.status = "Open"
    t.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{ticket_id}", response_model=MessageResponse)
def delete_ticket(
    ticket_id: int,
    identity: dict = Depends(require_store_access),
    db: Session = Depends(get_db),
):
    t = _own_ticket(db, identity, ticket_id)
    db.delete(t)
    db.commit()
    return MessageResponse(message=f"Ticket #{ticket_id} deleted.")

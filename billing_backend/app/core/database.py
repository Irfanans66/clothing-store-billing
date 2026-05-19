"""
app/core/database.py
SQLAlchemy engine, session factory, and Base declarative class.
Switch DATABASE_URL in .env to PostgreSQL for production.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# SQLite needs check_same_thread=False; PostgreSQL ignores connect_args
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,           # logs SQL in dev
)

# Enable WAL mode for SQLite (better concurrent reads)
if "sqlite" in settings.DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── Dependency ────────────────────────────────────────────────────────────────

def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

"""
app/services/google_wallet.py

Google Wallet Loyalty Card integration.

Env-gated: if GOOGLE_WALLET_ISSUER_ID or GOOGLE_WALLET_SA_JSON is unset,
every function returns None so the rest of the app works locally.

Environment variables:
    GOOGLE_WALLET_ISSUER_ID  — 16-digit issuer id from Wallet Business Console
    GOOGLE_WALLET_SA_JSON    — full service-account JSON as a string
    GOOGLE_WALLET_ORIGIN     — public origin (e.g. https://app.example.com)
                               used inside the JWT `origins` claim
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

log = logging.getLogger(__name__)

_WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1"
_SAVE_URL   = "https://pay.google.com/gp/v/save/"
_SCOPES     = ["https://www.googleapis.com/auth/wallet_object.issuer"]


def _config() -> Optional[dict]:
    issuer = os.environ.get("GOOGLE_WALLET_ISSUER_ID")
    sa_raw = os.environ.get("GOOGLE_WALLET_SA_JSON")
    origin = os.environ.get("GOOGLE_WALLET_ORIGIN", "")
    if not issuer or not sa_raw:
        return None
    try:
        sa = json.loads(sa_raw)
    except json.JSONDecodeError:
        log.warning("GOOGLE_WALLET_SA_JSON is not valid JSON — Wallet disabled.")
        return None
    return {"issuer_id": issuer, "sa": sa, "origin": origin}


def _slug(value: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in (value or ""))[:40]


def _class_id(issuer_id: str, store_code: str) -> str:
    return f"{issuer_id}.store_{_slug(store_code).lower()}"


def _object_id(issuer_id: str, store_code: str, customer_id: str) -> str:
    return f"{issuer_id}.{_slug(store_code).lower()}_{_slug(customer_id)}"


def _authed_session(sa: dict):
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds = service_account.Credentials.from_service_account_info(sa, scopes=_SCOPES)
    return AuthorizedSession(creds)


def _class_payload(class_id: str, store, program) -> dict:
    return {
        "id": class_id,
        "issuerName": store.store_name or "Store",
        "programName": program.program_name or "Rewards",
        "programLogo": {
            "sourceUri": {
                "uri": "https://raw.githubusercontent.com/google/material-design-icons/master/png/action/stars/materialicons/48dp/2x/baseline_stars_black_48dp.png"
            }
        },
        "reviewStatus": "UNDER_REVIEW",
        "hexBackgroundColor": "#4285f4",
        "countryCode": "IN",
        "localizedIssuerName": {
            "defaultValue": {"language": "en-US", "value": store.store_name or "Store"}
        },
        "textModulesData": (
            [{"header": "Terms", "body": program.terms}] if program.terms else []
        ),
    }


def _object_payload(object_id: str, class_id: str, store, program, customer) -> dict:
    return {
        "id": object_id,
        "classId": class_id,
        "state": "ACTIVE",
        "accountId": customer.customer_id,
        "accountName": customer.name,
        "loyaltyPoints": {
            "balance": {"int": int(customer.loyalty_pts or 0)},
            "label": "Points",
        },
        "barcode": {
            "type": "QR_CODE",
            "value": f"{store.store_code}:{customer.customer_id}",
            "alternateText": customer.customer_id,
        },
        "textModulesData": [
            {"header": "Total spent", "body": f"₹{int(customer.total_purchase or 0)}"},
        ],
    }


def ensure_loyalty_class(store, program) -> Optional[str]:
    """Create (or verify) a LoyaltyClass for a store. Returns the class id."""
    cfg = _config()
    if not cfg:
        return None
    class_id = _class_id(cfg["issuer_id"], store.store_code)
    try:
        session = _authed_session(cfg["sa"])
        payload = _class_payload(class_id, store, program)
        get_resp = session.get(f"{_WALLET_API}/loyaltyClass/{class_id}")
        if get_resp.status_code == 404:
            r = session.post(f"{_WALLET_API}/loyaltyClass", json=payload)
            r.raise_for_status()
        elif get_resp.status_code == 200:
            r = session.patch(f"{_WALLET_API}/loyaltyClass/{class_id}", json=payload)
            r.raise_for_status()
        else:
            log.warning("Wallet class GET unexpected %s: %s", get_resp.status_code, get_resp.text)
            return None
        return class_id
    except Exception as e:
        log.exception("ensure_loyalty_class failed: %s", e)
        return None


def upsert_loyalty_object(store, program, customer) -> Optional[str]:
    """Create or update the customer's LoyaltyObject on Google's side."""
    cfg = _config()
    if not cfg or not program.wallet_class_id:
        return None
    class_id  = program.wallet_class_id
    object_id = _object_id(cfg["issuer_id"], store.store_code, customer.customer_id)
    try:
        session = _authed_session(cfg["sa"])
        payload = _object_payload(object_id, class_id, store, program, customer)
        get_resp = session.get(f"{_WALLET_API}/loyaltyObject/{object_id}")
        if get_resp.status_code == 404:
            r = session.post(f"{_WALLET_API}/loyaltyObject", json=payload)
            r.raise_for_status()
        elif get_resp.status_code == 200:
            r = session.patch(f"{_WALLET_API}/loyaltyObject/{object_id}", json=payload)
            r.raise_for_status()
        else:
            log.warning("Wallet object GET unexpected %s: %s", get_resp.status_code, get_resp.text)
            return None
        return object_id
    except Exception as e:
        log.exception("upsert_loyalty_object failed: %s", e)
        return None


def build_add_to_wallet_url(store, program, customer) -> Optional[str]:
    """
    Sign a JWT that, when opened, adds the customer's LoyaltyObject to Google
    Wallet. Ensures the object exists first (upsert).
    """
    cfg = _config()
    if not cfg or not program.wallet_class_id:
        return None
    object_id = upsert_loyalty_object(store, program, customer)
    if not object_id:
        return None

    try:
        import jwt as pyjwt
        sa = cfg["sa"]
        origin = cfg["origin"]
        claims = {
            "iss": sa["client_email"],
            "aud": "google",
            "typ": "savetowallet",
            "iat": _now_seconds(),
            "origins": [origin] if origin else [],
            "payload": {"loyaltyObjects": [{"id": object_id}]},
        }
        token = pyjwt.encode(claims, sa["private_key"], algorithm="RS256")
        # PyJWT 2.x returns str already; older versions returned bytes.
        if isinstance(token, bytes):
            token = token.decode("utf-8")
        return f"{_SAVE_URL}{token}"
    except Exception as e:
        log.exception("build_add_to_wallet_url failed: %s", e)
        return None


def _now_seconds() -> int:
    import time
    return int(time.time())
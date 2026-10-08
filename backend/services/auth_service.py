import os
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt

import db
from sqlalchemy import select, func, update
from orm_models import User

JWT_SECRET = os.environ.get("JWT_SECRET_KEY", os.environ.get("JWT_SECRET", "placement-tracker-jwt-secret-key-2026"))
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed.startswith("$2"):
        if plain == hashed:
            return True
        return False
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _rehash_if_needed(gmail: str, plain: str, stored_hash: str):
    """Upgrade plaintext passwords to bcrypt on successful login."""
    if not stored_hash.startswith("$2"):
        new_hash = hash_password(plain)
        with db.session_scope() as session:
            session.execute(
                update(User).where(func.lower(User.gmail) == gmail.lower()).values(password=new_hash)
            )


def create_token(user_data: dict) -> str:
    payload = {
        "sub": user_data["uuid"],
        "gmail": user_data["gmail"],
        "role": user_data["role"],
        "department": user_data.get("department", "CSE"),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def authenticate(gmail: str, password: str):
    user = db.get_user_by_gmail(gmail)
    if not user:
        return None
    if not verify_password(password, user["password"]):
        return None
    if not user.get("is_approved", True):
        return {"pending": True, "gmail": user["gmail"], "role": user["role"]}
    _rehash_if_needed(gmail, password, user["password"])
    user_data = {
        "uuid": user["uuid"],
        "gmail": user["gmail"],
        "role": user["role"],
        "department": user.get("department") or "CSE",
    }
    token = create_token(user_data)
    return {"user": user_data, "token": token}


def signup(gmail: str, password: str, role: str, name: str = "", department: str = "CSE"):
    existing = db.get_user_by_gmail(gmail)
    if existing:
        return None
    hashed = hash_password(password)
    new_uuid = str(uuid.uuid4())
    with db.session_scope() as session:
        session.add(User(
            uuid=new_uuid,
            gmail=gmail.strip().lower(),
            password=hashed,
            role=_normalize_role(role),
            department=department.strip() or "CSE",
            is_approved=False,
        ))
    return {
        "uuid": new_uuid,
        "gmail": gmail.strip().lower(),
        "role": _normalize_role(role),
        "status": "pending_approval",
    }


def _normalize_role(role: str) -> str:
    role_map = {
        "student": "Student", "mentor": "Mentor",
        "department": "Department", "dept": "Department",
        "recruiter": "Recruiter",
        "coordinator": "Coordinator", "admin": "Coordinator",
    }
    return role_map.get(role.strip().lower(), "Student")


def get_pending_signups():
    with db.session_scope() as session:
        users = session.scalars(
            select(User).where(User.is_approved == False)
        ).all()
        return [
            {
                "uuid": u.uuid,
                "gmail": u.gmail,
                "role": u.role,
                "department": u.department or "CSE",
                "created_at": u.created_at,
            }
            for u in users
        ]


def approve_signup(user_uuid: str):
    with db.session_scope() as session:
        user = session.get(User, user_uuid)
        if not user:
            return None
        user.is_approved = True
        session.flush()
        return {"uuid": user.uuid, "gmail": user.gmail, "role": user.role, "is_approved": True}


def reject_signup(user_uuid: str):
    with db.session_scope() as session:
        user = session.get(User, user_uuid)
        if not user:
            return None
        info = {"uuid": user.uuid, "gmail": user.gmail, "role": user.role}
        session.delete(user)
        return info


def list_users():
    return db.get_all_users()


def grant_access(gmail: str, role: str, password: str = None):
    return db.grant_single_user_access(gmail=gmail, role=role, password=password)


def bulk_grant_access(records):
    return db.bulk_grant_user_access(records)


def get_departments():
    return db.get_departments()


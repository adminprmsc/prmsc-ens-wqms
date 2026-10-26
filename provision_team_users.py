"""
Create or update team accounts on the active database (raw SQL for legacy columns).

    cd ~/wqms-flask && source venv/bin/activate
    export FLASK_ENV=production
    export TEAM_INIT_PASSWORD='YourTempPassword123!'
    python provision_team_users.py

Re-running updates password + role for the same email.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime

from sqlalchemy import text
from werkzeug.security import generate_password_hash

from app import app, db

TEAM = [
    ("PCWR User", "pcwr@gmail.com", "pcrwr_user"),
    ("PCRWR User", "pcrwruser@gmail.com", "pcrwr_user"),
    ("PCRWR User 1", "pcrwruser1@gmail.com", "pcrwr_user"),
    ("PCRWR Test", "pcrwrtest1@test.com", "pcrwr_user"),
    ("Rameen Saleem", "rameen.saleem120@gmail.com", "environmental_specialist"),
    ("Kamran", "kamran55510@gmail.com", "environmental_specialist"),
    ("Dashboard Viewer", "viewer@prmsc.org", "dashboard_viewer"),
]


def user_columns() -> set[str]:
    rows = db.session.execute(text("PRAGMA table_info(user)")).fetchall()
    return {r[1] for r in rows}


def upsert_user(name: str, email: str, role: str, password: str, cols: set[str]) -> str:
    email = email.strip().lower()
    pw_hash = generate_password_hash(password)
    now = datetime.utcnow()

    existing = db.session.execute(
        text("SELECT id FROM user WHERE email = :email"), {"email": email}
    ).fetchone()

    values: dict = {
        "name": name,
        "role": role,
        "password_hash": pw_hash,
        "email": email,
    }
    if "password" in cols:
        values["password"] = pw_hash
    if "organization" in cols:
        values["organization"] = "PRMSC"
    if "is_active" in cols:
        values["is_active"] = 1

    if existing:
        patch = {k: v for k, v in values.items() if k != "email"}
        assignments = ", ".join(f"{c} = :{c}" for c in patch)
        if "updated_at" in cols:
            assignments += ", updated_at = :updated_at"
            patch["updated_at"] = now
        patch["email"] = email
        db.session.execute(
            text(f"UPDATE user SET {assignments} WHERE email = :email"), patch
        )
        return "updated"

    insert = dict(values)
    if "created_at" in cols:
        insert["created_at"] = now
    if "updated_at" in cols:
        insert["updated_at"] = now
    names = ", ".join(insert)
    binds = ", ".join(f":{c}" for c in insert)
    db.session.execute(text(f"INSERT INTO user ({names}) VALUES ({binds})"), insert)
    return "created"


def main() -> int:
    password = os.environ.get("TEAM_INIT_PASSWORD", "").strip()
    if len(password) < 8:
        print("Set TEAM_INIT_PASSWORD (min 8 chars), e.g. export TEAM_INIT_PASSWORD='...'", file=sys.stderr)
        return 1

    with app.app_context():
        cols = user_columns()
        if not cols:
            print("No user table found.", file=sys.stderr)
            return 1

        for name, email, role in TEAM:
            action = upsert_user(name, email, role, password, cols)
            row = db.session.execute(
                text("SELECT id, email, role FROM user WHERE email = :email"),
                {"email": email.strip().lower()},
            ).fetchone()
            print(f"{action}: {row[1]}  id={row[0]}  role={row[2]}")

        db.session.commit()

    print("\nDone. Share TEAM_INIT_PASSWORD with the team; ask them to change it after first login.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

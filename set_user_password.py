"""
Set password for one user by email (keeps existing name + role).

Run on the VM against production SQLite:

    cd ~/wqms-flask && source venv/bin/activate
    export FLASK_ENV=production
    python set_user_password.py kamran55510@gmail.com 'NewSecurePassword'

Creates the user only if you pass --create-with-role environmental_specialist
"""
from __future__ import annotations

import sys
from datetime import datetime

from sqlalchemy import text
from werkzeug.security import generate_password_hash

from app import app, db


def user_columns() -> set[str]:
    rows = db.session.execute(text("PRAGMA table_info(user)")).fetchall()
    return {r[1] for r in rows}


def main() -> int:
    create_role: str | None = None
    args = sys.argv[1:]
    if "--create-with-role" in args:
        idx = args.index("--create-with-role")
        if idx + 1 >= len(args):
            print("Usage: --create-with-role <role>", file=sys.stderr)
            return 1
        create_role = args[idx + 1]
        del args[idx : idx + 2]

    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 1

    email = args[0].strip().lower()
    password = args[1]
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        return 1

    with app.app_context():
        cols = user_columns()
        pw_hash = generate_password_hash(password)
        now = datetime.utcnow()

        row = db.session.execute(
            text("SELECT id, name, role FROM user WHERE lower(email) = :email"),
            {"email": email},
        ).fetchone()

        if not row:
            if not create_role:
                print(f"No user with email {email}. Use --create-with-role to create.", file=sys.stderr)
                return 1
            insert: dict = {
                "name": email.split("@")[0],
                "email": email,
                "role": create_role,
                "password_hash": pw_hash,
            }
            if "password" in cols:
                insert["password"] = pw_hash
            if "organization" in cols:
                insert["organization"] = "PRMSC"
            if "is_active" in cols:
                insert["is_active"] = 1
            if "created_at" in cols:
                insert["created_at"] = now
            if "updated_at" in cols:
                insert["updated_at"] = now
            names = ", ".join(insert)
            binds = ", ".join(f":{k}" for k in insert)
            db.session.execute(text(f"INSERT INTO user ({names}) VALUES ({binds})"), insert)
            action = "created"
        else:
            patch: dict = {"password_hash": pw_hash, "email": email}
            if "password" in cols:
                patch["password"] = pw_hash
            if "is_active" in cols:
                patch["is_active"] = 1
            assignments = ", ".join(f"{k} = :{k}" for k in patch if k != "email")
            if "updated_at" in cols:
                assignments += ", updated_at = :updated_at"
                patch["updated_at"] = now
            db.session.execute(
                text(f"UPDATE user SET {assignments} WHERE lower(email) = :email"),
                patch,
            )
            action = "updated"

        db.session.commit()
        verify = db.session.execute(
            text("SELECT id, email, role, is_active FROM user WHERE lower(email) = :email"),
            {"email": email},
        ).fetchone()
        print(f"{action}: id={verify[0]} email={verify[1]} role={verify[2]} active={verify[3]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

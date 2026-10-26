"""
Create (or update) a dashboard view-only account.

The registration page deliberately does not offer this role — a view-only
account is created by an administrator. Run this on whichever machine holds
the database you want the account in:

    python3 create_viewer_user.py "Viewer Name" viewer@example.com 'password'

Re-running with an existing email updates that user instead of failing, so it
is safe to run twice.

This writes through raw SQL rather than the User model on purpose. The live
`user` table carries a legacy `password VARCHAR(255) NOT NULL` column that the
SQLAlchemy model does not declare, so a model-based insert fails with
"NOT NULL constraint failed: user.password". Both password columns are filled
with the same werkzeug hash — the app authenticates on `password_hash`, and no
plaintext is stored.
"""
import sys
from datetime import datetime

from sqlalchemy import text
from werkzeug.security import generate_password_hash

from app import app, db

ROLE = 'dashboard_viewer'


def user_columns():
    """Column names actually present on the live `user` table."""
    rows = db.session.execute(text('PRAGMA table_info(user)')).fetchall()
    return {r[1] for r in rows}


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 1

    name, email, password = sys.argv[1], sys.argv[2].strip().lower(), sys.argv[3]

    if len(password) < 8:
        print('Refusing: password must be at least 8 characters.')
        return 1

    with app.app_context():
        cols = user_columns()
        if not cols:
            print('No `user` table found — is this the right database?')
            return 1

        pw_hash = generate_password_hash(password)
        now = datetime.utcnow()

        existing = db.session.execute(
            text('SELECT id FROM user WHERE email = :email'), {'email': email}
        ).fetchone()

        # Only touch columns this database actually has.
        values = {'name': name, 'role': ROLE, 'password_hash': pw_hash}
        if 'password' in cols:
            values['password'] = pw_hash
        if 'organization' in cols:
            values['organization'] = 'PRMSC'
        if 'is_active' in cols:
            values['is_active'] = 1

        if existing:
            assignments = ', '.join(f'{c} = :{c}' for c in values)
            if 'updated_at' in cols:
                assignments += ', updated_at = :updated_at'
                values['updated_at'] = now
            values['email'] = email
            db.session.execute(
                text(f'UPDATE user SET {assignments} WHERE email = :email'), values
            )
            action = 'updated'
        else:
            values['email'] = email
            if 'created_at' in cols:
                values['created_at'] = now
            if 'updated_at' in cols:
                values['updated_at'] = now
            names = ', '.join(values)
            binds = ', '.join(f':{c}' for c in values)
            db.session.execute(
                text(f'INSERT INTO user ({names}) VALUES ({binds})'), values
            )
            action = 'created'

        db.session.commit()

        row = db.session.execute(
            text('SELECT id, email, role FROM user WHERE email = :email'),
            {'email': email},
        ).fetchone()
        print(f'{action}: {row[1]}  (id={row[0]}, role={row[2]})')

    return 0


if __name__ == '__main__':
    sys.exit(main())

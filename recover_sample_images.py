"""
Re-register sample image files that exist on disk but have no `sample_images` row.

Uploads are named by the app as `{report_id}_{uuid8}.{ext}` (see upload_sample_images
in app.py), so the report each file belongs to is recoverable from its own filename —
this restores an association the app created, it does not invent one.

    python3 recover_sample_images.py --dry-run    # report what would change
    python3 recover_sample_images.py              # apply

Files whose report_id does not exist in test_report_metadata are skipped and listed.
Rows already present are left untouched, so this is safe to re-run.
"""
import mimetypes
import os
import re
import sys
from datetime import datetime

from sqlalchemy import text

from app import app, db

NAME_RE = re.compile(r'^(\d+)_[0-9a-fA-F]+\.(\w+)$')


def main():
    dry_run = '--dry-run' in sys.argv

    with app.app_context():
        folder = app.config['UPLOAD_FOLDER']
        if not os.path.isdir(folder):
            print(f'Upload folder not found: {folder}')
            return 1

        registered = {
            r[0] for r in db.session.execute(text('SELECT image_path FROM sample_images')).fetchall()
        }
        known_reports = {
            r[0] for r in db.session.execute(
                text('SELECT report_id FROM test_report_metadata')
            ).fetchall()
        }

        to_add, skipped_unknown, malformed = [], [], []

        for filename in sorted(os.listdir(folder)):
            path = os.path.join(folder, filename)
            if not os.path.isfile(path) or filename.startswith('.'):
                continue
            if filename in registered:
                continue

            match = NAME_RE.match(filename)
            if not match:
                malformed.append(filename)
                continue

            report_id = int(match.group(1))
            if report_id not in known_reports:
                skipped_unknown.append((filename, report_id))
                continue

            stat = os.stat(path)
            to_add.append({
                'report_id': report_id,
                'image_filename': filename,
                'image_path': filename,
                'image_size': stat.st_size,
                'image_type': mimetypes.guess_type(filename)[0] or 'application/octet-stream',
                'uploaded_at': datetime.utcfromtimestamp(stat.st_mtime),
            })

        print(f'Upload folder : {folder}')
        print(f'Already registered: {len(registered)}')
        print(f'To register   : {len(to_add)}')
        if skipped_unknown:
            print(f'Skipped (no such report): {len(skipped_unknown)}')
            for fn, rid in skipped_unknown:
                print(f'    {fn}  -> report {rid} not in test_report_metadata')
        if malformed:
            print(f'Skipped (unexpected name): {len(malformed)}')
            for fn in malformed:
                print(f'    {fn}')

        for row in to_add:
            print(f"    + report {row['report_id']:>3}  {row['image_path']}  ({row['image_size']} bytes)")

        if dry_run:
            print('\nDRY RUN - nothing written.')
            return 0

        if not to_add:
            print('\nNothing to do.')
            return 0

        for row in to_add:
            db.session.execute(text("""
                INSERT INTO sample_images
                    (report_id, image_filename, image_path, image_size, image_type, uploaded_at)
                VALUES
                    (:report_id, :image_filename, :image_path, :image_size, :image_type, :uploaded_at)
            """), row)
        db.session.commit()

        print(f'\nRegistered {len(to_add)} image(s).')

    return 0


if __name__ == '__main__':
    sys.exit(main())

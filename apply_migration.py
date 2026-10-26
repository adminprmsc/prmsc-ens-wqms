import sqlite3
import os

# Locate the database file
db_path = 'instance/water_quality.db'

if not os.path.exists(db_path):
    print(f"❌ Database file not found at {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check current schema of draft_form
    cursor.execute("PRAGMA table_info(draft_form)")
    columns = cursor.fetchall()
    print("Current draft_form columns:")
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")

    # Check if status column already exists
    has_status = any(col[1] == 'status' for col in columns)

    if has_status:
        print("\n✅ 'status' column already exists")
    else:
        print("\n🔄 Adding 'status' column...")
        cursor.execute("ALTER TABLE draft_form ADD COLUMN status VARCHAR(20) DEFAULT 'draft'")
        conn.commit()
        print("✅ 'status' column added successfully")

    # Verify the change
    cursor.execute("PRAGMA table_info(draft_form)")
    columns = cursor.fetchall()
    print("\nUpdated draft_form columns:")
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")

    conn.close()
    print("\n✅ Migration applied successfully!")

except sqlite3.Error as e:
    print(f"❌ Database error: {e}")
    exit(1)

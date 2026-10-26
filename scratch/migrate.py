import sqlite3
import os

db_path = 'instance/water_quality.db'

if not os.path.exists(db_path):
    print(f"Error: Database file not found at {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check current schema of test_report_metadata
    cursor.execute("PRAGMA table_info(test_report_metadata)")
    columns = cursor.fetchall()
    print("Current test_report_metadata columns:")
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")
    
    # Check if report_category column already exists
    has_category = any(col[1] == 'report_category' for col in columns)
    
    if has_category:
        print("\n[OK] 'report_category' column already exists")
    else:
        print("\n[MIGRATING] Adding 'report_category' column...")
        cursor.execute("ALTER TABLE test_report_metadata ADD COLUMN report_category VARCHAR(50) DEFAULT 'pcrwr'")
        conn.commit()
        print("[OK] 'report_category' column added successfully")
    
    # Verify the change
    cursor.execute("PRAGMA table_info(test_report_metadata)")
    columns = cursor.fetchall()
    print("\nUpdated test_report_metadata columns:")
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")
    
    conn.close()
    print("\n[SUCCESS] Migration completed successfully!")

except sqlite3.Error as e:
    print(f"Error: Database error: {e}")
    exit(1)

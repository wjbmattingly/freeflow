#!/usr/bin/env python3
"""
Database migration to add Hugging Face Jobs fields to TrainingJob model
"""

import sqlite3
import os

def migrate_database():
    """Add HF Jobs fields to the TrainingJob table"""
    
    # Get database path
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'annotation_platform.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at {db_path}")
        return
    
    print(f"🔧 Migrating database at: {db_path}")
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(training_job)")
        columns = [col[1] for col in cursor.fetchall()]
        
        # Add new columns if they don't exist
        new_columns = [
            ('is_hf_job', 'INTEGER DEFAULT 0'),
            ('hf_job_id', 'TEXT'),
            ('hf_username', 'TEXT'),
            ('hf_hardware', 'TEXT')
        ]
        
        for col_name, col_type in new_columns:
            if col_name not in columns:
                print(f"  ➕ Adding column: {col_name}")
                cursor.execute(f"ALTER TABLE training_job ADD COLUMN {col_name} {col_type}")
            else:
                print(f"  ✓ Column already exists: {col_name}")
        
        conn.commit()
        print("✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()


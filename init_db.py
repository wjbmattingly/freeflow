#!/usr/bin/env python3
"""
Database initialization script for HuggingFace Spaces deployment
This ensures the database is created before the app starts
"""

from app import app, db

if __name__ == '__main__':
    with app.app_context():
        print("🗄️  Initializing database...")
        db.create_all()
        print("✅ Database tables created successfully")


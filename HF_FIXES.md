# 🔧 HuggingFace Spaces Fixes

## Problems Fixed

### 1. ❌ Database Not Initializing (500 Error)
**Problem**: When running with gunicorn, `db.create_all()` in `if __name__ == '__main__'` never executes.

**Fix**:
- Added database initialization in main app.py (runs with gunicorn)
- Created `init_db.py` script that runs in startup script
- Changed to absolute database path for reliability

### 2. ❌ Permission Errors
**Problem**: HuggingFace Spaces requires non-root user, but app was running as root.

**Fix**:
- Created non-root user (UID 1000)
- Set proper file ownership with `chown -R user:user /app`
- Switch to non-root user before running app

### 3. ❌ No Error Logs
**Problem**: Couldn't see why the app was failing.

**Fix**:
- Added gunicorn logging flags: `--access-logfile - --error-logfile -`
- Added database initialization logging
- Added try/catch around database init

## Files Changed

1. **app.py**
   - Uses absolute database path
   - Initializes database even with gunicorn
   - Creates instance directory automatically

2. **Dockerfile**
   - Creates non-root user (UID 1000)
   - Sets proper file permissions
   - Runs init_db.py before starting server
   - Added logging to gunicorn

3. **init_db.py** (NEW)
   - Explicit database initialization script
   - Runs during container startup

## How to Deploy

```bash
# In your local freeflow directory
git add app.py Dockerfile init_db.py
git commit -m "Fix database initialization for HuggingFace Spaces"

# Push to HuggingFace
git push hf main
```

## What to Check in Logs

Look for these messages in your HF Space logs:

✅ **Good Signs:**
```
🚀 Starting FreeFlow Annotation Platform on HuggingFace Spaces
📦 Checking SAM2 models...
✅ SAM2 model already exists (or downloaded)
🗄️  Initializing database...
✅ Database tables created successfully
✅ Database initialized at: /app/instance/annotation_platform.db
🌐 Starting server on port 7860...
[gunicorn] Booting worker with pid: XXX
```

❌ **Bad Signs (and what they mean):**
- `Permission denied` → File ownership issue
- `No such file or directory` → Directory not created
- `sqlite3.OperationalError` → Database path or permissions issue
- `500 Internal Server Error` → App crash, check full error logs

## Testing After Deployment

1. **Check if app loads**: Visit your Space URL
2. **Test project creation**: Click "Create Project"
3. **Check database**: Should create project without errors
4. **Upload images**: Test file upload functionality
5. **Test SAM2**: Enable SAM2 mode and test annotation

## Storage Locations

- Database: `/app/instance/annotation_platform.db`
- Uploads: `/app/uploads/`
- SAM2 models: `/app/models/sam2/`
- Training runs: `/app/training_runs/`

All these directories are owned by user `user` (UID 1000) and persist between restarts.

## Common Issues

### "Failed to load projects" (500 Error)
- Database not initialized properly
- Check logs for database errors
- Verify `/app/instance/` has write permissions

### "Load failed" / SSE Errors
- Server crashed during startup
- Check gunicorn logs for Python errors
- Look for import errors or missing dependencies

### Frame origin errors (CORS)
- These are warnings, not errors
- HuggingFace iframe security - can be ignored

## Performance Tips

- **Free tier (CPU Basic)**: Works for annotation, slow SAM2
- **CPU Upgrade ($0.03/hr)**: Better for production use
- **GPU T4 ($0.60/hr)**: Fast SAM2 inference
- Use **SAM2 Tiny** model for best speed on free tier

## Need Help?

Check the "Logs" tab in your HuggingFace Space for detailed error messages.


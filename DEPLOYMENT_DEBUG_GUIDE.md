# 🔍 Debugging HuggingFace Space Deployment

## Current Issue
Static files (CSS/JS) returning 404 errors in private Space mode.

## What I've Added for Debugging

### 1. Enhanced Startup Script
The Dockerfile now includes extensive diagnostics:

```bash
📁 Verifying app structure...
ls -la /app/

📁 Checking static files...
ls -la /app/static/css/ /app/static/js/

🐍 Testing Python import...
python3 -c "import app; print('✅ App imports OK')"

🌐 Starting server on port 7860...
gunicorn ... --log-level debug
```

### 2. Build-Time Verification
```dockerfile
RUN ls -la /app/static/ || echo "⚠️  Static folder not found!"
```

## How to Debug on HuggingFace

### Step 1: Check BUILD Logs

1. Go to https://huggingface.co/spaces/wjbmattingly/freeflow-test
2. Click "Logs" tab
3. Look for **BUILD** section (scroll to top)

**Look for these indicators:**

✅ **GOOD:**
```
Step X/Y : RUN ls -la /app/static/
total 0
drwxr-xr-x ... css
drwxr-xr-x ... js
```

❌ **BAD:**
```
⚠️  Static folder not found!
```

If static folder is missing at BUILD time, the `git clone` failed.

### Step 2: Check RUNTIME Logs

After build completes, check **RUNTIME** logs (scrolling down):

✅ **GOOD:**
```
🚀 Starting FreeFlow Annotation Platform
📁 Verifying app structure...
drwxr-xr-x ... static
📁 Checking static files...
-rw-r--r-- ... style.css
-rw-r--r-- ... main.js
-rw-r--r-- ... projects.js
🐍 Testing Python import...
✅ App imports OK
🌐 Starting server on port 7860...
[gunicorn] Booting worker
```

❌ **BAD:**
```
⚠️ Static files missing!
OR
❌ App import failed!
ModuleNotFoundError: No module named 'flask_cors'
```

### Step 3: Check for Common Errors

| Error in Logs | Meaning | Fix |
|---------------|---------|-----|
| `⚠️  Static folder not found!` | Files not copied during build | Dockerfile git clone issue |
| `ModuleNotFoundError: No module named 'flask_cors'` | Dependency not installed | requirements.txt or pip install issue |
| `Permission denied` | File ownership problem | chown command issue |
| `Address already in use` | Port conflict | Shouldn't happen in HF |
| `404 GET /static/...` | Flask can't find static files | Static folder path issue |

## Quick Fixes

### If Static Folder Not Found at Build Time:

The issue is in the Dockerfile git clone. Try this alternative:

```dockerfile
# Option 1: Direct git clone to /app
RUN git clone ${REPO_URL} /app && rm -rf /app/.git

# OR Option 2: Copy with rsync (if available)
RUN git clone ${REPO_URL} /tmp/repo && \
    rsync -av /tmp/repo/ /app/ && \
    rm -rf /tmp/repo /app/.git
```

### If Flask-CORS Module Missing:

Check that requirements.txt includes:
```
Flask-CORS
```

And Dockerfile installs it:
```dockerfile
RUN pip install --no-cache-dir gunicorn eventlet Flask-CORS
```

### If Static Files Exist But Still 404:

The issue is Flask routing. Check app.py has:

```python
app = Flask(__name__, 
            static_url_path='/static',
            static_folder='static')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)
```

## Test Locally First

Before pushing to HuggingFace, test the Docker build locally:

```bash
# Run the test script
./test_docker_local.sh

# OR manually:
docker build -t freeflow-test .
docker run -p 7860:7860 --rm freeflow-test
```

Then visit http://localhost:7860 and check:
- Does the page load?
- Are there 404 errors in browser console?
- Does styling appear?

If it works locally but not on HF, the issue is HF-specific (authentication/iframe).

## Deployment Checklist

Before pushing to HuggingFace:

- [ ] Static files exist locally: `ls -la static/`
- [ ] Static files tracked in git: `git ls-files | grep static/`
- [ ] Changes committed: `git status`
- [ ] Pushed to GitHub: `git push origin main`
- [ ] requirements.txt includes Flask-CORS
- [ ] Dockerfile copies files correctly
- [ ] app.py imports flask_cors
- [ ] Templates use `{{ url_for('static', ...) }}`

## Current Commands to Run

```bash
# 1. Verify static files are committed
cd /Users/wjm55/yale/freeflow
git ls-files static/

# 2. Commit all changes
git add Dockerfile app.py requirements.txt static/ templates/
git commit -m "Fix static files: Enhanced debugging and CORS"

# 3. Push to GitHub FIRST
git push origin main

# 4. Then push to HuggingFace
git push hf main

# 5. Watch the logs on HF Spaces
# Go to: https://huggingface.co/spaces/wjbmattingly/freeflow-test
# Click: "Logs" tab
# Look for: The debug output we added
```

## What to Report Back

After pushing, tell me:

1. **Does BUILD show static files?**
   - Look for `RUN ls -la /app/static/` output

2. **Does RUNTIME show static files?**
   - Look for `📁 Checking static files...` output

3. **Does Python import work?**
   - Look for `✅ App imports OK` or `❌ App import failed!`

4. **What's the first error** in the logs?
   - Copy the exact error message

This will tell us exactly where the problem is!

## Alternative: Simplify Dockerfile

If git clone keeps failing, we can switch to a simpler approach - copying files directly:

```dockerfile
# Instead of git clone, copy local files
COPY . /app/
RUN rm -rf /app/.git /app/venv /app/__pycache__
```

Then build and push the image directly to HF (not via GitHub).

---

**Next Step:** Push the updated Dockerfile to HF and check the logs! 📋


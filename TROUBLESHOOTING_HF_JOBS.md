# Troubleshooting HF Jobs UI

## Issue: HF Jobs Options Not Showing

If you select "Hugging Face Jobs" in the dropdown but don't see the credentials/hardware fields, follow these steps:

### 1. Clear Browser Cache

The most common issue is cached JavaScript/CSS files. Try:

**Chrome/Edge:**
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Select "Cached images and files"
- Click "Clear data"
- OR: Hard reload with `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

**Firefox:**
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Check "Cache"
- Click "Clear Now"

**Safari:**
- Press `Cmd+Option+E` to empty caches
- Then reload the page

### 2. Check Console for Errors

1. Open browser Developer Tools:
   - Chrome/Edge/Firefox: Press `F12`
   - Safari: Press `Cmd+Option+I`

2. Go to the "Console" tab

3. Navigate to the Training page

4. Look for these messages:
   ```
   🚀 Training page loaded
   🔧 Setting up HF Jobs UI...
   ✅ HF Jobs UI setup started
   ✅ HF Jobs UI setup complete
   ```

5. If you see errors about elements not found, that indicates a loading issue

### 3. Verify Elements Exist

In the browser console, type:
```javascript
document.getElementById('trainingLocation')
document.getElementById('hfJobsConfig')
document.getElementById('hfUsername')
document.getElementById('hfApiKey')
```

Each should return an HTML element, not `null`.

### 4. Manual Toggle Test

In the browser console, try manually showing the config:
```javascript
document.getElementById('hfJobsConfig').style.display = 'block';
```

If the fields appear, the issue is with the event listener.

### 5. Check JavaScript Is Loading

In the browser console:
```javascript
typeof setupHFJobsUI
```

Should return `"function"`, not `"undefined"`.

### 6. Restart the Server

Sometimes you need to restart the Flask server:
```bash
# Stop the server (Ctrl+C)
# Then restart:
python app.py
```

### 7. Check for File Modifications

Verify the files were updated correctly:

**Check training.html:**
```bash
grep -n "trainingLocation" templates/training.html
```
Should show the dropdown with id="trainingLocation"

**Check training.js:**
```bash
grep -n "setupHFJobsUI" static/js/training.js
```
Should show the function definition

### 8. Force Reload Static Files

If using a production server (gunicorn), restart it:
```bash
pkill gunicorn
./start.sh
```

### 9. Check for JavaScript Errors

Look in the Console tab for any red error messages. Common issues:
- Syntax errors in training.js
- Failed to load training.js (404 error)
- CORS errors

### 10. Test in Incognito/Private Mode

Open the site in an incognito/private browsing window to bypass all caches:
- Chrome: `Ctrl+Shift+N`
- Firefox: `Ctrl+Shift+P`
- Safari: `Cmd+Shift+N`

## Expected Behavior

When working correctly:
1. You should see a "Training Location" dropdown at the top of the training form
2. When you select "Hugging Face Jobs", three new sections should appear:
   - Hugging Face Username
   - Hugging Face API Key
   - Hardware (with GPU/CPU/TPU options)
3. Console should show setup messages
4. Changing the dropdown should log: "Training location changed to: huggingface"

## Still Not Working?

If none of the above work, please provide:
1. Browser and version
2. Console output (copy all messages)
3. Network tab showing if training.js loaded successfully
4. Output of this command in the terminal:
   ```bash
   ls -lah static/js/training.js templates/training.html
   ```

## Quick Fix: Manual Browser Console Setup

As a temporary workaround, after the page loads, run this in the console:
```javascript
const trainingLocation = document.getElementById('trainingLocation');
const hfJobsConfig = document.getElementById('hfJobsConfig');

trainingLocation.addEventListener('change', (e) => {
    if (e.target.value === 'huggingface') {
        hfJobsConfig.style.display = 'block';
    } else {
        hfJobsConfig.style.display = 'none';
    }
});
```

Then select "Hugging Face Jobs" from the dropdown.


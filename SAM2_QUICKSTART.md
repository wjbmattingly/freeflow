# SAM2 Quick Start Guide

## 🚀 Getting SAM2 Working in 2 Steps

### Step 1: Download the Model
```bash
cd /Users/wjm55/yale/freeflow
./download_sam2.sh
```
⏱️ Takes ~5 minutes (downloading ~900MB)

### Step 2: Done!
The server is already running with SAM2 support. Just refresh your browser and enable SAM2 in the annotation page!

---

## 🎨 How to Use SAM2

### Hover Mode (Point-based Segmentation)
1. Go to annotation page
2. ✅ Check "Enable SAM2 Mode"
3. Select "Hover Preview (Point)"
4. Move mouse over object → See instant segmentation preview
5. Click to create polygon annotation

### Box Mode (Box-to-Polygon Conversion)
1. Go to annotation page
2. ✅ Check "Enable SAM2 Mode"
3. Select "Box to Polygon"
4. Draw bounding box around object
5. Press **`S`** key → Converts to precise polygon

### Polygon Detail Slider
- **Coarse** (left) → Fewer points, simpler shape
- **Fine** (right) → More points, detailed shape

---

## ✅ What's Already Fixed

- ✅ Auto-save on navigation works again
- ✅ Class mappings persist automatically
- ✅ Better error messages if model not downloaded
- ✅ Local model support (no API calls to external services)

---

## 🔍 Current Status

**Before downloading model:**
- SAM2 UI shows, but hovering shows error toast: "SAM2 not ready: Please download the SAM2 model first"

**After downloading model:**
- Full SAM2 functionality with real-time instance segmentation!

---

## 💾 What Uses the LOCAL Model

Yes! Everything runs locally:
- ✅ Model stored in: `models/sam2/sam2_hiera_large.pt`
- ✅ Predictions run on your machine (CPU or GPU)
- ✅ No internet required after download
- ✅ No external API calls
- ✅ Your data stays private

---

## 📊 Model Info

**Model**: SAM2.1 Hiera Large  
**Size**: ~900MB  
**Source**: Meta AI (Facebook Research)  
**Quality**: Best available for instance segmentation  
**Speed**: Fast on GPU, usable on CPU  

---

## 🆘 Need Help?

See `SAM2_FIX_SUMMARY.md` for detailed troubleshooting and technical information.



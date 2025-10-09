# Quick Start Guide

## 🚀 Start the App

```bash
cd /Users/wjm55/yale/freeflow
python app.py
```

Open: http://127.0.0.1:5000

## 📝 Create Your First Project

1. Click "**+ New Project**"
2. Enter name (e.g., "Card Detection")
3. Add classes (e.g., "card")
4. Click "**Create Public Project**"

## 📤 Upload Images

1. Click "**Upload More Images**"
2. Drag & drop images or PDFs
3. PDFs auto-extract to images

## 🏷️ Auto-Label with Your Models

### One Image at a Time:
1. Click "**Annotate**"
2. Click "**Label Assist**"
3. **Uncheck** "Enable Continuous Label Assist"
4. Select model: `card/m/weights/best.pt`
5. Click "**Run Assist**"

### All Images Automatically:
1. Click "**Annotate**"
2. Click "**Label Assist**"
3. ✅ **Check** "Enable Continuous Label Assist"
4. ✅ **Check** "Clear existing annotations"
5. Select model: `card/m/weights/best.pt`
6. Map classes if needed
7. Click "**Run Assist**"
8. **Button turns purple** 🟣
9. Press **→** to go to next image
10. **Auto-labeled!** Repeat for all images

## ✏️ Edit Classes

1. Go to project
2. Click "**Classes & Tags**" tab
3. **Edit name**: Click field, type, Enter
4. **Change color**: Click color picker
5. **Delete**: Click trash icon

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **→** / **←** | Navigate images (auto-labels if enabled) |
| **1-9** | Select class |
| **Ctrl+S** | Save annotations |
| **Ctrl+Z** | Undo |
| **Ctrl+Y** | Redo |

## 💡 Pro Tips

### For Best Auto-Labeling:
- Use **m** or **s** models (good speed/accuracy)
- Set confidence **60-70%** for clean data
- Enable "**Clear existing**" in continuous mode
- Review every 10th image for quality

### For Manual Annotation:
- Disable continuous mode
- Draw boxes with mouse
- Use **1-9** keys to switch classes
- **Ctrl+S** after each image

## 🎯 Your Models

Located in `output_models/card/`:
- **n/weights/best.pt** - Fastest ⚡
- **s/weights/best.pt** - Fast + Good
- **m/weights/best.pt** - **Recommended** ⭐
- **l/weights/best.pt** - Most Accurate 🎯

## 🔄 Typical Workflow

```
1. Create Project
   ↓
2. Add Classes (editable anytime!)
   ↓
3. Upload 100 images
   ↓
4. Enable Continuous Label Assist
   ↓
5. Select external model (card/m)
   ↓
6. Press → to auto-label all images
   ↓
7. Review and manually correct
   ↓
8. Ctrl+S to save each image
   ↓
9. Train your own YOLOv11 model (optional)
   ↓
10. Use your trained model for future batches!
```

## 🆘 Troubleshooting

**Purple button won't turn on?**
- Make sure "Enable Continuous Label Assist" is checked
- Select a model first
- Click "Run Assist"

**No predictions appearing?**
- Lower confidence threshold
- Check model is selected
- Verify classes are mapped correctly

**Wrong classes predicted?**
- Go to Label Assist → Map classes
- Adjust model class → project class mappings

**Want to change class name?**
- Go to project → Classes tab
- Edit inline - all annotations update!

## 📚 Full Docs

- `README.md` - Installation & overview
- `FEATURES.md` - All features explained
- `LABEL_ASSIST_GUIDE.md` - Detailed assist guide
- `COMPLETE_FEATURE_LIST.md` - Technical details

---

**You're ready to annotate! Happy labeling! 🎉**


# Label Assist Guide

## 🚀 New Features

### Continuous Label Assist Mode
Your Label Assist now works in **persistent mode** - once enabled, it automatically labels every image as you navigate!

## How It Works

### 1. One-Time Labeling (Original Mode)
- Open Label Assist panel
- **Uncheck** "Enable Continuous Label Assist"
- Select model and configure settings
- Click "Run Assist"
- Labels current image only

### 2. Continuous Mode (NEW! 🎉)
- Open Label Assist panel
- **Check** "Enable Continuous Label Assist"
- Select your model (trained or external)
- Map classes if using external model
- Click "Run Assist"
- **Button turns purple** to show it's active
- Now navigate between images with ← → arrows
- **Each image is automatically labeled** when you view it!

## Settings

### Clear Existing Annotations
- ✅ **Checked (Default)**: Removes all previous annotations before running assist
- ❌ **Unchecked**: Adds predictions to existing annotations

This is especially useful in continuous mode to ensure clean, model-only annotations.

### Model Source
- **Trained Model**: Use your project's trained YOLO model
- **External Models**: Use models from `output_models/` folder
  - Automatically detects your card detection models (n, s, m, l)
  - Shows model classes
  - Lets you map model classes to your project classes

### Confidence Threshold
- Adjust slider to set minimum confidence (default: 50%)
- Higher = fewer, more confident predictions
- Lower = more predictions, potentially less accurate

## Visual Indicators

### When Continuous Mode is Active:
- 🟣 **Purple "Label Assist" button** - Shows mode is ON
- Click button again to **disable** continuous mode
- No toast notifications on each image (to avoid spam)
- Check console for per-image results

### When Disabled:
- ⚪ **Normal button** - Continuous mode OFF
- Click to open configuration panel

## Workflow Examples

### Example 1: Bulk Auto-Labeling
```
1. Upload 100 images
2. Open Label Assist
3. Enable "Continuous Label Assist"
4. Enable "Clear existing annotations"
5. Select your best external model
6. Map classes
7. Click "Run Assist"
8. Navigate through images with → key
9. Each image gets auto-labeled!
10. Make manual corrections as needed
11. Press Ctrl+S to save
```

### Example 2: Assisted Annotation
```
1. Open Label Assist
2. Disable "Continuous Label Assist"
3. Uncheck "Clear existing annotations"
4. Use Label Assist to add predictions
5. Manually draw additional boxes
6. Save annotations
```

### Example 3: Model Comparison
```
1. Enable continuous mode with Model A
2. Navigate through a few images
3. Disable continuous mode
4. Enable again with Model B
5. Navigate same images
6. Compare results!
```

## Tips

### For Best Results:
1. **Start with your best model** - Use the most accurate model first
2. **Higher confidence for cleaner data** - Set 60-70% for production
3. **Map classes carefully** - Ensure model classes match your needs
4. **Clear existing for fresh labeling** - Enable when using continuous mode
5. **Review and adjust** - Auto-labels aren't perfect, always review!

### Keyboard Shortcuts:
- **→** / **←**: Navigate images (auto-labels in continuous mode)
- **Ctrl+S**: Save current annotations
- **Ctrl+Z**: Undo
- **1-9**: Select class for manual correction

## Your External Models

Your `output_models/card/` contains:
- **n/weights/best.pt** - Fastest, least accurate
- **s/weights/best.pt** - Fast, good balance
- **m/weights/best.pt** - Slower, more accurate
- **l/weights/best.pt** - Slowest, most accurate

### Recommended Usage:
1. Use **s** or **m** for continuous labeling
2. Use **l** for difficult images
3. Use **n** for quick previews

## Troubleshooting

### Continuous mode stops working:
- Model might be failing on some images
- Check console for errors
- Button returns to normal color
- Re-enable with different settings

### Wrong classes being predicted:
- Check your class mapping
- Model might have different class order
- Use the mapping UI to correct

### Too many/few predictions:
- Adjust confidence threshold
- Higher threshold = fewer boxes
- Lower threshold = more boxes

## Advanced: Class Mapping

When using external models, you can:
1. **Map each model class** to your project classes
2. **Skip classes** you don't want (select "-- Skip --")
3. **One-to-many mapping** - Multiple model classes → same project class

Example:
```
Model Class "card_front" → Your Class "card"
Model Class "card_back" → Your Class "card"
Model Class "background" → Skip
```

This gives you precise control over how external models integrate with your project!

## Performance Notes

- Continuous mode makes API calls for each image
- Larger models (l, xl) are slower
- Consider confidence vs. speed tradeoff
- Console logs show timing information

Enjoy automated annotation! 🎉


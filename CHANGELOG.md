# Changelog

## Latest Updates

### 📦 Dataset Versioning (NEW!)
- **Create reproducible dataset versions** - Snapshot your data with custom splits
- **Flexible train/val/test splits** - Any percentage (default: 70/20/10%)
- **Version management** - Name, describe, and organize your datasets
- **Training integration** - Select a version when training
- **One-click workflow** - "Train" button on version card jumps to training page
- **Smart auto-split** - Works without versions for quick experimentation
- **Statistics dashboard** - View image counts, annotations, and split percentages
- **Safe deletion** - Prevents deletion of versions used in training jobs
- **URL parameters** - Deep link to training with specific version

### 🚀 YOLO11 Integration
- **Updated to YOLOv11** - Now using the latest YOLO architecture for training
- State-of-the-art object detection performance
- Backward compatible with existing YOLOv8/v5 models in `output_models/`

### 📸 Image Grid View
- **Beautiful thumbnail grid** on project page
- **Pagination controls** - Select 10, 20, 50, 100, or 200 images per page (default: 20)
- **Visual status indicators** - Green border for annotated, gray for unassigned
- **Click any image** to jump directly to annotation
- **Image information** - Shows filename, dimensions, and annotation status
- **Showing counter** - "Showing X of Y images (Z annotated)"

### 🔄 Continuous Label Assist
- **Persistent mode** - Enable once, auto-labels all images as you navigate
- **Purple button indicator** - Shows when continuous mode is active
- **Clear existing annotations option** - Checkbox to remove old annotations before assist
- **Automatic processing** - Press → arrow to auto-label next image
- **Click to disable** - Click purple button to turn off mode

### 🎨 Enhanced Class Management
- **Full CRUD operations** - Create, Read, Update, Delete classes
- **Inline editing** - Click to edit name, changes propagate to all annotations
- **Color picker** - Click to change class color
- **Delete with cascade** - Removes class and all associated annotations
- **Better UI** - Shows all class properties, not just colors

### 🗺️ Class Mapping for External Models
- **Interactive mapping UI** - Map model classes to your project classes
- **Model class detection** - Automatically reads classes from external models
- **Dropdown selectors** - Easy-to-use interface for mapping
- **Skip option** - Choose which model classes to ignore
- **Smart defaults** - Auto-maps by index when possible

### 🔧 Technical Improvements
- **Fixed circular imports** - Cleaner module structure
- **Better error handling** - Graceful failures in continuous mode
- **Lazy loading** - Images load as you scroll
- **Smooth pagination** - Auto-scroll to top on page change
- **Console logging** - Debug info without UI spam

## Feature Summary

✅ YOLOv11 training  
✅ Image grid with thumbnails  
✅ Pagination (10-200 per page)  
✅ Continuous Label Assist mode  
✅ Clear existing annotations  
✅ Full class CRUD operations  
✅ Class mapping UI  
✅ External model integration  
✅ PDF parsing  
✅ Real-time training graphs  
✅ Keyboard shortcuts  
✅ Undo/redo support  

## Model Compatibility

### New Training (FreeFlow)
- Uses **YOLOv11** architecture
- Best performance and accuracy
- Latest features and optimizations

### External Models
- Supports **YOLOv5, YOLOv8, YOLOv11** models
- Your `output_models/card/` models work perfectly
- Class mapping handles any model structure

## Next Steps

Future enhancements planned:
- [ ] Export annotations (COCO, YOLO, Pascal VOC formats)
- [ ] Batch operations (delete, move, copy)
- [ ] Advanced filters (by status, date, size)
- [ ] Search by filename
- [ ] Model comparison tools
- [ ] Data augmentation preview
- [ ] Annotation statistics dashboard

---

**Version**: 1.0  
**Last Updated**: 2025-10-09  
**Python**: 3.8+  
**YOLO**: v11 (Ultralytics)


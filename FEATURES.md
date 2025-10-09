# FreeFlow - Feature Summary

## ✅ All Implemented Features

### 1. Project Management
- ✅ Create projects with custom name and annotation groups
- ✅ Select project type (Object Detection, Classification, Segmentation)
- ✅ View all projects in grid layout
- ✅ Search and sort projects
- ✅ Delete projects

### 2. Class Management (NEW!)
- ✅ **Full CRUD operations for classes**
- ✅ **Edit class names inline** - Changes all associated annotations
- ✅ **Change class colors** - Click color picker to update
- ✅ **Delete classes** - Removes class and all its annotations (with confirmation)
- ✅ **Add new classes** - Add classes at any time
- ✅ Better UI showing all class details (not just color)

### 3. Data Management
- ✅ Batch image upload (drag & drop or click)
- ✅ **PDF parsing** - Automatically extracts images from PDFs using pdfium
- ✅ View uploaded batches and images
- ✅ Track annotation progress per batch

### 4. Annotation Interface
- ✅ Interactive canvas-based annotation
- ✅ Draw bounding boxes with mouse
- ✅ Select classes with keyboard (1-9) or mouse
- ✅ Undo/Redo functionality (Ctrl+Z / Ctrl+Y)
- ✅ Zoom in/out and pan
- ✅ Save annotations (Ctrl+S or button)
- ✅ Navigate between images (arrows or buttons)
- ✅ View annotation count and list

### 5. Label Assist / YOLO-in-the-Loop (ENHANCED!)
- ✅ Use trained models for automated predictions
- ✅ **Use external models from `output_models/` folder**
- ✅ **Load your pre-trained models** (detects models in output_models/)
- ✅ **View model classes** - See what classes the model was trained on
- ✅ **Class mapping UI** - Map model classes to your project classes
  - Select which model class maps to which project class
  - Skip model classes you don't want
  - Visual mapping interface with dropdowns
- ✅ Adjustable confidence threshold
- ✅ Add predictions as annotations

### 6. Dataset Versioning (NEW!)
- ✅ **Create dataset versions** with custom train/val/test splits
- ✅ **Configurable splits** - Any percentage (default: 70/20/10%)
- ✅ **Snapshot versioning** - Reproducible training data
- ✅ **Name and describe** each version
- ✅ **Training integration** - Select version when training
- ✅ **Version management** - Delete unused versions
- ✅ **Statistics tracking** - Total images and annotations per version
- ✅ **Smart defaults** - Auto-split available if no version selected
- ✅ **One-click training** - Jump to training with version pre-selected

### 7. YOLO Training
- ✅ Train YOLOv11 models on annotated data
- ✅ Configure epochs, batch size, image size
- ✅ **Select dataset version** or use auto-split
- ✅ **Real-time training monitoring**
- ✅ **Interactive graphs** (loss, mAP) using Chart.js
- ✅ View training metrics live
- ✅ Background training with SocketIO
- ✅ Training history

### 8. External Model Integration
Your models in `output_models/card/` are now available:
- ✅ **n/weights/best.pt** - Nano model
- ✅ **s/weights/best.pt** - Small model  
- ✅ **m/weights/best.pt** - Medium model
- ✅ **l/weights/best.pt** - Large model

All models automatically detected and available in Label Assist!

Note: New models trained in FreeFlow use **YOLOv11** architecture (latest version)

### 9. Database
- ✅ SQLite local storage
- ✅ Tracks projects, classes, images, annotations, training jobs
- ✅ Class changes update all associated annotations
- ✅ Cascade deletes (deleting project deletes all data)

## 🎨 UI/UX Features
- Modern, clean design
- Dark mode annotation interface
- Responsive layout
- Toast notifications
- Modal dialogs
- Progress indicators
- Keyboard shortcuts
- Drag and drop file upload

## 🔧 Technical Features
- Flask backend with RESTful API
- SocketIO for real-time updates
- SQLAlchemy ORM
- HTML5 Canvas for annotation
- Vanilla JavaScript (no framework dependencies)
- PyTorch + Ultralytics YOLO
- PDF image extraction with pdfium

## 📝 Keyboard Shortcuts
- **1-9**: Select class
- **←/→**: Navigate images
- **Ctrl+S**: Save annotations
- **Ctrl+Z**: Undo
- **Ctrl+Y**: Redo

## 🚀 Usage

### Using External Models
1. Place your YOLO `.pt` files in `output_models/` folder (organized by subdirectories)
2. Go to annotation interface
3. Click "Label Assist"
4. Select your external model from dropdown
5. **Map model classes to your project classes** using the mapping UI
6. Adjust confidence threshold
7. Click "Run Assist"
8. Review and adjust predictions

### Editing Classes
1. Go to project page
2. Click "Classes & Tags" tab
3. **Edit name**: Click on name field, type new name, press Enter
4. **Change color**: Click color picker, select new color
5. **Delete class**: Click trash icon (confirms before deleting)
6. All annotations automatically update when class changes!

### Training Models
1. Annotate at least some images
2. Click "Train Model"
3. Configure settings (epochs, batch size, image size)
4. Click "Start Training"
5. Watch real-time graphs update
6. Use trained model in Label Assist

## 🎯 Your Card Detection Models
Your `output_models/card/` folder contains 4 YOLOv8 models (n, s, m, l variants).
These are now available for:
- Label Assist in annotation interface
- Class mapping to your project classes
- Quick predictions on new images

Perfect for card detection tasks with customizable class mappings!


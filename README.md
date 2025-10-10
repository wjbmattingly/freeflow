# FreeFlow - Annotation Platform

A comprehensive annotation platform similar to Roboflow, built with Flask. Supports object detection annotation, YOLO model training, and real-time monitoring.

## Features

✅ **Project Management**
- Create and manage multiple projects
- Support for object detection, classification, and segmentation
- Custom classes with color coding

✅ **Data Management**
- Batch image upload
- PDF parsing with automatic image extraction using pdfium
- Image organization and tracking

✅ **Annotation Interface**
- Interactive canvas-based annotation
- Bounding box drawing
- Label Assist (YOLO-in-the-loop) for automated predictions
- Keyboard shortcuts for efficient annotation
- Undo/redo functionality

✅ **YOLO Model Training**
- Train YOLOv8 models on annotated data
- Real-time training progress monitoring
- Interactive graphs for loss and mAP metrics
- Configurable training parameters

✅ **Database**
- SQLite database for local storage
- Single user system (no team management needed)
- Tracks projects, images, annotations, and training jobs

## Installation

1. **Clone the repository or navigate to the project directory:**
```bash
cd /Users/wjm55/yale/freeflow
```

2. **Create a virtual environment:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

## Usage

1. **Start the Flask server:**
```bash
python app.py
```

2. **Open your browser and navigate to:**
```
http://localhost:5000
```

3. **Create your first project:**
   - Click "New Project"
   - Enter project name and annotation group
   - Select project type (Object Detection recommended)
   - Add classes for your objects
   - Click "Create Public Project"

4. **Upload images:**
   - Navigate to your project
   - Click "Upload More Images"
   - Drag and drop images or PDFs
   - Images from PDFs will be automatically extracted

5. **Annotate images:**
   - Click "Annotate" button
   - Select a class from the left sidebar
   - Draw bounding boxes on the image
   - Press Ctrl+S to save (or click Save button)
   - Use arrow keys to navigate between images

6. **Train a YOLO11 model:**
   - Click "Train Model" button
   - Configure epochs, batch size, and image size
   - Click "Start Training"
   - Monitor real-time training progress with graphs
   - Uses latest YOLOv11 architecture

7. **Use Label Assist:**
   - After training a model, go to annotation interface
   - Click "Label Assist" button
   - Select classes and confidence threshold
   - Click "Run Assist" to get automated predictions

## Keyboard Shortcuts

- **1-9**: Select class by number
- **Arrow Left/Right**: Navigate between images
- **Ctrl+S**: Save annotations
- **Ctrl+Z**: Undo
- **Ctrl+Y**: Redo
- **Shift+Select**: Drag an annotation over another annotation

## Project Structure

```
freeflow/
├── app.py                 # Main Flask application
├── models.py              # Database models
├── routes.py              # API endpoints
├── training.py            # YOLO training logic
├── requirements.txt       # Python dependencies
├── templates/             # HTML templates
│   ├── base.html
│   ├── index.html         # Landing page
│   ├── project.html       # Project management
│   ├── annotate.html      # Annotation interface
│   └── training.html      # Training dashboard
├── static/
│   ├── css/
│   │   └── style.css      # Styling
│   └── js/
│       ├── main.js        # Utilities
│       ├── projects.js    # Projects page
│       ├── project.js     # Project management
│       ├── annotate.js    # Annotation interface
│       └── training.js    # Training dashboard
├── uploads/               # Uploaded images (created automatically)
├── datasets/              # Training datasets (created automatically)
└── training_runs/         # Training outputs (created automatically)
```

## Database Schema

- **Project**: Stores project information
- **Class**: Stores class definitions for each project
- **Image**: Stores image metadata and file paths
- **Annotation**: Stores bounding box annotations
- **TrainingJob**: Stores training job information and metrics

## Technologies Used

- **Backend**: Flask, SQLAlchemy, Flask-SocketIO
- **Frontend**: Vanilla JavaScript, HTML5 Canvas, Chart.js
- **ML**: Ultralytics YOLO (YOLOv11), PyTorch
- **PDF Processing**: pypdfium2
- **Image Processing**: Pillow, OpenCV

## Notes

- The platform is designed for single-user usage (no authentication or team features)
- All data is stored locally in SQLite database
- Trained models are saved in `training_runs/` directory
- Images are stored in `uploads/` directory organized by project

## Future Enhancements

- Export annotations in various formats (COCO, Pascal VOC, etc.)
- Model versioning and comparison
- Data augmentation options
- Polygon and segmentation annotation tools
- Import from other annotation tools

## Support

For issues or questions, please refer to the documentation or create an issue in the repository.


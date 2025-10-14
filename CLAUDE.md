# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FreeFlow is a comprehensive annotation platform for object detection, similar to Roboflow but fully local. It features a Flask backend with YOLOv11 integration for model training and inference, SQLAlchemy for database management, and a vanilla JavaScript frontend with HTML5 Canvas for interactive annotation.

## Common Development Commands

### Starting the Application
```bash
# Activate virtual environment (if using conda)
conda activate freeflow

# Run the application
python app.py
```
The app runs on http://localhost:5000 with debug mode enabled by default.

### Installing Dependencies
```bash
pip install -r requirements.txt
```

### Database Operations
The SQLite database is auto-created on first run. To reset the database:
```bash
rm instance/annotation_platform.db
python app.py  # Will recreate database with schema
```

## Architecture Overview

### Backend Structure
- **app.py** (93 lines): Flask application setup, route registration, and SocketIO configuration. Entry point for the application.
- **routes.py** (1500+ lines): All API endpoints and page routes. Core business logic for projects, annotations, training, and model management.
- **models.py** (200+ lines): SQLAlchemy ORM models defining database schema for Project, Image, Annotation, Class, DatasetVersion, TrainingJob, and CustomModel.
- **training.py** (400+ lines): YOLOv11 training implementation with custom callbacks for real-time progress via SocketIO. Handles dataset preparation, model training, and early stopping.
- **database.py**: Simple database initialization module.

### Frontend Architecture
- **Annotation System**: Canvas-based drawing in `static/js/annotate.js` with zoom, pan, undo/redo, and auto-save capabilities
- **Real-time Updates**: SocketIO integration for live training progress, PDF processing, and other long-running operations
- **Model Management**: Interactive training dashboard with Chart.js graphs showing loss metrics, mAP, precision/recall
- **No Framework**: Pure vanilla JavaScript for all frontend logic, avoiding dependencies

### Data Flow
1. **Images/PDFs** → Uploaded to `uploads/<project_id>/` → Processed and stored in database
2. **Annotations** → Saved in YOLO format (normalized coordinates) to database
3. **Training** → Creates dataset in `datasets/project_<id>_job_<id>/` → Trains model → Saves to `training_runs/<project_id>/job_<id>/`
4. **Inference** → Loads model from training_runs or output_models → Predicts on images → Returns bounding boxes

### Key Design Patterns
- **Single-user system**: No authentication layer, designed for local use
- **Real-time feedback**: SocketIO for all long-running operations (training, PDF processing)
- **Database-driven**: All metadata in SQLite, files on disk referenced by paths
- **Modular routes**: Clean separation between routing (app.py) and logic (routes.py)

## Important Implementation Details

### File Storage Structure
```
uploads/<project_id>/           # Original uploaded images
datasets/project_X_job_Y/        # YOLO format datasets for training
training_runs/<project_id>/job_X/  # Training outputs (weights, metrics)
output_models/                   # External/custom uploaded models
```

### YOLO Integration
- Uses Ultralytics YOLOv11 (latest version)
- Supports nano, small, medium, large, x-large models
- Custom training callbacks in `training.py` for progress tracking
- Automatic dataset formatting to YOLO structure

### WebSocket Events
Key SocketIO events emitted during operations:
- `pdf_processing_progress`: PDF page extraction progress
- `training_progress`: Epoch-by-epoch training updates
- `training_complete`: Final training results
- `training_error`: Error handling

### Database Relationships
- Project → has many → Classes, Images, DatasetVersions, TrainingJobs
- Image → has many → Annotations
- Annotation → belongs to → Image and Class
- TrainingJob → belongs to → Project and optionally DatasetVersion

## Development Tips

### Adding New Features
- API endpoints go in `routes.py` following existing patterns
- Database changes require new models in `models.py`
- Frontend features typically need updates in both HTML templates and corresponding JS files
- Training modifications happen in `training.py` callback classes

### Debugging
- Server logs are written to `server.log`
- Flask debug mode is enabled by default in development
- Browser console shows SocketIO events for real-time operations
- Database can be inspected directly: `sqlite3 instance/annotation_platform.db`

### Performance Considerations
- Images are resized to max 2000px on longest side during upload
- Batch operations use database transactions for efficiency
- Training uses GPU if available (falls back to CPU)
- Canvas rendering optimized for large numbers of bounding boxes

## Identified Improvements (Quick Wins)

### Priority 1: Critical Security Fixes (30 mins)
- **Hardcoded SECRET_KEY** (`app.py:8`) - Use environment variables with python-dotenv
- **Debug mode in production** (`app.py:93`) - Make conditional based on FLASK_ENV
- **No input validation** - Add marshmallow schemas for all user inputs
- **CORS wildcard** (`app.py:18`) - Restrict to specific origins

### Priority 2: Database Performance (20 mins)
- **Missing indexes** - Add indexes to all foreign keys and frequently queried columns:
  - `Image`: project_id, batch_id, status
  - `Annotation`: image_id, class_id
  - `TrainingJob`: project_id, status
- **N+1 queries** (`routes.py:51-63, 739-759`) - Use eager loading with joinedload
- **No connection pooling** - Configure SQLALCHEMY_POOL_SIZE, POOL_TIMEOUT, etc.

### Priority 3: Error Handling & Logging (30 mins)
- **No logging system** - Add structured logging with RotatingFileHandler
- **Bare except blocks** - Replace with specific exception handling
- **No centralized error handlers** - Add 404/500 handlers
- **Generic error messages** - Make user-friendly with proper status codes

### Priority 4: Code Organization (Quick Fixes)
- **Extract configuration** - Create config.py for all magic numbers/paths:
  ```python
  class Config:
      UPLOAD_FOLDER = 'uploads'
      DATASET_FOLDER = 'datasets'
      TRAINING_RUNS_FOLDER = 'training_runs'
      OUTPUT_MODELS_FOLDER = 'output_models'
      MAX_FILE_SIZE = 1000 * 1024 * 1024  # 1GB
  ```
- **Pin requirements.txt versions** - Prevent breaking changes
- **Duplicate date formatting** (`main.js:26-45` and `project.js:1202-1219`)

### Priority 5: Missing Essential Features (Easy Adds)
- **Health check endpoint** - Add `/health` for monitoring
- **Rate limiting** - Use Flask-Limiter on upload/training endpoints
- **Request validation** - Marshmallow schemas for POST/PUT endpoints
- **Cache headers** - Add Cache-Control for static images
- **API versioning** - Prefix routes with `/api/v1/`

### Implementation Checklist

#### Phase 1: Security & Config (1 hour)
```bash
pip install python-dotenv marshmallow flask-limiter
```
1. [ ] Create `.env` and `.env.example` files
2. [ ] Replace hardcoded SECRET_KEY with env var
3. [ ] Make debug mode conditional
4. [ ] Add input validation schemas
5. [ ] Configure CORS properly
6. [ ] Pin dependency versions in requirements.txt

#### Phase 2: Performance (30 mins)
1. [ ] Add database indexes to models.py
2. [ ] Fix N+1 queries with eager loading
3. [ ] Add connection pooling config
4. [ ] Add Cache-Control headers for images

#### Phase 3: Quality & Stability (30 mins)
1. [ ] Set up logging configuration
2. [ ] Replace print statements with logger
3. [ ] Fix bare except blocks
4. [ ] Add centralized error handlers
5. [ ] Add health check endpoint

### Estimated Impact
- **Security**: Eliminates critical vulnerabilities
- **Performance**: 50-70% faster DB queries with indexes
- **Stability**: Better debugging with proper logging
- **Maintainability**: Cleaner, more organized code

### Files to Modify
- `app.py` - Environment vars, logging, debug mode, connection pooling
- `models.py` - Add database indexes
- `routes.py` - Fix N+1 queries, error handling, validation
- `requirements.txt` - Pin versions
- NEW: `.env.example`, `config.py`, `schemas.py`, `logging_config.py`

All changes are backward-compatible and low-risk.
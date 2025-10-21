from flask import render_template, request, jsonify, send_from_directory, send_file, current_app
from database import db
from models import Project, Image, Annotation, Class, DatasetVersion, TrainingJob, CustomModel
from werkzeug.utils import secure_filename
from PIL import Image as PILImage
import pypdfium2 as pdfium
from pathlib import Path
import os
import json
from datetime import datetime
import uuid
import threading
import re

# App and socketio will be injected by app.py
_app_instance = None
_socketio_instance = None

def init_routes(app, socketio):
    """Initialize routes with app and socketio instances"""
    global _app_instance, _socketio_instance
    _app_instance = app
    _socketio_instance = socketio

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf', 'tiff', 'bmp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==================== MAIN PAGES ====================

def index():
    """Landing page with projects"""
    return render_template('index.html')

def project_page(project_id):
    """Project data management page"""
    return render_template('project.html', project_id=project_id)

def annotate_page(project_id):
    """Annotation interface"""
    return render_template('annotate.html', project_id=project_id)

def training_page(project_id):
    """Training monitoring dashboard"""
    return render_template('training.html', project_id=project_id)

# Routes will be registered by app.py after import

# ==================== API ENDPOINTS ====================

def get_projects():
    """Get all projects"""
    projects = Project.query.order_by(Project.updated_at.desc()).all()
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'project_type': p.project_type,
        'annotation_group': p.annotation_group,
        'created_at': p.created_at.isoformat(),
        'updated_at': p.updated_at.isoformat(),
        'image_count': len(p.images),
        'annotated_count': sum(1 for img in p.images if img.status == 'completed')
    } for p in projects])

def create_project():
    """Create a new project"""
    data = request.json
    
    project = Project(
        name=data['name'],
        project_type=data.get('project_type', 'object_detection'),
        annotation_group=data.get('annotation_group', '')
    )
    
    db.session.add(project)
    db.session.flush()
    
    # Add classes
    classes_data = data.get('classes', [])
    for cls_data in classes_data:
        cls = Class(
            name=cls_data['name'],
            color=cls_data.get('color', '#FF0000'),
            project_id=project.id
        )
        db.session.add(cls)
    
    db.session.commit()
    
    return jsonify({'id': project.id, 'message': 'Project created successfully'}), 201

def get_project(project_id):
    """Get project details"""
    project = Project.query.get_or_404(project_id)
    
    return jsonify({
        'id': project.id,
        'name': project.name,
        'project_type': project.project_type,
        'annotation_group': project.annotation_group,
        'created_at': project.created_at.isoformat(),
        'image_count': len(project.images),
        'annotated_count': sum(1 for img in project.images if img.status == 'completed'),
        'classes': [{
            'id': cls.id,
            'name': cls.name,
            'color': cls.color
        } for cls in project.classes],
                'training_jobs': [{
                    'id': job.id,
                    'name': job.name,
                    'model_size': job.model_size,
                    'status': job.status,
                    'epochs': job.epochs,
                    'batch_size': job.batch_size,
                    'image_size': job.image_size,
                    'dataset_version_id': job.dataset_version_id,
                    'model_path': job.model_path,
                    'test_map50': job.test_map50,
                    'test_precision': job.test_precision,
                    'test_recall': job.test_recall,
                    'created_at': job.created_at.isoformat(),
                    'started_at': job.started_at.isoformat() if job.started_at else None,
                    'completed_at': job.completed_at.isoformat() if job.completed_at else None
                } for job in project.training_jobs],
        'custom_models': [{
            'id': model.id,
            'name': model.name,
            'description': model.description,
            'file_path': model.file_path,
            'file_size': model.file_size,
            'created_at': model.created_at.isoformat()
        } for model in project.custom_models]
    })

def delete_project(project_id):
    """Delete a project"""
    project = Project.query.get_or_404(project_id)
    
    # Delete all associated files
    for image in project.images:
        try:
            os.remove(image.filepath)
        except:
            pass
    
    # Delete custom thumbnail if exists
    if project.thumbnail_path and os.path.exists(project.thumbnail_path):
        try:
            os.remove(project.thumbnail_path)
        except:
            pass
    
    db.session.delete(project)
    db.session.commit()
    
    return jsonify({'message': 'Project deleted successfully'})

def update_project_settings(project_id):
    """Update project settings (name, thumbnail)"""
    project = Project.query.get_or_404(project_id)
    data = request.json
    
    # Update name if provided
    if 'name' in data:
        project.name = data['name']
    
    # Update thumbnail if provided
    if 'thumbnail_image_id' in data:
        if data['thumbnail_image_id'] is None:
            # Clear thumbnail
            project.thumbnail_image_id = None
            project.thumbnail_path = None
        else:
            # Set to an existing image
            image_id = data['thumbnail_image_id']
            image = Image.query.filter_by(id=image_id, project_id=project_id).first()
            if image:
                project.thumbnail_image_id = image_id
                project.thumbnail_path = None
            else:
                return jsonify({'error': 'Image not found'}), 404
    
    project.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'message': 'Project settings updated successfully'})

def upload_project_thumbnail(project_id):
    """Upload a custom thumbnail for a project"""
    project = Project.query.get_or_404(project_id)
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    # Save thumbnail
    from flask import current_app
    thumbnails_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], 'thumbnails')
    os.makedirs(thumbnails_folder, exist_ok=True)
    
    filename = secure_filename(file.filename)
    unique_filename = f"proj_{project_id}_{uuid.uuid4()}_{filename}"
    filepath = os.path.join(thumbnails_folder, unique_filename)
    file.save(filepath)
    
    # Delete old custom thumbnail if exists
    if project.thumbnail_path and os.path.exists(project.thumbnail_path):
        try:
            os.remove(project.thumbnail_path)
        except Exception as e:
            print(f"Failed to delete old thumbnail: {e}")
    
    # Update project
    project.thumbnail_path = filepath
    project.thumbnail_image_id = None
    project.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Thumbnail uploaded successfully',
        'thumbnail_path': filepath
    })

def get_project_thumbnail(project_id):
    """Get project thumbnail image"""
    from flask import send_file
    
    project = Project.query.get_or_404(project_id)
    
    # Check if custom thumbnail exists
    if project.thumbnail_path and os.path.exists(project.thumbnail_path):
        return send_file(project.thumbnail_path)
    
    # Check if thumbnail image ID is set
    if project.thumbnail_image_id:
        image = Image.query.get(project.thumbnail_image_id)
        if image and os.path.exists(image.filepath):
            return send_file(image.filepath)
    
    # Return placeholder or first image
    first_image = Image.query.filter_by(project_id=project_id).order_by(Image.uploaded_at).first()
    if first_image and os.path.exists(first_image.filepath):
        return send_file(first_image.filepath)
    
    return jsonify({'error': 'No thumbnail available'}), 404

def upload_images(project_id):
    """Upload images or PDFs to a project"""
    project = Project.query.get_or_404(project_id)
    
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    batch_id = str(uuid.uuid4())
    uploaded_images = []
    
    from flask import current_app
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], str(project_id))
    os.makedirs(project_folder, exist_ok=True)
    
    for file in files:
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_ext = filename.rsplit('.', 1)[1].lower()
            
            if file_ext == 'pdf':
                # Extract images from PDF
                pdf_images = extract_images_from_pdf(file, project_folder, batch_id, project_id)
                
                # Create database entries for each extracted PDF page
                for pdf_img in pdf_images:
                    image = Image(
                        filename=pdf_img['filename'],
                        filepath=pdf_img['filepath'],
                        width=pdf_img['width'],
                        height=pdf_img['height'],
                        batch_id=batch_id,
                        project_id=project_id
                    )
                    db.session.add(image)
                
                uploaded_images.extend(pdf_images)
            else:
                # Save image directly
                unique_filename = f"{uuid.uuid4()}_{filename}"
                filepath = os.path.join(project_folder, unique_filename)
                file.save(filepath)
                
                # Get image dimensions
                with PILImage.open(filepath) as img:
                    width, height = img.size
                
                # Create database entry
                image = Image(
                    filename=filename,
                    filepath=filepath,
                    width=width,
                    height=height,
                    batch_id=batch_id,
                    project_id=project_id
                )
                db.session.add(image)
                uploaded_images.append({
                    'filename': filename,
                    'width': width,
                    'height': height
                })
    
    project.updated_at = datetime.utcnow()
    db.session.commit()
    
    # Set first uploaded image as project thumbnail if no thumbnail exists
    if not project.thumbnail_image_id and not project.thumbnail_path:
        first_image = Image.query.filter_by(project_id=project_id).order_by(Image.uploaded_at).first()
        if first_image:
            project.thumbnail_image_id = first_image.id
            db.session.commit()
            print(f"✅ Set project thumbnail to first image (ID: {first_image.id})")
    
    return jsonify({
        'message': f'Uploaded {len(uploaded_images)} images',
        'batch_id': batch_id,
        'images': uploaded_images
    }), 201

def extract_images_from_pdf(pdf_file, output_folder, batch_id, project_id=None):
    """Extract images from PDF using pdfium"""
    pdf_images = []
    MAX_RESOLUTION = 2000  # Maximum resolution on longest side
    
    # Save PDF temporarily
    temp_pdf_path = os.path.join(output_folder, f"temp_{uuid.uuid4()}.pdf")
    pdf_file.save(temp_pdf_path)
    
    try:
        pdf = pdfium.PdfDocument(temp_pdf_path)
        total_pages = len(pdf)
        
        # Emit initial processing status
        if project_id and _socketio_instance:
            _socketio_instance.emit('pdf_processing', {
                'project_id': project_id,
                'status': 'processing',
                'current': 0,
                'total': total_pages,
                'message': f'Processing PDF: 0/{total_pages} pages'
            })
        
        for page_num in range(total_pages):
            page = pdf[page_num]
            bitmap = page.render(scale=2.0)  # 2x scale for better quality
            pil_image = bitmap.to_pil()
            
            # Resize if needed to max resolution of 2000px on longest side
            original_width, original_height = pil_image.size
            max_dimension = max(original_width, original_height)
            
            if max_dimension > MAX_RESOLUTION:
                # Calculate new dimensions maintaining aspect ratio
                scale_factor = MAX_RESOLUTION / max_dimension
                new_width = int(original_width * scale_factor)
                new_height = int(original_height * scale_factor)
                
                # Resize using high-quality Lanczos resampling
                pil_image = pil_image.resize((new_width, new_height), PILImage.Resampling.LANCZOS)
                print(f"📐 Resized page {page_num + 1} from {original_width}x{original_height} to {new_width}x{new_height}")
            
            # Save as JPEG with high quality to reduce file size while maintaining quality
            image_filename = f"pdf_page_{page_num + 1}_{uuid.uuid4()}.jpg"
            image_path = os.path.join(output_folder, image_filename)
            pil_image.save(image_path, 'JPEG', quality=90, optimize=True)
            
            width, height = pil_image.size
            pdf_images.append({
                'filename': f"{os.path.basename(pdf_file.filename)} - Page {page_num + 1}",
                'width': width,
                'height': height,
                'filepath': image_path
            })
            
            # Emit progress update
            if project_id and _socketio_instance:
                _socketio_instance.emit('pdf_processing', {
                    'project_id': project_id,
                    'status': 'processing',
                    'current': page_num + 1,
                    'total': total_pages,
                    'message': f'Processing PDF: {page_num + 1}/{total_pages} pages'
                })
        
        # Emit completion
        if project_id and _socketio_instance:
            _socketio_instance.emit('pdf_processing', {
                'project_id': project_id,
                'status': 'complete',
                'current': total_pages,
                'total': total_pages,
                'message': f'Completed processing {total_pages} pages'
            })
    
    finally:
        # Clean up temp PDF
        try:
            os.remove(temp_pdf_path)
        except:
            pass
    
    return pdf_images

def import_from_roboflow(project_id):
    """Import dataset from Roboflow"""
    project = Project.query.get_or_404(project_id)
    
    data = request.json
    api_key = data.get('api_key')
    workspace = data.get('workspace')
    project_name = data.get('project_name')
    version = data.get('version')
    
    if not all([api_key, workspace, project_name, version]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        from roboflow import Roboflow
        import shutil
        import zipfile
        
        print(f"🔄 Importing from Roboflow: {workspace}/{project_name} v{version}")
        
        # Initialize Roboflow
        rf = Roboflow(api_key=api_key)
        rf_workspace = rf.workspace(workspace)
        rf_project = rf_workspace.project(project_name)
        rf_version = rf_project.version(version)
        
        # Download dataset (it will be saved to a temporary directory)
        from flask import current_app
        temp_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], 'temp_roboflow', str(uuid.uuid4()))
        os.makedirs(temp_dir, exist_ok=True)
        
        print(f"📥 Downloading dataset to {temp_dir}...")
        
        # Roboflow downloads to current directory / specified location
        # Let's use the current working directory approach
        original_cwd = os.getcwd()
        os.chdir(temp_dir)
        
        try:
            dataset = rf_version.download("yolov11")
            dataset_path = dataset.location
            print(f"🔍 Dataset downloaded to: {dataset_path}")
        finally:
            os.chdir(original_cwd)
        
        # Now find all files in temp_dir recursively
        print(f"🔍 Searching for data.yaml in {temp_dir}...")
        data_yaml_path = None
        
        for root, dirs, files in os.walk(temp_dir):
            if 'data.yaml' in files:
                data_yaml_path = os.path.join(root, 'data.yaml')
                dataset_path = root
                print(f"✅ Found data.yaml at: {data_yaml_path}")
                break
        
        if not data_yaml_path:
            raise FileNotFoundError(f"Could not find data.yaml in downloaded dataset. Contents: {os.listdir(temp_dir)}")
        
        batch_id = str(uuid.uuid4())
        project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], str(project_id))
        os.makedirs(project_folder, exist_ok=True)
        
        # Load data.yaml to get class names
        print(f"🔍 Loading data.yaml from: {data_yaml_path}")
        
        import yaml
        with open(data_yaml_path, 'r') as f:
            dataset_config = yaml.safe_load(f)
        
        class_names = dataset_config.get('names', [])
        print(f"📋 Found {len(class_names)} classes: {class_names}")
        
        # Create or map classes
        class_mapping = {}  # Maps YOLO class index to database class ID
        existing_classes = {cls.name: cls for cls in project.classes}
        
        for idx, class_name in enumerate(class_names):
            if class_name in existing_classes:
                class_mapping[idx] = existing_classes[class_name].id
            else:
                # Create new class
                import random
                new_class = Class(
                    name=class_name,
                    color=f"#{random.randint(0, 0xFFFFFF):06x}",
                    project_id=project_id
                )
                db.session.add(new_class)
                db.session.flush()  # Get the ID
                class_mapping[idx] = new_class.id
                print(f"✨ Created new class: {class_name}")
        
        db.session.commit()
        
        # Import images and annotations from all splits
        total_images = 0
        total_annotations = 0
        
        for split in ['train', 'valid', 'test']:
            split_dir = os.path.join(dataset_path, split)
            if not os.path.exists(split_dir):
                continue
            
            images_dir = os.path.join(split_dir, 'images')
            labels_dir = os.path.join(split_dir, 'labels')
            
            if not os.path.exists(images_dir):
                continue
            
            print(f"📂 Processing {split} split...")
            
            for img_filename in os.listdir(images_dir):
                if not img_filename.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                    continue
                
                img_path = os.path.join(images_dir, img_filename)
                
                # Copy image to project folder
                dest_filename = f"{uuid.uuid4()}_{img_filename}"
                dest_path = os.path.join(project_folder, dest_filename)
                shutil.copy2(img_path, dest_path)
                
                # Get image dimensions
                with PILImage.open(dest_path) as img:
                    width, height = img.size
                
                # Create database entry
                image = Image(
                    filename=f"{split}_{img_filename}",
                    filepath=dest_path,
                    width=width,
                    height=height,
                    batch_id=batch_id,
                    project_id=project_id,
                    status='completed'  # Mark as annotated since we're importing annotations
                )
                db.session.add(image)
                db.session.flush()  # Get the ID
                total_images += 1
                
                # Load annotations
                label_filename = os.path.splitext(img_filename)[0] + '.txt'
                label_path = os.path.join(labels_dir, label_filename)
                
                if os.path.exists(label_path):
                    with open(label_path, 'r') as f:
                        for line in f:
                            parts = line.strip().split()
                            if len(parts) >= 5:
                                class_idx = int(parts[0])
                                x_center = float(parts[1])
                                y_center = float(parts[2])
                                box_width = float(parts[3])
                                box_height = float(parts[4])
                                
                                if class_idx in class_mapping:
                                    annotation = Annotation(
                                        image_id=image.id,
                                        class_id=class_mapping[class_idx],
                                        x_center=x_center,
                                        y_center=y_center,
                                        width=box_width,
                                        height=box_height
                                    )
                                    db.session.add(annotation)
                                    total_annotations += 1
        
        # Clean up temp directory
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"⚠️ Failed to clean up temp directory: {e}")
        
        # Update project timestamp
        project.updated_at = datetime.utcnow()
        
        # Set first uploaded image as project thumbnail if no thumbnail exists
        if not project.thumbnail_image_id and not project.thumbnail_path:
            first_image = Image.query.filter_by(project_id=project_id, batch_id=batch_id).order_by(Image.uploaded_at).first()
            if first_image:
                project.thumbnail_image_id = first_image.id
        
        db.session.commit()
        
        print(f"✅ Import complete: {total_images} images, {total_annotations} annotations")
        
        return jsonify({
            'message': f'Successfully imported {total_images} images with {total_annotations} annotations',
            'images_count': total_images,
            'annotations_count': total_annotations,
            'batch_id': batch_id
        })
        
    except Exception as e:
        print(f"❌ Roboflow import failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Import failed: {str(e)}'}), 500

def import_from_huggingface(project_id):
    """Import images from Hugging Face dataset"""
    project = Project.query.get_or_404(project_id)

    data = request.json
    dataset_id = data.get('dataset_id')  # e.g., "beans", "cifar10", "detection-datasets/coco"
    split = data.get('split', 'train')
    image_column = data.get('image_column', 'image')
    sample_size = data.get('sample_size')  # Optional: limit number of images

    if not dataset_id:
        return jsonify({'error': 'Dataset ID is required'}), 400

    try:
        from datasets import load_dataset

        print(f"🤗 Loading dataset: {dataset_id} (split: {split})")

        # Emit initial status
        if _socketio_instance:
            _socketio_instance.emit('hf_import_progress', {
                'project_id': project_id,
                'status': 'loading',
                'message': f'Loading dataset {dataset_id}...'
            })

        # Load dataset with appropriate strategy based on sample_size
        if sample_size:
            # Use streaming for efficient sampling of large datasets
            print(f"📊 Loading dataset with streaming for sampling {sample_size} images")
            dataset = load_dataset(dataset_id, split=split, streaming=True)
            # Shuffle for random sampling (seed for reproducibility if needed)
            shuffle_buffer_size = int(os.environ.get("HF_SHUFFLE_BUFFER_SIZE", 1000))
            dataset = dataset.shuffle(seed=42, buffer_size=shuffle_buffer_size)
            # Take only the required sample
            dataset = dataset.take(sample_size)
        else:
            # Load full dataset
            try:
                # Try loading without streaming for better performance on smaller datasets
                print(f"📊 Loading full dataset without streaming")
                dataset = load_dataset(dataset_id, split=split, streaming=False)
            except Exception as e:
                # If that fails (e.g., dataset too large), fall back to streaming
                print(f"Failed to load dataset normally, trying with streaming: {e}")
                dataset = load_dataset(dataset_id, split=split, streaming=True)

        # Check if the image column exists
        if hasattr(dataset, 'column_names'):
            columns = dataset.column_names
        elif hasattr(dataset, 'features'):
            columns = list(dataset.features.keys())
        else:
            # For streaming datasets, peek at the first example
            first_example = next(iter(dataset))
            columns = list(first_example.keys())

        if image_column not in columns:
            return jsonify({
                'error': f'Column "{image_column}" not found in dataset. Available columns: {columns}'
            }), 400

        # Check if it's an Image column by trying to access the first example
        try:
            # Reuse first_example if already fetched (streaming datasets)
            if 'first_example' not in locals():
                first_example = next(iter(dataset))
            test_image = first_example[image_column]
            # Try to access it as a PIL Image
            if hasattr(test_image, 'save'):
                # It's likely a PIL Image
                pass
            else:
                return jsonify({
                    'error': f'Column "{image_column}" does not appear to contain images'
                }), 400
        except Exception as e:
            return jsonify({
                'error': f'Failed to validate image column: {str(e)}'
            }), 400

        # Prepare for import
        batch_id = str(uuid.uuid4())
        project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], str(project_id))
        os.makedirs(project_folder, exist_ok=True)

        uploaded_images = []
        total_processed = 0

        # Determine total count for progress tracking
        if sample_size:
            # When sampling, we know we'll process exactly sample_size images
            total_to_process = sample_size
        else:
            # For full dataset, try to get the length if available
            total_to_process = len(dataset) if hasattr(dataset, '__len__') else None

        print(f"📊 Processing {total_to_process if total_to_process else 'all'} images from dataset")

        # Process images
        for idx, example in enumerate(dataset):

            try:
                # Get the image from the dataset
                image = example[image_column]

                # Generate unique filename
                safe_dataset_id = re.sub(r'[^a-zA-Z0-9_-]', '_', dataset_id)
                image_filename = f"hf_{safe_dataset_id}_{split}_{idx:06d}.jpg"
                image_path = os.path.join(project_folder, f"{uuid.uuid4()}_{image_filename}")

                # Save the image
                if hasattr(image, 'save'):
                    # It's a PIL Image
                    image.save(image_path, 'JPEG', quality=90, optimize=True)
                else:
                    # Try to convert to PIL Image
                    from PIL import Image as PILImage
                    if isinstance(image, PILImage.Image):
                        image.save(image_path, 'JPEG', quality=90, optimize=True)
                    else:
                        print(f"⚠️ Skipping image {idx}: unsupported format")
                        continue

                # Get image dimensions
                width, height = image.size if hasattr(image, 'size') else (image.width, image.height)

                # Create database entry
                db_image = Image(
                    filename=f"{dataset_id}/{split}_{idx:06d}",
                    filepath=image_path,
                    width=width,
                    height=height,
                    batch_id=batch_id,
                    project_id=project_id,
                    status='unassigned'  # No annotations from HF dataset
                )
                db.session.add(db_image)

                uploaded_images.append({
                    'filename': image_filename,
                    'width': width,
                    'height': height
                })

                total_processed += 1

                # Emit progress update every 10 images
                if total_processed % 10 == 0:
                    if _socketio_instance:
                        progress_msg = f'Imported {total_processed}'
                        if total_to_process:
                            progress_msg += f'/{total_to_process}'
                        progress_msg += ' images'

                        _socketio_instance.emit('hf_import_progress', {
                            'project_id': project_id,
                            'status': 'importing',
                            'current': total_processed,
                            'total': total_to_process,
                            'message': progress_msg
                        })

            except Exception as e:
                print(f"⚠️ Failed to process image {idx}: {e}")
                continue

        # Update project timestamp
        project.updated_at = datetime.utcnow()

        # Set first uploaded image as project thumbnail if no thumbnail exists
        if not project.thumbnail_image_id and not project.thumbnail_path and uploaded_images:
            first_image = Image.query.filter_by(
                project_id=project_id,
                batch_id=batch_id
            ).order_by(Image.uploaded_at).first()
            if first_image:
                project.thumbnail_image_id = first_image.id

        db.session.commit()

        # Emit completion
        if _socketio_instance:
            _socketio_instance.emit('hf_import_progress', {
                'project_id': project_id,
                'status': 'complete',
                'current': total_processed,
                'total': total_processed,
                'message': f'Successfully imported {total_processed} images'
            })

        print(f"✅ Import complete: {total_processed} images from {dataset_id}")

        return jsonify({
            'message': f'Successfully imported {total_processed} images from {dataset_id}',
            'images_count': total_processed,
            'batch_id': batch_id
        })

    except ImportError:
        return jsonify({
            'error': 'Hugging Face datasets library is not installed. Please install it with: pip install datasets'
        }), 500
    except Exception as e:
        print(f"❌ Hugging Face import failed: {e}")
        import traceback
        traceback.print_exc()

        # Emit error
        if _socketio_instance:
            _socketio_instance.emit('hf_import_progress', {
                'project_id': project_id,
                'status': 'error',
                'message': f'Import failed: {str(e)}'
            })

        return jsonify({'error': f'Import failed: {str(e)}'}), 500

def delete_project_images(project_id):
    """Delete multiple images from a project"""
    project = Project.query.get_or_404(project_id)
    data = request.json
    image_ids = data.get('image_ids', [])
    
    if not image_ids:
        return jsonify({'error': 'No images specified'}), 400
    
    deleted_count = 0
    for image_id in image_ids:
        image = Image.query.filter_by(id=image_id, project_id=project_id).first()
        if image:
            # Delete the image file
            try:
                if os.path.exists(image.filepath):
                    os.remove(image.filepath)
            except Exception as e:
                print(f"Failed to delete image file: {e}")
            
            # Delete from database (cascades to annotations)
            db.session.delete(image)
            deleted_count += 1
    
    # Update project timestamp
    project.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': f'Successfully deleted {deleted_count} image(s)',
        'deleted_count': deleted_count
    })

def get_project_images(project_id):
    """Get all images in a project"""
    project = Project.query.get_or_404(project_id)
    
    images = Image.query.filter_by(project_id=project_id).order_by(Image.uploaded_at.desc()).all()
    
    # Group by batch
    batches = {}
    for img in images:
        batch_id = img.batch_id or 'unknown'
        if batch_id not in batches:
            batches[batch_id] = []
        batches[batch_id].append({
            'id': img.id,
            'filename': img.filename,
            'width': img.width,
            'height': img.height,
            'status': img.status,
            'uploaded_at': img.uploaded_at.isoformat(),
            'annotation_count': len(img.annotations)
        })
    
    return jsonify({
        'batches': [
            {
                'batch_id': batch_id,
                'images': imgs,
                'count': len(imgs)
            }
            for batch_id, imgs in batches.items()
        ]
    })

def get_image(image_id):
    """Get image file"""
    image = Image.query.get_or_404(image_id)
    return send_file(image.filepath)

def get_image_annotations(image_id):
    """Get annotations for an image"""
    image = Image.query.get_or_404(image_id)
    
    return jsonify({
        'image_id': image.id,
        'filename': image.filename,
        'width': image.width,
        'height': image.height,
        'status': image.status,
        'annotations': [{
            'id': ann.id,
            'class_id': ann.class_id,
            'class_name': ann.class_obj.name,
            'x_center': ann.x_center,
            'y_center': ann.y_center,
            'width': ann.width,
            'height': ann.height,
            'confidence': ann.confidence,
            'is_predicted': ann.is_predicted
        } for ann in image.annotations]
    })

def save_annotations(image_id):
    """Save annotations for an image"""
    image = Image.query.get_or_404(image_id)
    data = request.json
    
    # Delete existing annotations
    Annotation.query.filter_by(image_id=image_id).delete()
    
    # Add new annotations
    for ann_data in data.get('annotations', []):
        annotation = Annotation(
            image_id=image_id,
            class_id=ann_data['class_id'],
            x_center=ann_data['x_center'],
            y_center=ann_data['y_center'],
            width=ann_data['width'],
            height=ann_data['height']
        )
        db.session.add(annotation)
    
    # Update image status
    image.status = data.get('status', 'completed')
    
    db.session.commit()
    
    return jsonify({'message': 'Annotations saved successfully'})

def get_project_classes(project_id):
    """Get all classes for a project with annotation counts"""
    project = Project.query.get_or_404(project_id)
    
    classes_data = []
    for cls in project.classes:
        # Count annotations for this class
        annotation_count = Annotation.query.filter_by(class_id=cls.id).count()
        
        # Count unique images that have this class
        images_with_class = db.session.query(Annotation.image_id).filter_by(class_id=cls.id).distinct().count()
        
        classes_data.append({
            'id': cls.id,
            'name': cls.name,
            'color': cls.color,
            'annotation_count': annotation_count,
            'image_count': images_with_class
        })
    
    return jsonify(classes_data)

def add_class(project_id):
    """Add a new class to project"""
    project = Project.query.get_or_404(project_id)
    data = request.json
    
    cls = Class(
        name=data['name'],
        color=data.get('color', '#FF0000'),
        project_id=project_id
    )
    db.session.add(cls)
    db.session.commit()
    
    return jsonify({'id': cls.id, 'name': cls.name, 'color': cls.color}), 201

def update_class(project_id, class_id):
    """Update a class (name and/or color)"""
    cls = Class.query.filter_by(id=class_id, project_id=project_id).first_or_404()
    data = request.json
    
    if 'name' in data:
        cls.name = data['name']
    if 'color' in data:
        cls.color = data['color']
    
    db.session.commit()
    
    return jsonify({'id': cls.id, 'name': cls.name, 'color': cls.color})

def delete_class(project_id, class_id):
    """Delete a class and all its annotations"""
    cls = Class.query.filter_by(id=class_id, project_id=project_id).first_or_404()
    
    # Delete all annotations with this class
    Annotation.query.filter_by(class_id=class_id).delete()
    
    db.session.delete(cls)
    db.session.commit()
    
    return jsonify({'message': 'Class deleted successfully'})

def create_dataset_version(project_id):
    """Create a new dataset version with train/val/test split"""
    project = Project.query.get_or_404(project_id)
    data = request.json
    
    # Get all annotated images
    annotated_images = [img for img in project.images if img.annotations]
    
    if len(annotated_images) == 0:
        return jsonify({'error': 'No annotated images available'}), 400
    
    # Get split percentages
    train_split = data.get('train_split', 0.7)
    val_split = data.get('val_split', 0.2)
    test_split = data.get('test_split', 0.1)
    
    # Validate splits
    if abs(train_split + val_split + test_split - 1.0) > 0.01:
        return jsonify({'error': 'Splits must sum to 1.0'}), 400
    
    # Shuffle and split images with optional seed for reproducibility
    import random
    seed = data.get('seed')
    if seed is not None:
        random.seed(seed)
    random.shuffle(annotated_images)
    
    total = len(annotated_images)
    train_count = int(total * train_split)
    val_count = int(total * val_split)
    
    train_images = [img.id for img in annotated_images[:train_count]]
    val_images = [img.id for img in annotated_images[train_count:train_count + val_count]]
    test_images = [img.id for img in annotated_images[train_count + val_count:]]
    
    # Create version
    version = DatasetVersion(
        project_id=project_id,
        name=data.get('name', f'Version {len(project.dataset_versions) + 1}'),
        description=data.get('description', ''),
        train_split=train_split,
        val_split=val_split,
        test_split=test_split,
        seed=seed,
        image_splits=json.dumps({
            'train': train_images,
            'val': val_images,
            'test': test_images
        }),
        total_images=total,
        total_annotations=sum(len(img.annotations) for img in annotated_images)
    )
    
    db.session.add(version)
    db.session.commit()
    
    return jsonify({
        'id': version.id,
        'name': version.name,
        'train_count': len(train_images),
        'val_count': len(val_images),
        'test_count': len(test_images),
        'message': 'Dataset version created successfully'
    }), 201

def get_dataset_versions(project_id):
    """Get all dataset versions for a project"""
    project = Project.query.get_or_404(project_id)
    
    versions = DatasetVersion.query.filter_by(project_id=project_id).order_by(DatasetVersion.created_at.desc()).all()
    
    return jsonify([{
        'id': v.id,
        'name': v.name,
        'description': v.description,
        'train_split': v.train_split,
        'val_split': v.val_split,
        'test_split': v.test_split,
        'seed': v.seed,
        'total_images': v.total_images,
        'total_annotations': v.total_annotations,
        'created_at': v.created_at.isoformat(),
        'train_count': len(json.loads(v.image_splits)['train']),
        'val_count': len(json.loads(v.image_splits)['val']),
        'test_count': len(json.loads(v.image_splits)['test'])
    } for v in versions])

def delete_dataset_version(project_id, version_id):
    """Delete a dataset version"""
    version = DatasetVersion.query.filter_by(id=version_id, project_id=project_id).first_or_404()
    
    # Check if any training jobs use this version
    if version.training_jobs:
        return jsonify({'error': 'Cannot delete version with associated training jobs'}), 400
    
    db.session.delete(version)
    db.session.commit()
    
    return jsonify({'message': 'Dataset version deleted successfully'})

def start_training(project_id):
    """Start YOLO model training"""
    from training import train_yolo_model
    
    project = Project.query.get_or_404(project_id)
    data = request.json
    
    # Create training job
    job = TrainingJob(
        project_id=project_id,
        name=data.get('name', f'Model {len(project.training_jobs) + 1}'),
        model_size=data.get('model_size', 'm'),
        dataset_version_id=data.get('dataset_version_id'),
        epochs=data.get('epochs', 100),
        batch_size=data.get('batch_size', 16),
        image_size=data.get('image_size', 640),
        status='pending'
    )
    db.session.add(job)
    db.session.commit()
    
    # Start training in background thread
    thread = threading.Thread(
        target=train_yolo_model,
        args=(job.id, _socketio_instance)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'job_id': job.id,
        'message': 'Training started'
    }), 201

def get_training_job(job_id):
    """Get training job status"""
    job = TrainingJob.query.get_or_404(job_id)
    
    return jsonify({
        'id': job.id,
        'project_id': job.project_id,
        'status': job.status,
        'epochs': job.epochs,
        'batch_size': job.batch_size,
        'image_size': job.image_size,
        'model_path': job.model_path,
        'metrics': json.loads(job.metrics) if job.metrics else None,
        'test_map50': job.test_map50,
        'test_precision': job.test_precision,
        'test_recall': job.test_recall,
        'class_metrics': json.loads(job.class_metrics) if job.class_metrics else None,
        'started_at': job.started_at.isoformat() if job.started_at else None,
        'completed_at': job.completed_at.isoformat() if job.completed_at else None
    })

def delete_training_job(job_id):
    """Delete or cancel a training job"""
    import shutil
    
    job = TrainingJob.query.get_or_404(job_id)
    
    # If job is currently training or pending, mark it as failed (cancel it)
    if job.status in ['training', 'pending']:
        job.status = 'failed'
        job.error_message = 'Training cancelled by user'
        db.session.commit()
        
        # Emit cancellation event
        if _socketio_instance:
            _socketio_instance.emit('training_error', {
                'job_id': job.id,
                'error': 'Training cancelled by user'
            })
        
        return jsonify({'message': 'Training job cancelled successfully', 'cancelled': True})
    
    # Delete the model files for completed/failed jobs
    if job.model_path:
        try:
            # Delete the entire training run directory
            job_dir = os.path.join('training_runs', str(job.project_id), f'job_{job.id}')
            if os.path.exists(job_dir):
                shutil.rmtree(job_dir)
                print(f"Deleted training directory: {job_dir}")
        except Exception as e:
            print(f"Failed to delete model files: {e}")
    
    db.session.delete(job)
    db.session.commit()
    
    return jsonify({'message': 'Training job deleted successfully', 'cancelled': False})

def stop_training_early(job_id):
    """Request early stopping for a training job"""
    job = TrainingJob.query.get_or_404(job_id)
    
    if job.status != 'training':
        return jsonify({'error': 'Job is not currently training'}), 400
    
    # Set the early stopping flag
    job.stop_early = True
    db.session.commit()
    
    # Emit status update
    if _socketio_instance:
        _socketio_instance.emit('training_update', {
            'job_id': job.id,
            'message': 'Early stopping requested. Will finish current epoch and save model...'
        })
    
    return jsonify({
        'message': 'Early stopping requested',
        'job_id': job.id
    })

def download_model(job_id):
    """Download trained model weights"""
    job = TrainingJob.query.get_or_404(job_id)
    
    if not job.model_path or not os.path.exists(job.model_path):
        return jsonify({'error': 'Model file not found'}), 404
    
    from flask import send_file
    
    # Create a filename for download
    filename = f"{job.name or f'model_{job.id}'}_{job.model_size}.pt"
    
    return send_file(
        job.model_path,
        as_attachment=True,
        download_name=filename
    )

def view_model(project_id, job_id):
    """View model details page"""
    from flask import render_template
    
    project = Project.query.get_or_404(project_id)
    job = TrainingJob.query.get_or_404(job_id)
    
    model_size_labels = {
        'n': 'Nano',
        's': 'Small',
        'm': 'Medium',
        'l': 'Large',
        'x': 'X-Large'
    }
    
    return render_template('model_view.html',
                         project=project,
                         model=job,
                         model_size_label=model_size_labels.get(job.model_size, 'Medium'))

def get_confusion_matrix(job_id):
    """Serve confusion matrix image"""
    from flask import send_file
    
    job = TrainingJob.query.get_or_404(job_id)
    
    if not job.model_path:
        return jsonify({'error': 'Model not found'}), 404
    
    # Get the training run directory
    job_dir = os.path.dirname(os.path.dirname(job.model_path))  # Go up from weights/best.pt
    
    # Look for confusion matrix
    matrix_path = os.path.join(job_dir, 'confusion_matrix.png')
    
    if not os.path.exists(matrix_path):
        return jsonify({'error': 'Confusion matrix not found'}), 404
    
    return send_file(matrix_path, mimetype='image/png')

def get_confusion_matrix_normalized(job_id):
    """Serve normalized confusion matrix image"""
    from flask import send_file
    
    job = TrainingJob.query.get_or_404(job_id)
    
    if not job.model_path:
        return jsonify({'error': 'Model not found'}), 404
    
    # Get the training run directory
    job_dir = os.path.dirname(os.path.dirname(job.model_path))  # Go up from weights/best.pt
    
    # Look for normalized confusion matrix
    matrix_path = os.path.join(job_dir, 'confusion_matrix_normalized.png')
    
    if not os.path.exists(matrix_path):
        return jsonify({'error': 'Normalized confusion matrix not found'}), 404
    
    return send_file(matrix_path, mimetype='image/png')

def evaluate_model_on_test(job_id):
    """Retroactively evaluate a trained model on the test set"""
    job = TrainingJob.query.get_or_404(job_id)
    
    # Check if model exists
    if not job.model_path or not os.path.exists(job.model_path):
        return jsonify({'error': 'Model file not found'}), 404
    
    # Check if already has test metrics
    if job.test_map50 is not None:
        return jsonify({'message': 'Model already has test metrics', 'test_metrics': {
            'map50': job.test_map50,
            'precision': job.test_precision,
            'recall': job.test_recall
        }})
    
    try:
        from ultralytics import YOLO
        
        # Get the dataset path
        job_dir = os.path.dirname(os.path.dirname(job.model_path))
        dataset_path = os.path.join(job_dir, '..', '..', 'datasets', f'project_{job.project_id}')
        
        # Check if dataset still exists
        data_yaml = os.path.join(dataset_path, 'data.yaml')
        if not os.path.exists(data_yaml):
            return jsonify({'error': 'Dataset no longer exists'}), 404
        
        # Load model
        model = YOLO(job.model_path)
        
        # Run validation on test set
        print(f"🔍 Evaluating model {job.id} on test set...")
        test_results = model.val(
            data=data_yaml,
            split='test',
            verbose=False
        )
        
        # Extract and save metrics
        if test_results:
            job.test_map50 = float(test_results.box.map50) if hasattr(test_results.box, 'map50') else 0.0
            job.test_precision = float(test_results.box.mp) if hasattr(test_results.box, 'mp') else 0.0
            job.test_recall = float(test_results.box.mr) if hasattr(test_results.box, 'mr') else 0.0
            
            # Extract per-class metrics
            class_metrics = []
            if hasattr(test_results.box, 'maps') and hasattr(test_results.box, 'p') and hasattr(test_results.box, 'r'):
                maps = test_results.box.maps  # Per-class mAP@50
                precisions = test_results.box.p  # Per-class precision
                recalls = test_results.box.r  # Per-class recall
                
                # Get class names from project
                project = job.project
                ordered_classes = sorted(project.classes, key=lambda c: c.id)
                
                for idx, cls in enumerate(ordered_classes):
                    if idx < len(maps):
                        class_metrics.append({
                            'class': cls.name,
                            'map50': float(maps[idx]) if idx < len(maps) else 0.0,
                            'precision': float(precisions[idx]) if idx < len(precisions) else 0.0,
                            'recall': float(recalls[idx]) if idx < len(recalls) else 0.0
                        })
                
                job.class_metrics = json.dumps(class_metrics)
                print(f"✅ Saved per-class metrics for {len(class_metrics)} classes")
            
            db.session.commit()
            
            print(f"✅ Test Metrics saved for job {job.id}:")
            print(f"   mAP@50: {job.test_map50:.1%}")
            print(f"   Precision: {job.test_precision:.1%}")
            print(f"   Recall: {job.test_recall:.1%}")
            
            return jsonify({
                'message': 'Model evaluated successfully',
                'test_metrics': {
                    'map50': job.test_map50,
                    'precision': job.test_precision,
                    'recall': job.test_recall
                },
                'class_metrics': class_metrics
            })
        else:
            return jsonify({'error': 'Evaluation failed - no results returned'}), 500
            
    except Exception as e:
        print(f"❌ Evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Evaluation failed: {str(e)}'}), 500

def predict_on_upload(job_id):
    """Run model prediction on an uploaded image file (for testing)"""
    job = TrainingJob.query.get_or_404(job_id)
    
    if not job.model_path or not os.path.exists(job.model_path):
        return jsonify({'error': 'Model not found'}), 404
    
    # Get uploaded file
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        from ultralytics import YOLO
        from PIL import Image as PILImage
        import io
        
        # Read image from upload
        img_bytes = file.read()
        img = PILImage.open(io.BytesIO(img_bytes))
        
        # Get image dimensions
        img_width, img_height = img.size
        
        # Get confidence threshold
        confidence = float(request.form.get('confidence', 0.5))
        
        # Load model and predict
        model = YOLO(job.model_path)
        
        # Save temporary file for prediction
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tmp:
            img.save(tmp.name)
            tmp_path = tmp.name
        
        try:
            results = model.predict(tmp_path, conf=confidence, verbose=False)
            
            predictions = []
            if len(results) > 0:
                result = results[0]
                boxes = result.boxes
                
                # Get project to map classes
                project = Project.query.get(job.project_id)
                
                for box in boxes:
                    # Convert to normalized coordinates
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    x_center = ((x1 + x2) / 2) / img_width
                    y_center = ((y1 + y2) / 2) / img_height
                    width = (x2 - x1) / img_width
                    height = (y2 - y1) / img_height
                    
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    
                    # Map model class to project class
                    if cls_id < len(project.classes):
                        predictions.append({
                            'class_id': project.classes[cls_id].id,
                            'class_name': project.classes[cls_id].name,
                            'x_center': x_center,
                            'y_center': y_center,
                            'width': width,
                            'height': height,
                            'confidence': conf
                        })
            
            return jsonify({
                'predictions': predictions,
                'image_width': img_width,
                'image_height': img_height
            })
            
        finally:
            # Clean up temp file
            os.unlink(tmp_path)
            
    except Exception as e:
        print(f"Prediction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

def predict_annotations(project_id):
    """Use trained model to predict annotations (Label Assist)"""
    project = Project.query.get_or_404(project_id)
    data = request.json
    image_id = data.get('image_id')
    model_path = data.get('model_path')
    
    # Use provided model path or get the latest successful training job
    if not model_path:
        job = TrainingJob.query.filter_by(
            project_id=project_id,
            status='completed'
        ).order_by(TrainingJob.completed_at.desc()).first()
        
        if not job or not job.model_path:
            return jsonify({'error': 'No trained model available'}), 400
        
        model_path = job.model_path
    
    # Verify model path exists
    if not os.path.exists(model_path):
        return jsonify({'error': f'Model file not found: {model_path}'}), 404
    
    image = Image.query.get_or_404(image_id)
    
    # Load model and predict
    from ultralytics import YOLO
    try:
        model = YOLO(model_path)
        results = model.predict(image.filepath, conf=data.get('confidence', 0.5), verbose=False)
        
        predictions = []
        if len(results) > 0:
            result = results[0]
            boxes = result.boxes
            
            print(f"🔍 Predict - Model detected {len(boxes)} boxes for image {image.id}")
            print(f"🔍 Predict - Model path: {model_path}")
            print(f"🔍 Predict - Confidence threshold: {data.get('confidence', 0.5)}")
            
            for box in boxes:
                # Convert to normalized coordinates
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                x_center = ((x1 + x2) / 2) / image.width
                y_center = ((y1 + y2) / 2) / image.height
                width = (x2 - x1) / image.width
                height = (y2 - y1) / image.height
                
                cls_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                # Get class mapping if provided
                class_mapping = data.get('class_mapping', {})
                
                # Get ordered list of project classes (by ID for consistency)
                ordered_classes = sorted(project.classes, key=lambda c: c.id)
                
                print(f"🔍 Box: cls_id={cls_id}, conf={confidence}, class_mapping={class_mapping}, num_project_classes={len(ordered_classes)}")
                
                # Map model class to project class
                if class_mapping and str(cls_id) in class_mapping:
                    # Use explicit mapping
                    mapped_class_id = int(class_mapping[str(cls_id)])
                    mapped_class = next((c for c in project.classes if c.id == mapped_class_id), None)
                    if mapped_class:
                        predictions.append({
                            'class_id': mapped_class.id,
                            'class_name': mapped_class.name,
                            'x_center': x_center,
                            'y_center': y_center,
                            'width': width,
                            'height': height,
                            'confidence': confidence
                        })
                elif cls_id < len(ordered_classes):
                    # Assume model classes are in same order as project classes
                    mapped_class = ordered_classes[cls_id]
                    predictions.append({
                        'class_id': mapped_class.id,
                        'class_name': mapped_class.name,
                        'x_center': x_center,
                        'y_center': y_center,
                        'width': width,
                        'height': height,
                        'confidence': confidence
                    })
                    print(f"✅ Added prediction: {mapped_class.name}")
                else:
                    print(f"⚠️ Skipping box: cls_id {cls_id} >= num_classes {len(ordered_classes)}")
        
        print(f"🔍 Returning {len(predictions)} predictions")
        return jsonify({'predictions': predictions})
        
    except Exception as e:
        print(f"Prediction error: {e}")
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500

def get_model_classes(job_id):
    """Get class names from a trained model"""
    job = TrainingJob.query.get_or_404(job_id)
    
    if not job.model_path or not os.path.exists(job.model_path):
        return jsonify({'error': 'Model not found'}), 404
    
    try:
        from ultralytics import YOLO
        
        # Load the model to get its class names
        model = YOLO(job.model_path)
        
        # Get class names from the model
        if hasattr(model, 'names') and model.names:
            # Sort by key to ensure correct order (YOLO uses 0-indexed class IDs)
            classes = [{'id': i, 'name': name} for i, name in sorted(model.names.items())]
            return jsonify({'classes': classes})
        else:
            # Fallback: get classes from the project (sorted by ID for consistency)
            project = Project.query.get(job.project_id)
            ordered_classes = sorted(project.classes, key=lambda c: c.id)
            classes = [{'id': i, 'name': cls.name} for i, cls in enumerate(ordered_classes)]
            return jsonify({'classes': classes})
            
    except Exception as e:
        print(f"Error loading model classes: {e}")
        return jsonify({'error': str(e)}), 500

def get_custom_model_classes(project_id, model_id):
    """Get class names from a custom uploaded model"""
    custom_model = CustomModel.query.get_or_404(model_id)
    
    if not custom_model.file_path or not os.path.exists(custom_model.file_path):
        return jsonify({'error': 'Model not found'}), 404
    
    try:
        from ultralytics import YOLO
        
        # Load the model to get its class names
        model = YOLO(custom_model.file_path)
        
        # Get class names from the model
        if hasattr(model, 'names') and model.names:
            # Sort by key to ensure correct order (YOLO uses 0-indexed class IDs)
            classes = [{'id': i, 'name': name} for i, name in sorted(model.names.items())]
            return jsonify({'classes': classes})
        else:
            return jsonify({'error': 'Could not extract classes from model'}), 500
            
    except Exception as e:
        print(f"Error loading custom model classes: {e}")
        return jsonify({'error': str(e)}), 500

def get_external_models(project_id):
    """Get list of external models available in output_models folder"""
    project = Project.query.get_or_404(project_id)
    
    external_models_path = 'output_models'
    models = []
    
    if os.path.exists(external_models_path):
        for model_dir in os.listdir(external_models_path):
            model_path = os.path.join(external_models_path, model_dir)
            if os.path.isdir(model_path):
                # Look for .pt files in this directory
                pt_files = []
                for root, dirs, files in os.walk(model_path):
                    for file in files:
                        if file.endswith('.pt'):
                            full_path = os.path.join(root, file)
                            
                            # Try to get model classes
                            model_classes = []
                            try:
                                from ultralytics import YOLO
                                model = YOLO(full_path)
                                if hasattr(model, 'names') and model.names:
                                    model_classes = [{'id': k, 'name': v} for k, v in model.names.items()]
                            except:
                                pass
                            
                            pt_files.append({
                                'name': file,
                                'path': full_path,
                                'rel_path': os.path.relpath(full_path, external_models_path),
                                'classes': model_classes
                            })
                
                if pt_files:
                    models.append({
                        'model_dir': model_dir,
                        'models': pt_files
                    })
    
    return jsonify({'models': models})

def upload_custom_model(project_id):
    """Upload a custom model file"""
    project = Project.query.get_or_404(project_id)
    
    if 'model_file' not in request.files:
        return jsonify({'error': 'No model file provided'}), 400
    
    file = request.files['model_file']
    name = request.form.get('name')
    description = request.form.get('description', '')
    
    if not name:
        return jsonify({'error': 'Model name is required'}), 400
    
    if not file.filename.endswith('.pt'):
        return jsonify({'error': 'Only .pt files are supported'}), 400
    
    # Create custom_models directory
    models_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'custom_models' / str(project_id)
    models_dir.mkdir(parents=True, exist_ok=True)
    
    # Save file
    filename = secure_filename(file.filename)
    filepath = models_dir / filename
    file.save(filepath)
    
    # Get file size
    file_size_bytes = filepath.stat().st_size
    if file_size_bytes < 1024:
        file_size = f"{file_size_bytes} B"
    elif file_size_bytes < 1024 * 1024:
        file_size = f"{file_size_bytes / 1024:.1f} KB"
    elif file_size_bytes < 1024 * 1024 * 1024:
        file_size = f"{file_size_bytes / (1024 * 1024):.1f} MB"
    else:
        file_size = f"{file_size_bytes / (1024 * 1024 * 1024):.2f} GB"
    
    # Create database entry
    custom_model = CustomModel(
        project_id=project_id,
        name=name,
        description=description,
        file_path=str(filepath),
        file_size=file_size
    )
    
    db.session.add(custom_model)
    db.session.commit()
    
    return jsonify({
        'id': custom_model.id,
        'message': 'Model uploaded successfully'
    }), 201

def delete_custom_model(project_id, model_id):
    """Delete a custom model"""
    model = CustomModel.query.filter_by(id=model_id, project_id=project_id).first_or_404()
    
    # Delete file
    try:
        filepath = Path(model.file_path)
        if filepath.exists():
            filepath.unlink()
    except Exception as e:
        print(f"Failed to delete model file: {e}")
    
    db.session.delete(model)
    db.session.commit()
    
    return jsonify({'message': 'Custom model deleted successfully'})

def use_external_model(project_id):
    """Use an external model for predictions with class mapping"""
    project = Project.query.get_or_404(project_id)
    data = request.json
    
    model_path = data.get('model_path')
    image_id = data.get('image_id')
    confidence = data.get('confidence', 0.5)
    class_mapping = data.get('class_mapping', {})  # Maps model class ID to project class ID
    
    if not model_path or not os.path.exists(model_path):
        return jsonify({'error': 'Model not found'}), 404
    
    image = Image.query.get_or_404(image_id)
    
    try:
        # Load external model and predict
        from ultralytics import YOLO
        model = YOLO(model_path)
        
        results = model.predict(image.filepath, conf=confidence)
        
        predictions = []
        if len(results) > 0:
            result = results[0]
            boxes = result.boxes
            
            for box in boxes:
                # Convert to normalized coordinates
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                x_center = ((x1 + x2) / 2) / image.width
                y_center = ((y1 + y2) / 2) / image.height
                width = (x2 - x1) / image.width
                height = (y2 - y1) / image.height
                
                model_cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                
                # Use class mapping if provided, otherwise use default mapping
                if class_mapping and str(model_cls_id) in class_mapping:
                    class_id = class_mapping[str(model_cls_id)]
                elif model_cls_id < len(project.classes):
                    class_id = project.classes[model_cls_id].id
                else:
                    class_id = project.classes[0].id if project.classes else None
                
                if class_id:
                    predictions.append({
                        'class_id': class_id,
                        'x_center': x_center,
                        'y_center': y_center,
                        'width': width,
                        'height': height,
                        'confidence': conf
                    })
        
        return jsonify({'predictions': predictions})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


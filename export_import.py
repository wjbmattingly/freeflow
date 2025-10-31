"""
Export and Import functionality for FreeFlow projects
Exports projects with all associated data, models, and files as zip archives
"""

import os
import json
import shutil
import tempfile
from pathlib import Path
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED
from flask import current_app
from database import db
from models import Project, Class, Image, Annotation, DatasetVersion, TrainingJob, CustomModel


def serialize_model(model):
    """Convert SQLAlchemy model to dictionary, excluding relationships"""
    data = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        # Convert datetime to ISO format string
        if isinstance(value, datetime):
            value = value.isoformat()
        data[column.name] = value
    return data


def export_projects(project_ids):
    """
    Export one or more projects to a zip file
    
    Args:
        project_ids: List of project IDs to export
        
    Returns:
        Path to the created zip file
    """
    # Create temporary directory for export
    temp_dir = tempfile.mkdtemp(prefix='freeflow_export_')
    export_data = {
        'version': '1.0',
        'export_date': datetime.utcnow().isoformat(),
        'projects': []
    }
    
    try:
        # Create files directory in temp
        files_dir = Path(temp_dir) / 'files'
        files_dir.mkdir(exist_ok=True)
        
        for project_id in project_ids:
            project = Project.query.get(project_id)
            if not project:
                continue
                
            project_data = {
                'project': serialize_model(project),
                'classes': [],
                'images': [],
                'annotations': [],
                'dataset_versions': [],
                'training_jobs': [],
                'custom_models': [],
                'files': {
                    'images': [],
                    'thumbnails': [],
                    'datasets': [],
                    'training_runs': [],
                    'custom_models': []
                }
            }
            
            # Export classes
            for cls in project.classes:
                project_data['classes'].append(serialize_model(cls))
            
            # Export images and their annotations
            for img in project.images:
                project_data['images'].append(serialize_model(img))
                
                # Copy image file
                if os.path.exists(img.filepath):
                    rel_path = f'project_{project_id}/images/{os.path.basename(img.filepath)}'
                    dest_path = files_dir / rel_path
                    dest_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(img.filepath, dest_path)
                    project_data['files']['images'].append(rel_path)
                
                # Export annotations for this image
                for ann in img.annotations:
                    project_data['annotations'].append(serialize_model(ann))
            
            # Copy thumbnail if exists
            if project.thumbnail_path and os.path.exists(project.thumbnail_path):
                rel_path = f'project_{project_id}/thumbnail/{os.path.basename(project.thumbnail_path)}'
                dest_path = files_dir / rel_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(project.thumbnail_path, dest_path)
                project_data['files']['thumbnails'].append(rel_path)
            
            # Export dataset versions
            for ds in project.dataset_versions:
                project_data['dataset_versions'].append(serialize_model(ds))
                
                # Copy dataset files if they exist
                dataset_dir = Path('datasets') / str(project_id) / f'job_{ds.id}'
                if dataset_dir.exists():
                    rel_path = f'project_{project_id}/datasets/job_{ds.id}'
                    dest_path = files_dir / rel_path
                    if dataset_dir.exists():
                        shutil.copytree(dataset_dir, dest_path, dirs_exist_ok=True)
                        project_data['files']['datasets'].append(rel_path)
            
            # Export training jobs
            for job in project.training_jobs:
                project_data['training_jobs'].append(serialize_model(job))
                
                # Copy training run files
                training_dir = Path('training_runs') / str(project_id) / f'job_{job.id}'
                if training_dir.exists():
                    rel_path = f'project_{project_id}/training_runs/job_{job.id}'
                    dest_path = files_dir / rel_path
                    shutil.copytree(training_dir, dest_path, dirs_exist_ok=True)
                    project_data['files']['training_runs'].append(rel_path)
            
            # Export custom models
            for model in project.custom_models:
                project_data['custom_models'].append(serialize_model(model))
                
                # Copy model file
                if os.path.exists(model.file_path):
                    rel_path = f'project_{project_id}/custom_models/{os.path.basename(model.file_path)}'
                    dest_path = files_dir / rel_path
                    dest_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(model.file_path, dest_path)
                    project_data['files']['custom_models'].append(rel_path)
            
            export_data['projects'].append(project_data)
        
        # Write manifest
        manifest_path = Path(temp_dir) / 'manifest.json'
        with open(manifest_path, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        # Create zip file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        if len(project_ids) == 1:
            project_name = Project.query.get(project_ids[0]).name.replace(' ', '_')
            zip_filename = f'freeflow_export_{project_name}_{timestamp}.zip'
        else:
            zip_filename = f'freeflow_export_{len(project_ids)}_projects_{timestamp}.zip'
        
        zip_path = Path(tempfile.gettempdir()) / zip_filename
        
        with ZipFile(zip_path, 'w', ZIP_DEFLATED) as zipf:
            # Add manifest
            zipf.write(manifest_path, 'manifest.json')
            
            # Add all files
            for root, dirs, files in os.walk(files_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = Path('files') / file_path.relative_to(files_dir)
                    zipf.write(file_path, arcname)
        
        return str(zip_path)
        
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)


def import_projects(zip_path, merge_strategy='rename'):
    """
    Import projects from a zip file
    
    Args:
        zip_path: Path to the zip file to import
        merge_strategy: How to handle ID conflicts
                       'rename' - Create new IDs and rename projects
                       'replace' - Replace existing projects with same ID (dangerous)
                       
    Returns:
        Dictionary with import results
    """
    temp_dir = tempfile.mkdtemp(prefix='freeflow_import_')
    results = {
        'success': False,
        'projects_imported': [],
        'errors': []
    }
    
    try:
        # Extract zip
        with ZipFile(zip_path, 'r') as zipf:
            zipf.extractall(temp_dir)
        
        # Read manifest
        manifest_path = Path(temp_dir) / 'manifest.json'
        if not manifest_path.exists():
            results['errors'].append('Invalid export file: manifest.json not found')
            return results
        
        with open(manifest_path, 'r') as f:
            export_data = json.load(f)
        
        files_dir = Path(temp_dir) / 'files'
        upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
        
        # ID mappings for foreign key updates
        id_mappings = {
            'projects': {},
            'classes': {},
            'images': {},
            'dataset_versions': {},
            'training_jobs': {},
            'custom_models': {}
        }
        
        for project_data in export_data['projects']:
            old_project_id = project_data['project']['id']
            
            # Check if project already exists
            existing_project = Project.query.get(old_project_id)
            
            if merge_strategy == 'rename' or existing_project:
                # Create new project with renamed title
                project_dict = project_data['project'].copy()
                old_name = project_dict['name']
                project_dict['name'] = f"{old_name} (Imported {datetime.now().strftime('%Y-%m-%d %H:%M')})"
                del project_dict['id']  # Let DB auto-assign new ID
                
                # Clear thumbnail references for now
                project_dict['thumbnail_image_id'] = None
                project_dict['thumbnail_path'] = None
                
                # Convert datetime strings back to datetime objects
                if 'created_at' in project_dict:
                    project_dict['created_at'] = datetime.fromisoformat(project_dict['created_at'])
                if 'updated_at' in project_dict:
                    project_dict['updated_at'] = datetime.fromisoformat(project_dict['updated_at'])
                
                new_project = Project(**project_dict)
                db.session.add(new_project)
                db.session.flush()  # Get new ID
                
                new_project_id = new_project.id
                id_mappings['projects'][old_project_id] = new_project_id
            else:
                # This shouldn't happen with 'rename' strategy
                new_project_id = old_project_id
                id_mappings['projects'][old_project_id] = new_project_id
            
            # Import classes
            for cls_data in project_data['classes']:
                old_class_id = cls_data['id']
                cls_dict = cls_data.copy()
                del cls_dict['id']
                cls_dict['project_id'] = new_project_id
                
                new_class = Class(**cls_dict)
                db.session.add(new_class)
                db.session.flush()
                id_mappings['classes'][old_class_id] = new_class.id
            
            # Import images
            for img_data in project_data['images']:
                old_image_id = img_data['id']
                img_dict = img_data.copy()
                del img_dict['id']
                img_dict['project_id'] = new_project_id
                
                # Update file path
                old_filepath = img_dict['filepath']
                new_filepath = upload_folder / str(new_project_id) / os.path.basename(old_filepath)
                new_filepath.parent.mkdir(parents=True, exist_ok=True)
                
                # Copy image file
                old_rel_path = f'project_{old_project_id}/images/{os.path.basename(old_filepath)}'
                source_path = files_dir / old_rel_path
                if source_path.exists():
                    shutil.copy2(source_path, new_filepath)
                
                img_dict['filepath'] = str(new_filepath)
                
                # Convert datetime
                if 'uploaded_at' in img_dict:
                    img_dict['uploaded_at'] = datetime.fromisoformat(img_dict['uploaded_at'])
                
                new_image = Image(**img_dict)
                db.session.add(new_image)
                db.session.flush()
                id_mappings['images'][old_image_id] = new_image.id
            
            # Import annotations
            for ann_data in project_data['annotations']:
                ann_dict = ann_data.copy()
                del ann_dict['id']
                ann_dict['image_id'] = id_mappings['images'][ann_dict['image_id']]
                ann_dict['class_id'] = id_mappings['classes'][ann_dict['class_id']]
                
                # Convert datetime
                if 'created_at' in ann_dict:
                    ann_dict['created_at'] = datetime.fromisoformat(ann_dict['created_at'])
                
                new_annotation = Annotation(**ann_dict)
                db.session.add(new_annotation)
            
            # Import dataset versions
            for ds_data in project_data['dataset_versions']:
                old_ds_id = ds_data['id']
                ds_dict = ds_data.copy()
                del ds_dict['id']
                ds_dict['project_id'] = new_project_id
                
                # Update image IDs in splits
                if 'image_splits' in ds_dict:
                    splits = json.loads(ds_dict['image_splits'])
                    for split_type in ['train', 'val', 'test']:
                        if split_type in splits:
                            splits[split_type] = [
                                id_mappings['images'].get(img_id, img_id) 
                                for img_id in splits[split_type]
                                if img_id in id_mappings['images']
                            ]
                    ds_dict['image_splits'] = json.dumps(splits)
                
                # Convert datetime
                if 'created_at' in ds_dict:
                    ds_dict['created_at'] = datetime.fromisoformat(ds_dict['created_at'])
                
                new_ds = DatasetVersion(**ds_dict)
                db.session.add(new_ds)
                db.session.flush()
                id_mappings['dataset_versions'][old_ds_id] = new_ds.id
                
                # Copy dataset files
                old_dataset_path = files_dir / f'project_{old_project_id}/datasets/job_{old_ds_id}'
                if old_dataset_path.exists():
                    new_dataset_path = Path('datasets') / str(new_project_id) / f'job_{new_ds.id}'
                    new_dataset_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(old_dataset_path, new_dataset_path, dirs_exist_ok=True)
            
            # Import training jobs
            for job_data in project_data['training_jobs']:
                old_job_id = job_data['id']
                job_dict = job_data.copy()
                del job_dict['id']
                job_dict['project_id'] = new_project_id
                
                # Update dataset version ID
                if job_dict.get('dataset_version_id'):
                    old_ds_id = job_dict['dataset_version_id']
                    if old_ds_id in id_mappings['dataset_versions']:
                        job_dict['dataset_version_id'] = id_mappings['dataset_versions'][old_ds_id]
                
                # Update model path
                if job_dict.get('model_path'):
                    old_model_path = Path(job_dict['model_path'])
                    new_model_path = Path('training_runs') / str(new_project_id) / f'job_{old_job_id}' / old_model_path.name
                    job_dict['model_path'] = str(new_model_path)
                
                # Convert datetimes
                for field in ['started_at', 'completed_at', 'created_at']:
                    if job_dict.get(field):
                        job_dict[field] = datetime.fromisoformat(job_dict[field])
                
                new_job = TrainingJob(**job_dict)
                db.session.add(new_job)
                db.session.flush()
                id_mappings['training_jobs'][old_job_id] = new_job.id
                
                # Copy training run files
                old_training_path = files_dir / f'project_{old_project_id}/training_runs/job_{old_job_id}'
                if old_training_path.exists():
                    new_training_path = Path('training_runs') / str(new_project_id) / f'job_{new_job.id}'
                    new_training_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(old_training_path, new_training_path, dirs_exist_ok=True)
                    
                    # Update model path to new location
                    if new_job.model_path:
                        new_model_path = new_training_path / 'weights' / 'best.pt'
                        if new_model_path.exists():
                            new_job.model_path = str(new_model_path)
            
            # Import custom models
            for model_data in project_data['custom_models']:
                old_model_id = model_data['id']
                model_dict = model_data.copy()
                del model_dict['id']
                model_dict['project_id'] = new_project_id
                
                # Copy model file
                old_filepath = model_dict['file_path']
                new_model_dir = upload_folder / 'custom_models' / str(new_project_id)
                new_model_dir.mkdir(parents=True, exist_ok=True)
                new_filepath = new_model_dir / os.path.basename(old_filepath)
                
                old_rel_path = f'project_{old_project_id}/custom_models/{os.path.basename(old_filepath)}'
                source_path = files_dir / old_rel_path
                if source_path.exists():
                    shutil.copy2(source_path, new_filepath)
                
                model_dict['file_path'] = str(new_filepath)
                
                # Convert datetime
                if 'created_at' in model_dict:
                    model_dict['created_at'] = datetime.fromisoformat(model_dict['created_at'])
                
                new_model = CustomModel(**model_dict)
                db.session.add(new_model)
                db.session.flush()
                id_mappings['custom_models'][old_model_id] = new_model.id
            
            # Copy thumbnail if exists
            thumbnail_files = [f for f in (files_dir / f'project_{old_project_id}' / 'thumbnail').glob('*') if (files_dir / f'project_{old_project_id}' / 'thumbnail').exists()]
            if thumbnail_files:
                thumbnail_file = thumbnail_files[0]
                new_thumbnail_dir = upload_folder / str(new_project_id)
                new_thumbnail_dir.mkdir(parents=True, exist_ok=True)
                new_thumbnail_path = new_thumbnail_dir / f'thumbnail{thumbnail_file.suffix}'
                shutil.copy2(thumbnail_file, new_thumbnail_path)
                new_project.thumbnail_path = str(new_thumbnail_path)
            
            results['projects_imported'].append({
                'old_id': old_project_id,
                'new_id': new_project_id,
                'name': new_project.name
            })
        
        # Commit all changes
        db.session.commit()
        results['success'] = True
        
    except Exception as e:
        db.session.rollback()
        results['errors'].append(f'Import failed: {str(e)}')
        import traceback
        results['errors'].append(traceback.format_exc())
    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    return results


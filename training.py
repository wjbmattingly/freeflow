from flask import current_app
from database import db
from models import Project, Image, Annotation, Class, DatasetVersion, TrainingJob
import os
import yaml
import shutil
from datetime import datetime
import json
from pathlib import Path

def train_yolo_model(job_id, socketio):
    """Train YOLO model on annotated data"""
    print(f"\n{'='*60}")
    print(f"🚀 STARTING TRAINING FOR JOB #{job_id}")
    print(f"{'='*60}\n")
    
    from app import app
    
    with app.app_context():
        job = TrainingJob.query.get(job_id)
        if not job:
            print(f"❌ Job #{job_id} not found!")
            return
        
        print(f"✅ Job found: #{job.id}")
        print(f"   Name: {job.name}")
        print(f"   Project: {job.project.name}")
        print(f"   Dataset Version ID: {job.dataset_version_id}")
        print(f"   Epochs: {job.epochs}")
        print(f"   Batch: {job.batch_size}")
        print(f"   Image Size: {job.image_size}")
        print(f"   Model Size: {job.model_size}")
        
        project = job.project
        
        try:
            job.status = 'training'
            job.started_at = datetime.utcnow()
            db.session.commit()
            print(f"✅ Job status updated to 'training'")
            
            socketio.emit('training_update', {
                'job_id': job.id,
                'status': 'training',
                'message': 'Preparing dataset...'
            })
            
            # Prepare dataset
            print(f"📦 Preparing dataset...")
            dataset_path = prepare_yolo_dataset(project, job)
            print(f"✅ Dataset prepared at: {dataset_path}")
            
            socketio.emit('training_update', {
                'job_id': job.id,
                'status': 'training',
                'message': 'Starting training...'
            })
            
            # Train model
            from ultralytics import YOLO
            
            # Load model based on size selection
            model_size = job.model_size or 'n'
            model_file = f'yolo11{model_size}.pt'
            print(f"🤖 Loading YOLO11-{model_size.upper()} model ({model_file})...")
            model = YOLO(model_file)
            print(f"✅ Model loaded")
            
            # Add callback for real-time progress
            def on_train_epoch_end(trainer):
                """Callback function to emit progress after each epoch"""
                try:
                    epoch = trainer.epoch + 1
                    
                    # Check for early stopping request
                    with app.app_context():
                        from models import TrainingJob
                        current_job = TrainingJob.query.get(job.id)
                        if current_job and current_job.stop_early:
                            print(f"🛑 Early stopping requested at epoch {epoch}")
                            socketio.emit('training_update', {
                                'job_id': job.id,
                                'message': f'Early stopping after epoch {epoch}. Saving model...'
                            })
                            trainer.stop = True  # Signal YOLO to stop training
                            return
                    
                    # Debug: print available metrics
                    if epoch == 1:
                        print(f"🔍 Available metrics: {list(trainer.metrics.keys())}")
                    
                    # Try to get loss components from the validator results
                    # YOLO stores losses in trainer.loss_items or trainer.tloss
                    train_box_loss = 0
                    train_cls_loss = 0
                    train_dfl_loss = 0
                    
                    # Try to extract from loss_items (numpy array: [box, cls, dfl])
                    if hasattr(trainer, 'loss_items') and trainer.loss_items is not None:
                        loss_items = trainer.loss_items
                        if len(loss_items) >= 3:
                            train_box_loss = float(loss_items[0])
                            train_cls_loss = float(loss_items[1])
                            train_dfl_loss = float(loss_items[2])
                    
                    # Extract validation metrics from trainer.metrics
                    metrics = trainer.metrics
                    val_box_loss = float(metrics.get('val/box_loss', 0))
                    val_cls_loss = float(metrics.get('val/cls_loss', 0))
                    val_dfl_loss = float(metrics.get('val/dfl_loss', 0))
                    
                    map50 = float(metrics.get('metrics/mAP50(B)', 0))
                    precision = float(metrics.get('metrics/precision(B)', 0))
                    recall = float(metrics.get('metrics/recall(B)', 0))
                    lr = float(trainer.optimizer.param_groups[0]['lr'])
                    
                    print(f"📊 Epoch {epoch}/{job.epochs}: Box={train_box_loss:.4f}, Cls={train_cls_loss:.4f}, DFL={train_dfl_loss:.4f}, mAP={map50:.4f}")
                    
                    socketio.emit('training_progress', {
                        'job_id': job.id,
                        'epoch': epoch,
                        'total_epochs': job.epochs,
                        'train_box_loss': train_box_loss,
                        'train_cls_loss': train_cls_loss,
                        'train_dfl_loss': train_dfl_loss,
                        'val_box_loss': val_box_loss,
                        'val_cls_loss': val_cls_loss,
                        'val_dfl_loss': val_dfl_loss,
                        'map50': map50,
                        'precision': precision,
                        'recall': recall,
                        'lr': lr
                    })
                except Exception as e:
                    print(f"Error in progress callback: {e}")
                    import traceback
                    traceback.print_exc()
            
            # Add callbacks
            model.add_callback('on_train_epoch_end', on_train_epoch_end)
            print(f"✅ Callback registered")
            
            print(f"\n🏋️ STARTING TRAINING...")
            print(f"   Epochs: {job.epochs}")
            print(f"   Batch size: {job.batch_size}")
            print(f"   Image size: {job.image_size}")
            print()
            
            results = model.train(
                data=os.path.join(dataset_path, 'data.yaml'),
                epochs=job.epochs,
                batch=job.batch_size,
                imgsz=job.image_size,
                project=os.path.join('training_runs', str(project.id)),
                name=f'job_{job.id}',
                exist_ok=True,
                verbose=True
            )
            
            # Save metrics
            metrics_data = {
                'epochs': [],
                'train_loss': [],
                'val_loss': [],
                'map50': [],
                'map50_95': [],
                'precision': [],
                'recall': [],
                'lr': []
            }
            
            # Read metrics from results
            if results.results_dict:
                metrics_path = os.path.join(
                    'training_runs', str(project.id), f'job_{job.id}', 'results.csv'
                )
                if os.path.exists(metrics_path):
                    import pandas as pd
                    df = pd.read_csv(metrics_path)
                    df.columns = df.columns.str.strip()
                    
                    for idx, row in df.iterrows():
                        metrics_data['epochs'].append(int(row['epoch']) if 'epoch' in row else idx)
                        metrics_data['train_loss'].append(float(row['train/box_loss']) if 'train/box_loss' in row else 0)
                        metrics_data['val_loss'].append(float(row['val/box_loss']) if 'val/box_loss' in row else 0)
                        metrics_data['map50'].append(float(row['metrics/mAP50(B)']) if 'metrics/mAP50(B)' in row else 0)
                        metrics_data['map50_95'].append(float(row['metrics/mAP50-95(B)']) if 'metrics/mAP50-95(B)' in row else 0)
                        metrics_data['precision'].append(float(row['metrics/precision(B)']) if 'metrics/precision(B)' in row else 0)
                        metrics_data['recall'].append(float(row['metrics/recall(B)']) if 'metrics/recall(B)' in row else 0)
                        # Learning rate
                        lr_val = 0
                        if 'lr/pg0' in row:
                            lr_val = float(row['lr/pg0'])
                        elif 'lr/pg1' in row:
                            lr_val = float(row['lr/pg1'])
                        metrics_data['lr'].append(lr_val)
                    
                    print(f"📊 Saved {len(metrics_data['epochs'])} epochs of metrics data")
            
            # Save model path
            model_path = os.path.join(
                'training_runs', str(project.id), f'job_{job.id}', 'weights', 'best.pt'
            )
            
            job.model_path = model_path
            job.metrics = json.dumps(metrics_data)
            
            # Evaluate on test set
            print(f"\n📊 Evaluating model on test set...")
            socketio.emit('training_update', {
                'job_id': job.id,
                'status': 'evaluating',
                'message': 'Evaluating model on test set...'
            })
            
            try:
                # Load the trained model
                trained_model = YOLO(model_path)
                
                # Run validation on test set
                test_results = trained_model.val(
                    data=os.path.join(dataset_path, 'data.yaml'),
                    split='test',
                    verbose=False
                )
                
                # Extract metrics
                if test_results:
                    job.test_map50 = float(test_results.box.map50) if hasattr(test_results.box, 'map50') else 0.0
                    job.test_precision = float(test_results.box.mp) if hasattr(test_results.box, 'mp') else 0.0
                    job.test_recall = float(test_results.box.mr) if hasattr(test_results.box, 'mr') else 0.0
                    
                    # Extract per-class metrics
                    class_metrics = []
                    if hasattr(test_results.box, 'maps') and hasattr(test_results.box, 'p') and hasattr(test_results.box, 'r'):
                        # maps: per-class mAP@50
                        # p: per-class precision
                        # r: per-class recall
                        maps = test_results.box.maps  # Per-class mAP@50
                        precisions = test_results.box.p  # Per-class precision
                        recalls = test_results.box.r  # Per-class recall
                        
                        # Get class names from project
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
                    
                    print(f"✅ Test Metrics:")
                    print(f"   mAP@50: {job.test_map50:.1%}")
                    print(f"   Precision: {job.test_precision:.1%}")
                    print(f"   Recall: {job.test_recall:.1%}")
                else:
                    print("⚠️ No test results available")
            except Exception as eval_error:
                print(f"⚠️ Test evaluation failed: {eval_error}")
                # Don't fail the whole training if evaluation fails
                job.test_map50 = None
                job.test_precision = None
                job.test_recall = None
            
            job.status = 'completed'
            job.completed_at = datetime.utcnow()
            db.session.commit()
            print(f"✅ Job #{job.id} completed. Model saved to: {model_path}")
            
            socketio.emit('training_complete', {
                'job_id': job.id,
                'status': 'completed',
                'message': 'Training completed successfully!',
                'model_path': model_path,
                'metrics': metrics_data,
                'test_metrics': {
                    'map50': job.test_map50,
                    'precision': job.test_precision,
                    'recall': job.test_recall
                }
            })
            
        except Exception as e:
            job.status = 'failed'
            job.completed_at = datetime.utcnow()
            db.session.commit()
            
            socketio.emit('training_error', {
                'job_id': job.id,
                'status': 'failed',
                'error': str(e)
            })

def prepare_yolo_dataset(project, job, for_hf_jobs=False):
    """Prepare dataset in YOLO format"""
    dataset_path = os.path.join('datasets', str(project.id), f'job_{job.id}')
    
    # Create directory structure (including test split)
    for split in ['train', 'val', 'test']:
        os.makedirs(os.path.join(dataset_path, 'images', split), exist_ok=True)
        os.makedirs(os.path.join(dataset_path, 'labels', split), exist_ok=True)
    
    # Get images based on dataset version or use all annotated
    if job.dataset_version_id:
        print(f"📊 Using dataset version ID: {job.dataset_version_id}")
        version = DatasetVersion.query.get(job.dataset_version_id)
        if not version:
            print(f"⚠️ WARNING: Dataset version {job.dataset_version_id} not found! Using all annotated images.")
            # Fall back to all annotated images
            annotated_images = [img for img in project.images if img.annotations]
            train_idx = int(len(annotated_images) * 0.7)
            val_idx = int(len(annotated_images) * 0.9)
            
            train_images = annotated_images[:train_idx]
            val_images = annotated_images[train_idx:val_idx]
            test_images = annotated_images[val_idx:]
        else:
            print(f"📊 Dataset version found: {version.name}")
            splits_data = json.loads(version.image_splits)
            
            train_images = [Image.query.get(img_id) for img_id in splits_data['train'] if Image.query.get(img_id)]
            val_images = [Image.query.get(img_id) for img_id in splits_data['val'] if Image.query.get(img_id)]
            test_images = [Image.query.get(img_id) for img_id in splits_data.get('test', []) if Image.query.get(img_id)]
            
            print(f"   Split from version - Train: {len(train_images)}, Val: {len(val_images)}, Test: {len(test_images)}")
    else:
        print(f"📊 No dataset version specified. Using all annotated images with 70/20/10 split.")
        # Default: use all annotated images with 70/20/10 split
        annotated_images = [img for img in project.images if img.annotations]
        train_idx = int(len(annotated_images) * 0.7)
        val_idx = int(len(annotated_images) * 0.9)
        
        train_images = annotated_images[:train_idx]
        val_images = annotated_images[train_idx:val_idx]
        test_images = annotated_images[val_idx:]
        
        print(f"   Auto-split - Train: {len(train_images)}, Val: {len(val_images)}, Test: {len(test_images)}")
    
    # Process images for all splits
    for split, images in [('train', train_images), ('val', val_images), ('test', test_images)]:
        for image in images:
            # Copy image
            dest_image = os.path.join(dataset_path, 'images', split, f'{image.id}.jpg')
            shutil.copy(image.filepath, dest_image)
            
            # Create label file
            label_path = os.path.join(dataset_path, 'labels', split, f'{image.id}.txt')
            with open(label_path, 'w') as f:
                for ann in image.annotations:
                    # Find class index
                    class_idx = next(
                        (i for i, cls in enumerate(project.classes) if cls.id == ann.class_id),
                        0
                    )
                    f.write(f"{class_idx} {ann.x_center} {ann.y_center} {ann.width} {ann.height}\n")
    
    # Create data.yaml
    # Use relative path for HF Jobs (they download to 'dataset' folder)
    # Use absolute path for local training
    data_yaml = {
        'path': '.' if for_hf_jobs else os.path.abspath(dataset_path),
        'train': 'images/train',
        'val': 'images/val',
        'test': 'images/test',
        'nc': len(project.classes),
        'names': [cls.name for cls in project.classes]
    }
    
    with open(os.path.join(dataset_path, 'data.yaml'), 'w') as f:
        yaml.dump(data_yaml, f)
    
    # Print final summary
    print(f"\n{'='*60}")
    print(f"📊 DATASET SUMMARY")
    print(f"{'='*60}")
    print(f"   Dataset Version ID: {job.dataset_version_id or 'None (auto-split)'}")
    print(f"   Train images: {len(train_images)}")
    print(f"   Validation images: {len(val_images)}")
    print(f"   Test images: {len(test_images)}")
    print(f"   Total images: {len(train_images) + len(val_images) + len(test_images)}")
    print(f"   Classes: {len(project.classes)}")
    print(f"   Dataset path: {dataset_path}")
    print(f"{'='*60}\n")
    
    return dataset_path

def train_yolo_model_hf_jobs(job_id, hf_api_key, socketio):
    """Train YOLO model on Hugging Face Jobs using UV script"""
    print(f"\n{'='*60}")
    print(f"🚀 STARTING HF JOBS TRAINING FOR JOB #{job_id}")
    print(f"{'='*60}\n")
    
    from app import app
    from huggingface_hub import HfApi, run_uv_job, inspect_job
    
    with app.app_context():
        job = TrainingJob.query.get(job_id)
        if not job:
            print(f"❌ Job #{job_id} not found!")
            return
        
        print(f"✅ Job found: #{job.id}")
        print(f"   Name: {job.name}")
        print(f"   Project: {job.project.name}")
        print(f"   HF Username: {job.hf_username}")
        print(f"   Hardware: {job.hf_hardware}")
        
        project = job.project
        
        try:
            job.status = 'training'
            job.started_at = datetime.utcnow()
            db.session.commit()
            print(f"✅ Job status updated to 'training'")
            
            socketio.emit('training_update', {
                'job_id': job.id,
                'status': 'training',
                'message': 'Preparing dataset for Hugging Face Jobs...'
            })
            
            # Prepare dataset
            print(f"📦 Preparing dataset...")
            dataset_path = prepare_yolo_dataset(project, job, for_hf_jobs=True)
            print(f"✅ Dataset prepared at: {dataset_path}")
            
            # Upload dataset to HF Hub as a proper dataset
            print(f"📤 Uploading dataset to Hugging Face Hub...")
            api = HfApi(token=hf_api_key)
            
            # Create dataset repo
            dataset_repo_id = f"{job.hf_username}/freeflow-dataset-{project.id}-job{job.id}"
            
            try:
                api.create_repo(
                    repo_id=dataset_repo_id,
                    repo_type="dataset",
                    private=True,
                    exist_ok=True
                )
                print(f"✅ Created dataset repo: {dataset_repo_id}")
            except Exception as e:
                print(f"⚠️  Dataset repo creation: {e}")
            
            # Upload entire dataset folder
            api.upload_folder(
                folder_path=dataset_path,
                repo_id=dataset_repo_id,
                repo_type="dataset",
                ignore_patterns=["*.pyc", "__pycache__"]
            )
            print(f"✅ Dataset uploaded to {dataset_repo_id}")
            
            socketio.emit('training_update', {
                'job_id': job.id,
                'status': 'training',
                'message': f'Dataset uploaded. Starting HF Jobs training...'
            })
            
            # Get UV script path
            script_path = os.path.join(os.path.dirname(__file__), 'yolo_train_hf.py')
            if not os.path.exists(script_path):
                raise FileNotFoundError(f"UV script not found at {script_path}")
            
            # Create output model repo name
            model_repo_id = f"{job.hf_username}/freeflow-model-{project.id}-job{job.id}"
            
            # Prepare UV job arguments
            model_size = job.model_size or 'n'
            
            uv_args = [
                dataset_repo_id,  # input dataset
                model_repo_id,    # output model repo
                "--model-size", model_size,
                "--epochs", str(job.epochs),
                "--batch-size", str(job.batch_size),
                "--image-size", str(job.image_size),
                "--private"  # Keep model private
            ]
            
            print(f"🚀 Starting HF UV Job...")
            print(f"   Script: yolo_train_hf.py")
            print(f"   Dataset: {dataset_repo_id}")
            print(f"   Model Output: {model_repo_id}")
            print(f"   Args: {' '.join(uv_args)}")
            
            # Start HF UV Job
            hf_job_info = run_uv_job(
                script_path,
                script_args=uv_args,
                flavor=job.hf_hardware or "t4-small",
                namespace=job.hf_username,
                secrets={"HF_TOKEN": hf_api_key},
                timeout="3h"  # Longer timeout for training
            )
            
            # Save HF job ID and model repo
            job.hf_job_id = hf_job_info.id
            job.model_path = f"hf://{model_repo_id}/best.pt"  # Store HF Hub path
            db.session.commit()
            
            print(f"✅ HF Job started: {hf_job_info.id}")
            print(f"   URL: {hf_job_info.url}")
            print(f"   Dataset: https://huggingface.co/datasets/{dataset_repo_id}")
            print(f"   Model will be at: https://huggingface.co/{model_repo_id}")
            
            socketio.emit('training_update', {
                'job_id': job.id,
                'status': 'training',
                'message': f'Training on HF Jobs: {hf_job_info.url}'
            })
            
            # Monitor HF Job
            import time
            start_time = time.time()
            
            print(f"📊 Monitoring HF Job: {hf_job_info.url}")
            print(f"⚠️  Note: Real-time training metrics are not available for HF Jobs.")
            print(f"   Charts will be populated when training completes and results are downloaded.")
            
            while True:
                time.sleep(15)  # Check every 15 seconds
                
                hf_job_status = inspect_job(job_id=hf_job_info.id)
                elapsed_time = int((time.time() - start_time) / 60)  # minutes
                print(f"📊 HF Job status: {hf_job_status.status.stage} (elapsed: {elapsed_time}m)")
                
                # Send status update with elapsed time
                status_message = f'Training on HF Jobs: {hf_job_status.status.stage}'
                if elapsed_time > 0:
                    status_message += f' ({elapsed_time} min)'
                
                socketio.emit('training_update', {
                    'job_id': job.id,
                    'status': 'training',
                    'message': status_message
                })
                
                if hf_job_status.status.stage == "COMPLETED":
                    print(f"✅ HF Job completed!")
                    
                    # Download trained model from HF Hub
                    print(f"📥 Downloading trained model from {model_repo_id}...")
                    socketio.emit('training_update', {
                        'job_id': job.id,
                        'status': 'downloading',
                        'message': 'Downloading trained model from HF Hub...'
                    })
                    
                    try:
                        # Create local directory for the model
                        local_model_dir = os.path.join('training_runs', str(project.id), f'job_{job.id}')
                        os.makedirs(os.path.join(local_model_dir, 'weights'), exist_ok=True)
                        
                        # Download model files
                        model_files = ['best.pt', 'results.csv', 'results.png', 'args.yaml']
                        for file in model_files:
                            try:
                                local_path = api.hf_hub_download(
                                    repo_id=model_repo_id,
                                    filename=file,
                                    repo_type="model"
                                )
                                # Copy to training_runs directory
                                if file == 'best.pt':
                                    dest = os.path.join(local_model_dir, 'weights', file)
                                else:
                                    dest = os.path.join(local_model_dir, file)
                                shutil.copy(local_path, dest)
                                print(f"✅ Downloaded {file}")
                            except Exception as e:
                                print(f"⚠️ Could not download {file}: {e}")
                        
                        # Update model path to local path
                        local_model_path = os.path.join(local_model_dir, 'weights', 'best.pt')
                        job.model_path = local_model_path
                        
                        # Parse results.csv for metrics
                        results_csv = os.path.join(local_model_dir, 'results.csv')
                        if os.path.exists(results_csv):
                            print(f"📊 Parsing metrics from {results_csv}...")
                            import pandas as pd
                            df = pd.read_csv(results_csv)
                            df.columns = df.columns.str.strip()
                            
                            print(f"📊 CSV columns: {list(df.columns)}")
                            print(f"📊 CSV shape: {df.shape}")
                            
                            metrics_data = {
                                'epochs': [],
                                'train_loss': [],
                                'val_loss': [],
                                'map50': [],
                                'map50_95': [],
                                'precision': [],
                                'recall': [],
                                'lr': []
                            }
                            
                            for idx, row in df.iterrows():
                                metrics_data['epochs'].append(int(row['epoch']) if 'epoch' in row else idx + 1)
                                metrics_data['train_loss'].append(float(row['train/box_loss']) if 'train/box_loss' in row else 0)
                                metrics_data['val_loss'].append(float(row['val/box_loss']) if 'val/box_loss' in row else 0)
                                metrics_data['map50'].append(float(row['metrics/mAP50(B)']) if 'metrics/mAP50(B)' in row else 0)
                                metrics_data['map50_95'].append(float(row['metrics/mAP50-95(B)']) if 'metrics/mAP50-95(B)' in row else 0)
                                metrics_data['precision'].append(float(row['metrics/precision(B)']) if 'metrics/precision(B)' in row else 0)
                                metrics_data['recall'].append(float(row['metrics/recall(B)']) if 'metrics/recall(B)' in row else 0)
                                # Learning rate columns vary: lr/pg0, lr/pg1, lr/pg2
                                lr_val = 0
                                if 'lr/pg0' in row:
                                    lr_val = float(row['lr/pg0'])
                                elif 'lr/pg1' in row:
                                    lr_val = float(row['lr/pg1'])
                                metrics_data['lr'].append(lr_val)
                            
                            job.metrics = json.dumps(metrics_data)
                            print(f"✅ Parsed metrics from {len(metrics_data['epochs'])} epochs")
                            print(f"📊 Sample metrics: epochs={metrics_data['epochs'][:3]}, train_loss={metrics_data['train_loss'][:3]}")
                        else:
                            print(f"⚠️ results.csv not found at {results_csv}")
                        
                        print(f"✅ Model downloaded to {local_model_path}")
                        
                        # Evaluate on test set
                        print(f"\n📊 Evaluating model on test set...")
                        socketio.emit('training_update', {
                            'job_id': job.id,
                            'status': 'evaluating',
                            'message': 'Evaluating model on test set...'
                        })
                        
                        try:
                            from ultralytics import YOLO
                            
                            # Load the trained model
                            trained_model = YOLO(local_model_path)
                            
                            # Run validation on test set
                            test_results = trained_model.val(
                                data=os.path.join(dataset_path, 'data.yaml'),
                                split='test',
                                verbose=False
                            )
                            
                            # Extract metrics
                            if test_results:
                                job.test_map50 = float(test_results.box.map50) if hasattr(test_results.box, 'map50') else 0.0
                                job.test_precision = float(test_results.box.mp) if hasattr(test_results.box, 'mp') else 0.0
                                job.test_recall = float(test_results.box.mr) if hasattr(test_results.box, 'mr') else 0.0
                                
                                # Extract per-class metrics
                                class_metrics = []
                                if hasattr(test_results.box, 'maps') and hasattr(test_results.box, 'p') and hasattr(test_results.box, 'r'):
                                    # maps: per-class mAP@50
                                    # p: per-class precision
                                    # r: per-class recall
                                    maps = test_results.box.maps  # Per-class mAP@50
                                    precisions = test_results.box.p  # Per-class precision
                                    recalls = test_results.box.r  # Per-class recall
                                    
                                    # Get class names from project
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
                                
                                print(f"✅ Test Metrics:")
                                print(f"   mAP@50: {job.test_map50:.1%}")
                                print(f"   Precision: {job.test_precision:.1%}")
                                print(f"   Recall: {job.test_recall:.1%}")
                            else:
                                print("⚠️ No test results available")
                        except Exception as eval_error:
                            print(f"⚠️ Test evaluation failed: {eval_error}")
                            import traceback
                            traceback.print_exc()
                            # Don't fail the whole training if evaluation fails
                            job.test_map50 = None
                            job.test_precision = None
                            job.test_recall = None
                        
                    except Exception as download_error:
                        print(f"⚠️ Error downloading model: {download_error}")
                        # Keep the HF Hub path as fallback
                        job.model_path = f"hf://{model_repo_id}/best.pt"
                    
                    job.status = 'completed'
                    job.completed_at = datetime.utcnow()
                    
                    # Log test metrics before commit
                    print(f"📊 Test metrics before commit:")
                    print(f"   test_map50: {job.test_map50}")
                    print(f"   test_precision: {job.test_precision}")
                    print(f"   test_recall: {job.test_recall}")
                    
                    db.session.commit()
                    print(f"✅ Job committed to database")
                    
                    # Prepare completion data
                    metrics_to_send = json.loads(job.metrics) if job.metrics else {}
                    print(f"📊 Metrics to send: {list(metrics_to_send.keys()) if metrics_to_send else 'None'}")
                    if metrics_to_send and 'epochs' in metrics_to_send:
                        print(f"📊 Metrics epochs count: {len(metrics_to_send['epochs'])}")
                    
                    completion_data = {
                        'job_id': job.id,
                        'status': 'completed',
                        'message': 'Training completed on HF Jobs!',
                        'hf_job_url': hf_job_info.url,
                        'model_path': job.model_path,
                        'metrics': metrics_to_send,
                        'test_metrics': {
                            'map50': job.test_map50,
                            'precision': job.test_precision,
                            'recall': job.test_recall
                        }
                    }
                    
                    print(f"📤 Emitting training_complete with metrics: {bool(metrics_to_send)}")
                    print(f"📊 Test metrics - mAP50: {job.test_map50}, Precision: {job.test_precision}, Recall: {job.test_recall}")
                    socketio.emit('training_complete', completion_data)
                    break
                    
                elif hf_job_status.status.stage in ["ERROR", "FAILED"]:
                    print(f"❌ HF Job failed: {hf_job_status.status.message}")
                    job.status = 'failed'
                    job.error_message = hf_job_status.status.message or "HF Job failed"
                    job.completed_at = datetime.utcnow()
                    db.session.commit()
                    
                    socketio.emit('training_error', {
                        'job_id': job.id,
                        'status': 'failed',
                        'error': job.error_message
                    })
                    break
                    
        except Exception as e:
            print(f"❌ HF Jobs training failed: {e}")
            import traceback
            traceback.print_exc()
            
            job.status = 'failed'
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            db.session.commit()
            
            socketio.emit('training_error', {
                'job_id': job.id,
                'status': 'failed',
                'error': str(e)
            })


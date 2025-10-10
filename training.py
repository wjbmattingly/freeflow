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
        print(f"   Project: {job.project.name}")
        print(f"   Epochs: {job.epochs}")
        print(f"   Batch: {job.batch_size}")
        
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
                'map50_95': []
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

def prepare_yolo_dataset(project, job):
    """Prepare dataset in YOLO format"""
    dataset_path = os.path.join('datasets', str(project.id), f'job_{job.id}')
    
    # Create directory structure (including test split)
    for split in ['train', 'val', 'test']:
        os.makedirs(os.path.join(dataset_path, 'images', split), exist_ok=True)
        os.makedirs(os.path.join(dataset_path, 'labels', split), exist_ok=True)
    
    # Get images based on dataset version or use all annotated
    if job.dataset_version_id:
        version = DatasetVersion.query.get(job.dataset_version_id)
        splits_data = json.loads(version.image_splits)
        
        train_images = [Image.query.get(img_id) for img_id in splits_data['train']]
        val_images = [Image.query.get(img_id) for img_id in splits_data['val']]
        test_images = [Image.query.get(img_id) for img_id in splits_data.get('test', [])]
    else:
        # Default: use all annotated images with 70/20/10 split
        annotated_images = [img for img in project.images if img.annotations]
        train_idx = int(len(annotated_images) * 0.7)
        val_idx = int(len(annotated_images) * 0.9)
        
        train_images = annotated_images[:train_idx]
        val_images = annotated_images[train_idx:val_idx]
        test_images = annotated_images[val_idx:]
    
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
    data_yaml = {
        'path': os.path.abspath(dataset_path),
        'train': 'images/train',
        'val': 'images/val',
        'test': 'images/test',
        'nc': len(project.classes),
        'names': [cls.name for cls in project.classes]
    }
    
    with open(os.path.join(dataset_path, 'data.yaml'), 'w') as f:
        yaml.dump(data_yaml, f)
    
    return dataset_path


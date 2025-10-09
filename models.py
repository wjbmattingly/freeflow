from database import db
from datetime import datetime
import json

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    project_type = db.Column(db.String(50), nullable=False)  # object_detection, classification, etc.
    annotation_group = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    images = db.relationship('Image', backref='project', lazy=True, cascade='all, delete-orphan')
    classes = db.relationship('Class', backref='project', lazy=True, cascade='all, delete-orphan')
    dataset_versions = db.relationship('DatasetVersion', backref='project', lazy=True, cascade='all, delete-orphan')
    training_jobs = db.relationship('TrainingJob', backref='project', lazy=True, cascade='all, delete-orphan')
    custom_models = db.relationship('CustomModel', backref='project', lazy=True, cascade='all, delete-orphan')

class Class(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(20))  # Hex color
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    
    # Relationships
    annotations = db.relationship('Annotation', backref='class_obj', lazy=True, cascade='all, delete-orphan')

class Image(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(500), nullable=False)
    filepath = db.Column(db.String(1000), nullable=False)
    width = db.Column(db.Integer)
    height = db.Column(db.Integer)
    batch_id = db.Column(db.String(100))  # For grouping uploaded images
    status = db.Column(db.String(50), default='unassigned')  # unassigned, annotating, completed
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    
    # Relationships
    annotations = db.relationship('Annotation', backref='image', lazy=True, cascade='all, delete-orphan')

class Annotation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    image_id = db.Column(db.Integer, db.ForeignKey('image.id'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('class.id'), nullable=False)
    
    # Bounding box coordinates (normalized 0-1)
    x_center = db.Column(db.Float, nullable=False)
    y_center = db.Column(db.Float, nullable=False)
    width = db.Column(db.Float, nullable=False)
    height = db.Column(db.Float, nullable=False)
    
    confidence = db.Column(db.Float, default=1.0)  # For model predictions
    is_predicted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class DatasetVersion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    
    # Split percentages
    train_split = db.Column(db.Float, default=0.7)  # 70%
    val_split = db.Column(db.Float, default=0.2)    # 20%
    test_split = db.Column(db.Float, default=0.1)   # 10%
    
    # Image assignments stored as JSON
    # {"train": [img_id1, img_id2, ...], "val": [...], "test": [...]}
    image_splits = db.Column(db.Text, nullable=False)
    
    # Statistics
    total_images = db.Column(db.Integer)
    total_annotations = db.Column(db.Integer)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    training_jobs = db.relationship('TrainingJob', backref='dataset_version', lazy=True)

class TrainingJob(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    dataset_version_id = db.Column(db.Integer, db.ForeignKey('dataset_version.id'))
    name = db.Column(db.String(200))  # User-friendly name for the model
    model_size = db.Column(db.String(20), default='n')  # n, s, m, l, x
    status = db.Column(db.String(50), default='pending')  # pending, training, completed, failed
    epochs = db.Column(db.Integer, default=100)
    batch_size = db.Column(db.Integer, default=16)
    image_size = db.Column(db.Integer, default=640)
    model_path = db.Column(db.String(1000))
    
    # Training metrics stored as JSON
    metrics = db.Column(db.Text)  # JSON string
    
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CustomModel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    file_path = db.Column(db.String(1000), nullable=False)
    file_size = db.Column(db.String(50))  # Human-readable file size
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


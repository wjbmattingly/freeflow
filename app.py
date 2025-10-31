from flask import Flask
from flask_socketio import SocketIO
from pathlib import Path
from database import db
import os

# Create Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')
app.config['SESSION_COOKIE_SECURE'] = False  # Allow in HF iframe
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'  # Required for iframe

# Use absolute path for database in production (HuggingFace Spaces)
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'annotation_platform.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 1000 * 1024 * 1024  # 1GB max file size

# Ensure instance directory exists
os.makedirs(os.path.dirname(db_path), exist_ok=True)

# Initialize extensions
db.init_app(app)

# Configure CORS for HuggingFace Spaces (works with both public and private)
socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    cors_credentials=True,
    max_http_buffer_size=1000 * 1024 * 1024,  # 1GB for large file uploads
    async_mode='eventlet',
    logger=True,
    engineio_logger=True,
    # Allow connections through HuggingFace's authentication proxy
    allow_upgrades=True,
    ping_timeout=60,
    ping_interval=25
)

# Ensure upload directory exists
Path(app.config['UPLOAD_FOLDER']).mkdir(exist_ok=True)

# Import models first
from models import Project, Image, Annotation, Class, DatasetVersion, TrainingJob, CustomModel

# Import routes module
import routes

# Initialize routes with app and socketio instances
routes.init_routes(app, socketio)

# Initialize database (create tables if they don't exist)
# This runs even when using gunicorn
try:
    with app.app_context():
        db.create_all()
        print(f"✅ Database initialized at: {db_path}")
except Exception as e:
    print(f"⚠️ Database initialization warning: {e}")
    # Continue anyway - will be initialized by init_db.py if this fails

# Register all routes
app.route('/')(routes.index)
app.route('/project/<int:project_id>')(routes.project_page)
app.route('/annotate/<int:project_id>')(routes.annotate_page)
app.route('/training/<int:project_id>')(routes.training_page)
app.route('/project/<int:project_id>/model/<int:job_id>')(routes.view_model)

# Register API routes
app.route('/api/projects', methods=['GET'])(routes.get_projects)
app.route('/api/projects', methods=['POST'])(routes.create_project)
app.route('/api/projects/<int:project_id>', methods=['GET'])(routes.get_project)
app.route('/api/projects/<int:project_id>', methods=['DELETE'])(routes.delete_project)
app.route('/api/projects/<int:project_id>', methods=['PUT'])(routes.update_project_settings)
app.route('/api/projects/<int:project_id>/thumbnail', methods=['GET'])(routes.get_project_thumbnail)
app.route('/api/projects/<int:project_id>/thumbnail', methods=['POST'])(routes.upload_project_thumbnail)
app.route('/api/projects/<int:project_id>/upload', methods=['POST'])(routes.upload_images)
app.route('/api/projects/<int:project_id>/import-roboflow', methods=['POST'])(routes.import_from_roboflow)
app.route('/api/projects/<int:project_id>/images', methods=['GET'])(routes.get_project_images)
app.route('/api/projects/<int:project_id>/images/delete', methods=['POST'])(routes.delete_project_images)
app.route('/api/images/<int:image_id>', methods=['GET'])(routes.get_image)
app.route('/api/images/<int:image_id>/annotations', methods=['GET'])(routes.get_image_annotations)
app.route('/api/images/<int:image_id>/annotations', methods=['POST'])(routes.save_annotations)
app.route('/api/projects/<int:project_id>/classes', methods=['GET'])(routes.get_project_classes)
app.route('/api/projects/<int:project_id>/classes', methods=['POST'])(routes.add_class)
app.route('/api/projects/<int:project_id>/classes/<int:class_id>', methods=['PUT'])(routes.update_class)
app.route('/api/projects/<int:project_id>/classes/<int:class_id>', methods=['DELETE'])(routes.delete_class)
app.route('/api/projects/<int:project_id>/dataset-versions', methods=['GET'])(routes.get_dataset_versions)
app.route('/api/projects/<int:project_id>/dataset-versions', methods=['POST'])(routes.create_dataset_version)
app.route('/api/projects/<int:project_id>/dataset-versions/<int:version_id>', methods=['DELETE'])(routes.delete_dataset_version)
app.route('/api/projects/<int:project_id>/train', methods=['POST'])(routes.start_training)
app.route('/api/training/<int:job_id>', methods=['GET'])(routes.get_training_job)
app.route('/api/training/<int:job_id>', methods=['DELETE'])(routes.delete_training_job)
app.route('/api/training/<int:job_id>/stop', methods=['POST'])(routes.stop_training_early)
app.route('/api/training/<int:job_id>/download', methods=['GET'])(routes.download_model)
app.route('/api/training/<int:job_id>/confusion-matrix', methods=['GET'])(routes.get_confusion_matrix)
app.route('/api/training/<int:job_id>/confusion-matrix-normalized', methods=['GET'])(routes.get_confusion_matrix_normalized)
app.route('/api/training/<int:job_id>/evaluate', methods=['POST'])(routes.evaluate_model_on_test)
app.route('/api/training/<int:job_id>/predict-upload', methods=['POST'])(routes.predict_on_upload)
app.route('/api/training/<int:job_id>/classes', methods=['GET'])(routes.get_model_classes)
app.route('/api/projects/<int:project_id>/predict', methods=['POST'])(routes.predict_annotations)
app.route('/api/projects/<int:project_id>/external-models', methods=['GET'])(routes.get_external_models)
app.route('/api/projects/<int:project_id>/custom-models/<int:model_id>/classes', methods=['GET'])(routes.get_custom_model_classes)
app.route('/api/projects/<int:project_id>/use-external-model', methods=['POST'])(routes.use_external_model)
app.route('/api/projects/<int:project_id>/sam2/predict-point', methods=['POST'])(routes.sam2_predict_point)
app.route('/api/projects/<int:project_id>/sam2/predict-box', methods=['POST'])(routes.sam2_predict_box)
app.route('/api/sam2/models', methods=['GET'])(routes.get_sam2_models)
app.route('/api/sam2/models/<model_key>/download', methods=['POST'])(routes.download_sam2_model)
app.route('/api/sam2/set-model', methods=['POST'])(routes.set_sam2_model)
app.route('/api/projects/<int:project_id>/custom-models', methods=['POST'])(routes.upload_custom_model)
app.route('/api/projects/<int:project_id>/custom-models/<int:model_id>', methods=['DELETE'])(routes.delete_custom_model)

# Error handlers
@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error"""
    from flask import jsonify
    return jsonify({
        'error': 'File too large',
        'message': 'The uploaded file exceeds the maximum size limit of 1GB. Please try a smaller file.'
    }), 413

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    # Print all registered routes for debugging
    print("\n" + "="*60)
    print("REGISTERED ROUTES:")
    print("="*60)
    for rule in app.url_map.iter_rules():
        print(f"{rule.methods} {rule.rule}")
    print("="*60 + "\n")
    
    # Get port from environment variable (for HuggingFace Spaces) or default to 5000
    import os
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '127.0.0.1')
    
    # Disable debug mode to prevent reloader issues
    socketio.run(app, debug=False, host=host, port=port, allow_unsafe_werkzeug=True)

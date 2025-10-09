from flask import Flask
from flask_socketio import SocketIO
from pathlib import Path
from database import db

# Create Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///annotation_platform.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size

# Initialize extensions
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Ensure upload directory exists
Path(app.config['UPLOAD_FOLDER']).mkdir(exist_ok=True)

# Import models first
from models import Project, Image, Annotation, Class, DatasetVersion, TrainingJob, CustomModel

# Import routes module
import routes

# Initialize routes with app and socketio instances
routes.init_routes(app, socketio)

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
app.route('/api/projects/<int:project_id>/custom-models', methods=['POST'])(routes.upload_custom_model)
app.route('/api/projects/<int:project_id>/custom-models/<int:model_id>', methods=['DELETE'])(routes.delete_custom_model)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, debug=True, host='127.0.0.1', port=5000, allow_unsafe_werkzeug=True)

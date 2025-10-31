"""
SAM2 (Segment Anything 2) Integration Service
Provides real-time segmentation for polygon annotation
"""

import os
import numpy as np
import cv2
from PIL import Image as PILImage
import torch
from shapely.geometry import Polygon as ShapelyPolygon
from shapely import simplify

# Available SAM2.1 models
SAM2_MODELS = {
    'tiny': {
        'name': 'SAM2.1 Tiny',
        'config': 'sam2.1/sam2.1_hiera_t',
        'checkpoint': 'sam2_hiera_tiny.pt',
        'params': '38.9M',
        'speed': 'Fastest',
        'url': 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt'
    },
    'small': {
        'name': 'SAM2.1 Small',
        'config': 'sam2.1/sam2.1_hiera_s',
        'checkpoint': 'sam2_hiera_small.pt',
        'params': '46M',
        'speed': 'Fast',
        'url': 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt'
    },
    'base_plus': {
        'name': 'SAM2.1 Base+',
        'config': 'sam2.1/sam2.1_hiera_b+',
        'checkpoint': 'sam2_hiera_base_plus.pt',
        'params': '80.8M',
        'speed': 'Medium',
        'url': 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt'
    },
    'large': {
        'name': 'SAM2.1 Large',
        'config': 'sam2.1/sam2.1_hiera_l',
        'checkpoint': 'sam2_hiera_large.pt',
        'params': '224.4M',
        'speed': 'Slower',
        'url': 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt'
    }
}

class SAM2Service:
    """Service for SAM2 segmentation operations"""
    
    def __init__(self, model_size='tiny'):
        self.model = None
        self.predictor = None
        self.current_model_size = None
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model_size = model_size
        print(f"🤖 SAM2 Service initialized (device: {self.device}, default model: {model_size})")
    
    def load_model(self, model_size=None):
        """Load SAM2 model lazily (only when first needed)"""
        if model_size is None:
            model_size = self.model_size
        
        # If model already loaded and same size, skip
        if self.model is not None and self.current_model_size == model_size:
            return
        
        # Unload previous model if switching
        if self.model is not None and self.current_model_size != model_size:
            print(f"🔄 Switching from {self.current_model_size} to {model_size}...")
            del self.model
            del self.predictor
            self.model = None
            self.predictor = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        
        try:
            model_info = SAM2_MODELS.get(model_size)
            if not model_info:
                raise ValueError(f"Unknown model size: {model_size}")
            
            print(f"📥 Loading {model_info['name']} ({model_info['params']} params)...")
            
            # Check for local model files first
            base_dir = os.path.dirname(os.path.abspath(__file__))
            sam2_checkpoint = os.path.join(base_dir, 'models', 'sam2', model_info['checkpoint'])
            
            # Try to import and load SAM2
            try:
                from sam2.build_sam import build_sam2
                from sam2.sam2_image_predictor import SAM2ImagePredictor
                from hydra import initialize_config_dir, compose
                from hydra.core.global_hydra import GlobalHydra
                import sam2
                
                # Check if checkpoint exists
                if not os.path.exists(sam2_checkpoint):
                    raise FileNotFoundError(
                        f"SAM2 checkpoint not found at: {sam2_checkpoint}\n"
                        f"   Model: {model_info['name']}\n"
                        f"   Download URL: {model_info['url']}"
                    )
                
                print(f"   Loading from: {sam2_checkpoint}")
                
                # Initialize Hydra with SAM2 configs directory
                sam2_package_path = os.path.dirname(sam2.__file__)
                config_dir = os.path.join(sam2_package_path, 'configs')
                
                # Clear any existing Hydra instance
                GlobalHydra.instance().clear()
                
                # Initialize with the config directory
                initialize_config_dir(config_dir=config_dir, version_base=None)
                
                # Compose config for the selected model
                cfg = compose(config_name=model_info['config'])
                
                # Build SAM2 model using hydra config
                sam2_model = build_sam2(model_info['config'], ckpt_path=sam2_checkpoint, device=self.device)
                self.predictor = SAM2ImagePredictor(sam2_model)
                self.model = sam2_model
                self.current_model_size = model_size
                
                print(f"✅ {model_info['name']} loaded successfully on {self.device}")
                
            except ImportError as ie:
                print(f"❌ SAM2 not available: {ie}")
                raise
                
        except FileNotFoundError as e:
            print(f"❌ Model file not found: {e}")
            raise
        except Exception as e:
            print(f"❌ Failed to load SAM model: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def set_model_size(self, model_size):
        """Change the active model size"""
        self.model_size = model_size
        self.load_model(model_size)
    
    def predict_from_point(self, image_path, point_x, point_y, simplification_tolerance=2.0, model_size=None):
        """
        Predict segmentation mask from a single point
        
        Args:
            image_path: Path to image file
            point_x: X coordinate (normalized 0-1)
            point_y: Y coordinate (normalized 0-1)
            simplification_tolerance: Polygon simplification tolerance (pixels)
            model_size: Optional model size to use (defaults to current)
        
        Returns:
            dict with polygon points and metadata
        """
        self.load_model(model_size)
        
        if self.predictor is None:
            return {'error': 'SAM model not loaded'}
        
        try:
            # Load image
            image = cv2.imread(image_path)
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            height, width = image.shape[:2]
            
            # Convert normalized coordinates to pixel coordinates
            point_coords = np.array([[int(point_x * width), int(point_y * height)]])
            point_labels = np.array([1])  # 1 = foreground point
            
            # Set image for predictor
            self.predictor.set_image(image)
            
            # Predict
            masks, scores, logits = self.predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                multimask_output=True
            )
            
            # Get best mask (highest score)
            best_idx = np.argmax(scores)
            mask = masks[best_idx]
            
            # Convert mask to polygon
            polygon = self._mask_to_polygon(mask, simplification_tolerance)
            
            # Normalize polygon coordinates
            normalized_polygon = [
                [x / width, y / height] for x, y in polygon
            ]
            
            return {
                'polygon': normalized_polygon,
                'confidence': float(scores[best_idx]),
                'area': int(mask.sum())
            }
            
        except Exception as e:
            print(f"❌ SAM prediction error: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def predict_from_box(self, image_path, x_center, y_center, width, height, simplification_tolerance=2.0, model_size=None):
        """
        Predict segmentation mask from a bounding box
        
        Args:
            image_path: Path to image file
            x_center, y_center, width, height: YOLO format normalized bbox
            simplification_tolerance: Polygon simplification tolerance (pixels)
            model_size: Optional model size to use (defaults to current)
        
        Returns:
            dict with polygon points and metadata
        """
        self.load_model(model_size)
        
        if self.predictor is None:
            return {'error': 'SAM model not loaded'}
        
        try:
            # Load image
            image = cv2.imread(image_path)
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            img_height, img_width = image.shape[:2]
            
            # Convert YOLO bbox to xyxy format
            left = (x_center - width / 2) * img_width
            top = (y_center - height / 2) * img_height
            right = (x_center + width / 2) * img_width
            bottom = (y_center + height / 2) * img_height
            
            box = np.array([left, top, right, bottom])
            
            # Set image for predictor
            self.predictor.set_image(image)
            
            # Predict with box prompt
            masks, scores, logits = self.predictor.predict(
                box=box[None, :],
                multimask_output=True
            )
            
            # Get best mask
            best_idx = np.argmax(scores)
            mask = masks[best_idx]
            
            # Convert mask to polygon
            polygon = self._mask_to_polygon(mask, simplification_tolerance)
            
            # Normalize polygon coordinates
            normalized_polygon = [
                [x / img_width, y / img_height] for x, y in polygon
            ]
            
            return {
                'polygon': normalized_polygon,
                'confidence': float(scores[best_idx]),
                'area': int(mask.sum())
            }
            
        except Exception as e:
            print(f"❌ SAM box prediction error: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def _mask_to_polygon(self, mask, tolerance=2.0):
        """
        Convert binary mask to polygon points using contours
        
        Args:
            mask: Binary mask (H, W)
            tolerance: Simplification tolerance in pixels
        
        Returns:
            List of [x, y] coordinates
        """
        # Convert mask to uint8
        mask_uint8 = (mask * 255).astype(np.uint8)
        
        # Find contours
        contours, _ = cv2.findContours(
            mask_uint8,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        if len(contours) == 0:
            return []
        
        # Get largest contour
        largest_contour = max(contours, key=cv2.contourArea)
        
        # Convert contour to polygon
        points = largest_contour.reshape(-1, 2).tolist()
        
        # Simplify polygon if tolerance > 0
        if tolerance > 0 and len(points) > 3:
            try:
                poly = ShapelyPolygon(points)
                simplified = simplify(poly, tolerance=tolerance, preserve_topology=True)
                if simplified.exterior:
                    points = list(simplified.exterior.coords[:-1])  # Remove duplicate last point
            except Exception as e:
                print(f"⚠️ Polygon simplification warning: {e}")
                # Keep original points if simplification fails
        
        return points

# Global SAM2 service instance
_sam2_service = None

def get_sam2_service():
    """Get or create SAM2 service singleton"""
    global _sam2_service
    if _sam2_service is None:
        _sam2_service = SAM2Service()
    return _sam2_service

def get_available_models():
    """Check which SAM2 models are downloaded"""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_dir, 'models', 'sam2')
    
    available = []
    for model_key, model_info in SAM2_MODELS.items():
        checkpoint_path = os.path.join(models_dir, model_info['checkpoint'])
        available.append({
            'key': model_key,
            'name': model_info['name'],
            'params': model_info['params'],
            'speed': model_info['speed'],
            'url': model_info['url'],
            'downloaded': os.path.exists(checkpoint_path),
            'path': checkpoint_path if os.path.exists(checkpoint_path) else None,
            'size_mb': round(os.path.getsize(checkpoint_path) / (1024 * 1024), 1) if os.path.exists(checkpoint_path) else None
        })
    
    return available

def download_model(model_key):
    """Download a specific SAM2 model"""
    import subprocess
    
    if model_key not in SAM2_MODELS:
        return {'error': f'Unknown model: {model_key}'}
    
    model_info = SAM2_MODELS[model_key]
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_dir, 'models', 'sam2')
    os.makedirs(models_dir, exist_ok=True)
    
    checkpoint_path = os.path.join(models_dir, model_info['checkpoint'])
    
    if os.path.exists(checkpoint_path):
        return {'status': 'already_exists', 'path': checkpoint_path}
    
    try:
        print(f"📥 Downloading {model_info['name']}...")
        print(f"   URL: {model_info['url']}")
        
        # Use curl to download
        result = subprocess.run(
            ['curl', '-L', model_info['url'], '-o', checkpoint_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0 and os.path.exists(checkpoint_path):
            file_size_mb = round(os.path.getsize(checkpoint_path) / (1024 * 1024), 1)
            print(f"✅ Downloaded {model_info['name']} ({file_size_mb} MB)")
            return {'status': 'success', 'path': checkpoint_path, 'size_mb': file_size_mb}
        else:
            return {'error': f'Download failed: {result.stderr}'}
            
    except Exception as e:
        return {'error': str(e)}




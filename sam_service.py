"""
SAM (Segment Anything) Integration Service
Provides real-time segmentation for polygon annotation.

Uses the Ultralytics SAM interface (ultralytics>=8.3.237), which supports
SAM3 (default) as well as SAM2.1 fallback models. SAM2.1 checkpoints are
downloaded automatically from the Ultralytics assets release; SAM3 weights
are license-gated and must be fetched from Hugging Face (facebook/sam3)
with an HF token that has been granted access.
"""

import os
import numpy as np
import cv2
import torch
from shapely.geometry import Polygon as ShapelyPolygon
from shapely import simplify

# Available SAM models (SAM3 default, SAM2.1 fallbacks)
SAM_MODELS = {
    'sam3': {
        'name': 'SAM3',
        'checkpoint': 'sam3.pt',
        'params': '848M',
        'speed': 'Slower',
        'source': 'huggingface',
        'repo_id': 'facebook/sam3',
        'url': 'https://huggingface.co/facebook/sam3'
    },
    'sam2_tiny': {
        'name': 'SAM2.1 Tiny',
        'checkpoint': 'sam2.1_t.pt',
        'params': '38.9M',
        'speed': 'Fastest',
        'source': 'ultralytics',
        'url': 'https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_t.pt'
    },
    'sam2_small': {
        'name': 'SAM2.1 Small',
        'checkpoint': 'sam2.1_s.pt',
        'params': '46M',
        'speed': 'Fast',
        'source': 'ultralytics',
        'url': 'https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_s.pt'
    },
    'sam2_base': {
        'name': 'SAM2.1 Base+',
        'checkpoint': 'sam2.1_b.pt',
        'params': '80.8M',
        'speed': 'Medium',
        'source': 'ultralytics',
        'url': 'https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_b.pt'
    },
    'sam2_large': {
        'name': 'SAM2.1 Large',
        'checkpoint': 'sam2.1_l.pt',
        'params': '224.4M',
        'speed': 'Slower',
        'source': 'ultralytics',
        'url': 'https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_l.pt'
    }
}

DEFAULT_MODEL = 'sam3'


def get_models_dir():
    """Directory where SAM checkpoints are stored"""
    env_dir = os.environ.get('SAM_MODELS_DIR')
    if env_dir:
        return env_dir
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_dir, 'models', 'sam')


class SAMService:
    """Service for SAM segmentation operations (SAM3 / SAM2.1 via ultralytics)"""

    def __init__(self, model_size=DEFAULT_MODEL):
        self.model = None
        self.current_model_size = None
        if torch.cuda.is_available():
            self.device = 'cuda'
        elif getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            self.device = 'mps'
        else:
            self.device = 'cpu'
        self.model_size = model_size
        print(f"🤖 SAM Service initialized (device: {self.device}, default model: {model_size})")

    def load_model(self, model_size=None):
        """Load SAM model lazily (only when first needed)"""
        if model_size is None:
            model_size = self.model_size

        model_info = SAM_MODELS.get(model_size)
        if not model_info:
            raise ValueError(f"Unknown model: {model_size}")

        checkpoint_path = os.path.join(get_models_dir(), model_info['checkpoint'])

        # If the gated SAM3 checkpoint isn't available, fall back to a model
        # that is already downloaded so segmentation keeps working
        if not os.path.exists(checkpoint_path) and model_info['source'] == 'huggingface':
            for fallback_key, fallback_info in SAM_MODELS.items():
                fallback_path = os.path.join(get_models_dir(), fallback_info['checkpoint'])
                if os.path.exists(fallback_path):
                    print(f"⚠️ {model_info['name']} not downloaded, falling back to {fallback_info['name']}")
                    model_size = fallback_key
                    model_info = fallback_info
                    checkpoint_path = fallback_path
                    break

        # If model already loaded and same size, skip
        if self.model is not None and self.current_model_size == model_size:
            return

        # Unload previous model if switching
        if self.model is not None and self.current_model_size != model_size:
            print(f"🔄 Switching from {self.current_model_size} to {model_size}...")
            del self.model
            self.model = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        if not os.path.exists(checkpoint_path):
            if model_info['source'] == 'ultralytics':
                # Ultralytics checkpoints are small and freely downloadable
                print(f"📥 {model_info['checkpoint']} not found locally, downloading...")
                result = download_model(model_size)
                if 'error' in result:
                    raise FileNotFoundError(
                        f"SAM checkpoint not found at {checkpoint_path} and download failed: {result['error']}"
                    )
            else:
                raise FileNotFoundError(
                    f"SAM3 checkpoint not found at: {checkpoint_path}\n"
                    f"   SAM3 weights are license-gated. Request access at {model_info['url']},\n"
                    f"   then run ./download_sam.sh with a valid HF_TOKEN, or use the download\n"
                    f"   button in the annotation UI."
                )

        print(f"📥 Loading {model_info['name']} ({model_info['params']} params) from {checkpoint_path}...")
        from ultralytics import SAM
        self.model = SAM(checkpoint_path)
        self.current_model_size = model_size
        print(f"✅ {model_info['name']} loaded successfully (device: {self.device})")

    def set_model_size(self, model_size):
        """Change the active model"""
        self.model_size = model_size
        self.load_model(model_size)

    def _predict(self, image_path, **prompts):
        """Run SAM prediction with the given prompt kwargs, return (mask, confidence)"""
        results = self.model.predict(
            image_path,
            device=self.device,
            verbose=False,
            # Don't drop low-quality masks: like the original SAM2 predictor,
            # always return the best mask and let the user judge it
            conf=0.0,
            **prompts
        )

        if not results or results[0].masks is None or len(results[0].masks.data) == 0:
            return None, 0.0

        result = results[0]
        masks = result.masks.data  # (N, H, W) tensor scaled to original image size

        # Confidence scores are not always populated for promptable segmentation
        confidence = 1.0
        best_idx = 0
        if result.boxes is not None and result.boxes.conf is not None and len(result.boxes.conf) == len(masks):
            confs = result.boxes.conf.cpu().numpy()
            best_idx = int(np.argmax(confs))
            confidence = float(confs[best_idx])

        mask = masks[best_idx].cpu().numpy()
        return mask, confidence

    def predict_from_point(self, image_path, point_x, point_y, simplification_tolerance=2.0, model_size=None):
        """
        Predict segmentation mask from a single point

        Args:
            image_path: Path to image file
            point_x: X coordinate (normalized 0-1)
            point_y: Y coordinate (normalized 0-1)
            simplification_tolerance: Polygon simplification tolerance (pixels)
            model_size: Optional model key to use (defaults to current)

        Returns:
            dict with polygon points and metadata
        """
        self.load_model(model_size)

        if self.model is None:
            return {'error': 'SAM model not loaded'}

        try:
            image = cv2.imread(image_path)
            if image is None:
                return {'error': f'Could not read image: {image_path}'}
            height, width = image.shape[:2]

            # Convert normalized coordinates to pixel coordinates
            px = int(point_x * width)
            py = int(point_y * height)

            mask, confidence = self._predict(image_path, points=[[px, py]], labels=[1])
            if mask is None:
                return {'error': 'No mask predicted'}

            polygon = self._mask_to_polygon(mask, simplification_tolerance)

            normalized_polygon = [
                [x / width, y / height] for x, y in polygon
            ]

            return {
                'polygon': normalized_polygon,
                'confidence': confidence,
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
            model_size: Optional model key to use (defaults to current)

        Returns:
            dict with polygon points and metadata
        """
        self.load_model(model_size)

        if self.model is None:
            return {'error': 'SAM model not loaded'}

        try:
            image = cv2.imread(image_path)
            if image is None:
                return {'error': f'Could not read image: {image_path}'}
            img_height, img_width = image.shape[:2]

            # Convert YOLO bbox to xyxy format
            left = (x_center - width / 2) * img_width
            top = (y_center - height / 2) * img_height
            right = (x_center + width / 2) * img_width
            bottom = (y_center + height / 2) * img_height

            mask, confidence = self._predict(image_path, bboxes=[left, top, right, bottom])
            if mask is None:
                return {'error': 'No mask predicted'}

            polygon = self._mask_to_polygon(mask, simplification_tolerance)

            normalized_polygon = [
                [x / img_width, y / img_height] for x, y in polygon
            ]

            return {
                'polygon': normalized_polygon,
                'confidence': confidence,
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
        mask_uint8 = (mask > 0.5).astype(np.uint8) * 255

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


# Global SAM service instance
_sam_service = None


def get_sam_service():
    """Get or create SAM service singleton"""
    global _sam_service
    if _sam_service is None:
        _sam_service = SAMService()
    return _sam_service


def get_available_models():
    """Check which SAM models are downloaded"""
    models_dir = get_models_dir()

    available = []
    for model_key, model_info in SAM_MODELS.items():
        checkpoint_path = os.path.join(models_dir, model_info['checkpoint'])
        downloaded = os.path.exists(checkpoint_path)
        available.append({
            'key': model_key,
            'name': model_info['name'],
            'params': model_info['params'],
            'speed': model_info['speed'],
            'url': model_info['url'],
            'gated': model_info['source'] == 'huggingface',
            'downloaded': downloaded,
            'path': checkpoint_path if downloaded else None,
            'size_mb': round(os.path.getsize(checkpoint_path) / (1024 * 1024), 1) if downloaded else None
        })

    return available


def download_model(model_key, hf_token=None):
    """Download a specific SAM model checkpoint"""
    if model_key not in SAM_MODELS:
        return {'error': f'Unknown model: {model_key}'}

    model_info = SAM_MODELS[model_key]
    models_dir = get_models_dir()
    os.makedirs(models_dir, exist_ok=True)

    checkpoint_path = os.path.join(models_dir, model_info['checkpoint'])

    if os.path.exists(checkpoint_path):
        return {'status': 'already_exists', 'path': checkpoint_path}

    try:
        print(f"📥 Downloading {model_info['name']}...")

        if model_info['source'] == 'huggingface':
            # SAM3 is gated: requires an HF token with access to facebook/sam3
            from huggingface_hub import hf_hub_download
            token = hf_token or os.environ.get('HF_TOKEN') or None
            try:
                local_path = hf_hub_download(
                    repo_id=model_info['repo_id'],
                    filename=model_info['checkpoint'],
                    local_dir=models_dir,
                    token=token
                )
            except Exception as e:
                return {
                    'error': (
                        f"SAM3 download failed: {e}. SAM3 weights are license-gated — "
                        f"request access at {model_info['url']}, then set HF_TOKEN "
                        f"(or log in with `hf auth login`) and try again."
                    )
                }
            file_size_mb = round(os.path.getsize(local_path) / (1024 * 1024), 1)
            print(f"✅ Downloaded {model_info['name']} ({file_size_mb} MB)")
            return {'status': 'success', 'path': local_path, 'size_mb': file_size_mb}

        # Ultralytics-hosted checkpoints (SAM2.1) — direct download
        import subprocess
        result = subprocess.run(
            ['curl', '-L', '--fail', model_info['url'], '-o', checkpoint_path],
            capture_output=True,
            text=True
        )

        if result.returncode == 0 and os.path.exists(checkpoint_path):
            file_size_mb = round(os.path.getsize(checkpoint_path) / (1024 * 1024), 1)
            print(f"✅ Downloaded {model_info['name']} ({file_size_mb} MB)")
            return {'status': 'success', 'path': checkpoint_path, 'size_mb': file_size_mb}
        else:
            # Clean up partial download so a retry starts fresh
            if os.path.exists(checkpoint_path):
                os.remove(checkpoint_path)
            return {'error': f'Download failed: {result.stderr}'}

    except Exception as e:
        return {'error': str(e)}

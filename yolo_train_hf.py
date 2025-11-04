# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "torch",
#     "torchvision",
#     "opencv-python-headless",
#     "huggingface-hub",
#     "pillow",
#     "pyyaml",
#     "numpy<2.0",
#     "ultralytics",
# ]
# ///

"""
Train YOLO11 model on Hugging Face Jobs.

This UV script trains a YOLO11 model on a dataset from Hugging Face Hub.
The dataset should be in YOLO format with images and labels folders.

Features:
- 🚀 Train on HF Jobs infrastructure (GPU/TPU)
- 📦 Automatic dataset download from HF Hub
- 📊 Real-time training progress
- 💾 Upload trained model back to HF Hub
- ⚡ Supports all YOLO11 sizes (n/s/m/l/x)

Usage:
    hf jobs uv run --flavor t4-small --secrets HF_TOKEN \\
        yolo_train_hf.py \\
        dataset-name \\
        output-model-repo \\
        --model-size n \\
        --epochs 100

Example:
    hf jobs uv run --flavor a10g-small --secrets HF_TOKEN \\
        https://huggingface.co/.../yolo_train_hf.py \\
        wjbmattingly/my-yolo-dataset \\
        wjbmattingly/my-trained-model \\
        --model-size m \\
        --epochs 50 \\
        --batch-size 16
"""

import argparse
import os
import sys
import subprocess
from pathlib import Path

# Install system dependencies required by OpenCV
print("📦 Installing system dependencies for OpenCV...")
try:
    subprocess.run(
        ["apt-get", "update"],
        capture_output=True,
        check=True
    )
    subprocess.run(
        ["apt-get", "install", "-y", "libgl1", "libglib2.0-0"],
        capture_output=True,
        check=True
    )
    print("✅ System dependencies installed")
except Exception as e:
    print(f"⚠️  System dependencies installation: {e}")
    print("   Continuing anyway - may fail if OpenCV needs these libraries")

# Now uninstall opencv-python and ensure opencv-python-headless is used
try:
    subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "opencv-python"], 
                   capture_output=True, check=False)
    subprocess.run([sys.executable, "-m", "pip", "install", "--force-reinstall", "opencv-python-headless"], 
                   capture_output=True, check=True)
    print("✅ OpenCV headless version installed")
except Exception as e:
    print(f"⚠️  OpenCV fix: {e}")

from huggingface_hub import HfApi, login, snapshot_download
from ultralytics import YOLO


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train YOLO11 model on HuggingFace Jobs"
    )
    
    # Required arguments
    parser.add_argument(
        "dataset_repo",
        help="HuggingFace dataset repository (e.g., username/dataset-name)"
    )
    parser.add_argument(
        "output_repo",
        help="Output model repository (e.g., username/model-name)"
    )
    
    # Training configuration
    parser.add_argument(
        "--model-size",
        default="n",
        choices=["n", "s", "m", "l", "x"],
        help="YOLO model size: n(nano), s(small), m(medium), l(large), x(xlarge)"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=100,
        help="Number of training epochs"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for training"
    )
    parser.add_argument(
        "--image-size",
        type=int,
        default=640,
        help="Input image size"
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=50,
        help="Early stopping patience"
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Make output model repository private"
    )
    
    return parser.parse_args()


def download_dataset(dataset_repo: str, token: str = None) -> Path:
    """Download YOLO dataset from HuggingFace Hub"""
    print(f"📥 Downloading dataset from {dataset_repo}...")
    
    # Use snapshot_download to download entire repo with folder structure intact
    dataset_path = snapshot_download(
        repo_id=dataset_repo,
        repo_type="dataset",
        local_dir="dataset",
        token=token
    )
    
    dataset_path = Path(dataset_path)
    
    # Fix data.yaml to use absolute path
    import yaml
    data_yaml_path = dataset_path / "data.yaml"
    if data_yaml_path.exists():
        with open(data_yaml_path, 'r') as f:
            data_config = yaml.safe_load(f)
        
        # Update path to absolute path
        data_config['path'] = str(dataset_path.absolute())
        
        with open(data_yaml_path, 'w') as f:
            yaml.dump(data_config, f)
        
        print(f"✅ Updated data.yaml with absolute path: {dataset_path.absolute()}")
    
    print(f"✅ Dataset downloaded to {dataset_path}")
    return dataset_path


def find_data_yaml(dataset_path: Path) -> Path:
    """Find data.yaml file in dataset"""
    # Search for data.yaml
    for yaml_file in dataset_path.rglob("data.yaml"):
        print(f"✅ Found data.yaml at {yaml_file}")
        return yaml_file
    
    raise FileNotFoundError(f"data.yaml not found in {dataset_path}")


def train_yolo(
    dataset_path: Path,
    model_size: str,
    epochs: int,
    batch_size: int,
    image_size: int,
    patience: int
) -> Path:
    """Train YOLO model"""
    print(f"\n🏋️ Starting YOLO11-{model_size.upper()} training...")
    print(f"   Epochs: {epochs}")
    print(f"   Batch size: {batch_size}")
    print(f"   Image size: {image_size}")
    
    # Find data.yaml
    data_yaml = find_data_yaml(dataset_path)
    
    # Load YOLO model
    model_file = f"yolo11{model_size}.pt"
    print(f"📦 Loading {model_file}...")
    model = YOLO(model_file)
    
    # Train
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        batch=batch_size,
        imgsz=image_size,
        patience=patience,
        project="runs/train",
        name="yolo_hf_job",
        exist_ok=True,
        verbose=True,
        save=True,
        plots=True
    )
    
    # Get best model path
    best_model = Path("runs/train/yolo_hf_job/weights/best.pt")
    print(f"✅ Training complete! Best model: {best_model}")
    
    return best_model


def upload_model(
    model_path: Path,
    output_repo: str,
    model_size: str,
    epochs: int,
    private: bool,
    token: str = None
):
    """Upload trained model to HuggingFace Hub"""
    print(f"\n📤 Uploading model to {output_repo}...")
    
    api = HfApi(token=token)
    
    # Create repo
    try:
        api.create_repo(
            repo_id=output_repo,
            repo_type="model",
            private=private,
            exist_ok=True
        )
        print(f"✅ Created model repository: {output_repo}")
    except Exception as e:
        print(f"⚠️  Repository creation: {e}")
    
    # Upload model file
    api.upload_file(
        path_or_fileobj=str(model_path),
        path_in_repo="best.pt",
        repo_id=output_repo,
        repo_type="model"
    )
    
    # Upload training artifacts
    training_dir = model_path.parent.parent
    for file in ["args.yaml", "results.csv", "results.png"]:
        file_path = training_dir / file
        if file_path.exists():
            api.upload_file(
                path_or_fileobj=str(file_path),
                path_in_repo=file,
                repo_id=output_repo,
                repo_type="model"
            )
    
    # Create model card
    model_card = f"""---
tags:
- yolo
- object-detection
- ultralytics
- yolo11
library_name: ultralytics
license: agpl-3.0
---

# YOLO11-{model_size.upper()} Trained Model

This model was trained using YOLO11-{model_size.upper()} architecture on HuggingFace Jobs.

## Training Details

- **Model Size**: {model_size.upper()}
- **Epochs**: {epochs}
- **Framework**: Ultralytics YOLO11

## Usage

```python
from ultralytics import YOLO

# Load model
model = YOLO('{output_repo}/best.pt')

# Run inference
results = model('image.jpg')
```

## Training Results

See `results.csv` and `results.png` for detailed training metrics.
"""
    
    api.upload_file(
        path_or_fileobj=model_card.encode(),
        path_in_repo="README.md",
        repo_id=output_repo,
        repo_type="model"
    )
    
    print(f"✅ Model uploaded successfully!")
    print(f"🔗 View at: https://huggingface.co/{output_repo}")


def main():
    """Main training pipeline"""
    args = parse_args()
    
    print("="*60)
    print("🚀 YOLO11 Training on HuggingFace Jobs")
    print("="*60)
    print(f"Dataset: {args.dataset_repo}")
    print(f"Output: {args.output_repo}")
    print(f"Model: YOLO11-{args.model_size.upper()}")
    print("="*60)
    
    # Get HF token
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("❌ HF_TOKEN not found in environment!")
        print("   Token is required for downloading datasets and uploading models")
        sys.exit(1)
    
    # Login to HuggingFace
    print(f"🔐 Authenticating with HuggingFace...")
    print(f"   Token: ***{hf_token[-4:] if len(hf_token) > 4 else '***'}")
    login(token=hf_token)
    print("✅ Logged in to HuggingFace")
    
    try:
        # Download dataset
        dataset_path = download_dataset(args.dataset_repo, token=hf_token)
        
        # Train model
        model_path = train_yolo(
            dataset_path=dataset_path,
            model_size=args.model_size,
            epochs=args.epochs,
            batch_size=args.batch_size,
            image_size=args.image_size,
            patience=args.patience
        )
        
        # Upload model
        upload_model(
            model_path=model_path,
            output_repo=args.output_repo,
            model_size=args.model_size,
            epochs=args.epochs,
            private=args.private,
            token=hf_token
        )
        
        print("\n" + "="*60)
        print("✅ TRAINING COMPLETE!")
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ Training failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()


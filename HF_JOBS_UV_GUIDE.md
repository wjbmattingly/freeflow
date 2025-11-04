# Hugging Face Jobs with UV Scripts - Complete Guide

FreeFlow now uses **UV Scripts** to train YOLO models on Hugging Face Jobs! This is a modern, clean approach that's much more reliable than bash commands.

## What Changed? 🎉

### Old Approach (Deprecated)
- ❌ Complex bash commands with base64 encoding
- ❌ Manual dependency installation
- ❌ opencv-python library conflicts
- ❌ Temporary dataset zips

### New Approach (UV Scripts)
- ✅ Clean Python script with inline dependencies
- ✅ Automatic dependency resolution with UV
- ✅ Proper dataset repositories on HF Hub
- ✅ Trained models uploaded to HF Hub
- ✅ Following HF best practices

## How It Works

### 1. **Dataset Preparation**
Your annotated dataset is uploaded to Hugging Face Hub as a proper dataset:
```
https://huggingface.co/datasets/wjbmattingly/freeflow-dataset-1-job23
```

Structure:
```
dataset/
├── data.yaml          # YOLO config
├── images/
│   ├── train/        # Training images
│   ├── val/          # Validation images
│   └── test/         # Test images
└── labels/
    ├── train/        # Training labels
    ├── val/          # Validation labels
    └── test/         # Test labels
```

### 2. **UV Script Execution**
The `yolo_train_hf.py` script runs on HF Jobs:
- Downloads your dataset from HF Hub
- Trains YOLO11 model
- Uploads trained model to HF Hub

### 3. **Model Output**
Your trained model is saved to:
```
https://huggingface.co/wjbmattingly/freeflow-model-1-job23
```

Contains:
- `best.pt` - Best model weights
- `args.yaml` - Training configuration
- `results.csv` - Training metrics
- `results.png` - Training graphs
- `README.md` - Model card

## Using Your Trained Model

### From FreeFlow
Your model is automatically tracked in FreeFlow's training history.

### From Python
```python
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

# Download model from HF Hub
model_path = hf_hub_download(
    repo_id="wjbmattingly/freeflow-model-1-job23",
    filename="best.pt"
)

# Load and use
model = YOLO(model_path)
results = model('image.jpg')
```

### Direct from HF Hub
```python
from ultralytics import YOLO

# Load directly (requires huggingface_hub)
model = YOLO('hf://wjbmattingly/freeflow-model-1-job23/best.pt')
results = model.predict('image.jpg')
```

## Manual UV Script Usage

You can also run the UV script directly:

### Local Testing
```bash
# Install UV (if not already installed)
pip install uv

# Run locally (requires GPU)
uv run yolo_train_hf.py \\
    wjbmattingly/my-dataset \\
    wjbmattingly/my-model \\
    --model-size n \\
    --epochs 10 \\
    --batch-size 16
```

### On HF Jobs (Recommended)
```bash
# Quick test (10 epochs on T4)
hf jobs uv run --flavor t4-small --secrets HF_TOKEN \\
    yolo_train_hf.py \\
    wjbmattingly/my-dataset \\
    wjbmattingly/my-model \\
    --model-size n \\
    --epochs 10

# Full training (A10G)
hf jobs uv run --flavor a10g-large --secrets HF_TOKEN \\
    yolo_train_hf.py \\
    wjbmattingly/my-dataset \\
    wjbmattingly/my-model \\
    --model-size m \\
    --epochs 100 \\
    --batch-size 32

# Large model on A100
hf jobs uv run --flavor a100-large --secrets HF_TOKEN \\
    yolo_train_hf.py \\
    wjbmattingly/my-dataset \\
    wjbmattingly/my-model \\
    --model-size l \\
    --epochs 100 \\
    --batch-size 64
```

## UV Script Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `dataset_repo` | Required | Input dataset repository |
| `output_repo` | Required | Output model repository |
| `--model-size` | `n` | Model size: n/s/m/l/x |
| `--epochs` | `100` | Number of training epochs |
| `--batch-size` | `16` | Training batch size |
| `--image-size` | `640` | Input image size |
| `--patience` | `50` | Early stopping patience |
| `--private` | `False` | Make output repo private |

## Model Sizes

| Size | Parameters | Speed | Accuracy | Use Case |
|------|-----------|-------|----------|----------|
| n (nano) | 6.3M | Fastest | Good | Real-time, edge devices |
| s (small) | 11.2M | Fast | Better | Balanced |
| m (medium) | 20.1M | Moderate | Great | **Recommended** |
| l (large) | 25.3M | Slow | Excellent | High accuracy |
| x (xlarge) | 29.0M | Slowest | Best | Maximum quality |

## Hardware Recommendations

### For Testing (nano/small models)
- `t4-small` - Good for quick tests
- `l4x1` - Faster than T4

### For Production Training (medium/large)
- `a10g-small` - Good balance
- `a10g-large` - **Recommended** for most cases
- `a100-large` - For large models or big datasets

## Cost Estimates

Approximate costs for 100 epochs:

| Hardware | $/hour | Small Dataset | Large Dataset |
|----------|--------|---------------|---------------|
| t4-small | $0.60 | $0.30 | $1.20 |
| a10g-large | $1.20 | $0.60 | $2.40 |
| a100-large | $4.00 | $1.50 | $6.00 |

*Actual costs depend on dataset size, model complexity, and training time*

## Benefits of UV Scripts

### 1. **Reliability**
- No more "command not found" errors
- Automatic dependency management
- Clean Python code

### 2. **Reproducibility**
- Dependencies declared in script header
- Version-locked packages
- Same environment every time

### 3. **Best Practices**
- Follows HF ecosystem standards
- Proper dataset versioning
- Model cards and documentation

### 4. **Maintainability**
- Easy to read and modify
- Standard Python debugging
- Clear error messages

## Troubleshooting

### "UV script not found"
Make sure `yolo_train_hf.py` exists in your FreeFlow directory.

### "Dataset repo not found"
Check that the dataset was uploaded successfully. Visit:
```
https://huggingface.co/datasets/YOUR_USERNAME/freeflow-dataset-X-jobY
```

### "Out of memory"
- Reduce `--batch-size`
- Use smaller model size
- Use bigger GPU flavor

### Job fails immediately
- Check HF Pro subscription is active
- Verify API token has write permissions
- Check server logs for detailed error

## Advanced: Custom UV Script

You can modify `yolo_train_hf.py` to:
- Add custom training callbacks
- Implement different augmentation strategies
- Use custom loss functions
- Add experiment tracking (W&B, MLflow)

Example modification:
```python
# Add to yolo_train_hf.py
def train_yolo(...):
    # Your custom training logic
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        # Add custom parameters
        augment=True,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        # ... more custom settings
    )
```

## Resources

- [UV Documentation](https://docs.astral.sh/uv/)
- [HF Jobs Guide](https://huggingface.co/docs/huggingface_hub/en/guides/jobs)
- [YOLO11 Documentation](https://docs.ultralytics.com/)
- [UV Scripts Examples](https://huggingface.co/datasets/uv-scripts/ocr)

---

**Happy Training with UV Scripts! 🚀**


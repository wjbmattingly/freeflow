# SAM2 (Segment Anything 2) Setup Guide

## Overview
SAM2 integration provides real-time instance segmentation with two modes:
1. **Hover Preview**: Move mouse to preview segmentation in real-time
2. **Box to Polygon**: Draw a bounding box, press `S` to convert it to a precise polygon

## Installation

### Option 1: Install from PyPI (Recommended)
```bash
pip install sam2
```

### Option 2: Install from GitHub (Latest)
```bash
pip install git+https://github.com/facebookresearch/segment-anything-2.git
```

## Download Model Checkpoints

SAM2 requires downloading model weights. Choose one:

### Small Model (Faster, ~150MB)
```bash
mkdir -p models/sam2
cd models/sam2
wget https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_tiny.pt
wget https://dl.fbaipublicfiles.com/segment_anything_2/configs/sam2_hiera_t.yaml
```

### Large Model (Better quality, ~900MB)
```bash
mkdir -p models/sam2
cd models/sam2
wget https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt
wget https://dl.fbaipublicfiles.com/segment_anything_2/configs/sam2_hiera_l.yaml
```

## Configuration

Set environment variables to point to your model:

```bash
export SAM2_CHECKPOINT="models/sam2/sam2_hiera_large.pt"
export SAM2_CONFIG="models/sam2/sam2_hiera_l.yaml"
```

Or edit `sam2_service.py` directly:
```python
checkpoint = 'path/to/your/sam2_hiera_large.pt'
model_cfg = 'path/to/your/sam2_hiera_l.yaml'
```

## Fallback to SAM 1

If SAM2 is not available, the system will automatically fall back to SAM 1:

```bash
pip install segment-anything
# Download SAM 1 checkpoint
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth -P models/sam/
export SAM_CHECKPOINT="models/sam/sam_vit_h_4b8939.pth"
export SAM_MODEL_TYPE="vit_h"
```

## Usage

1. **Enable SAM2 Mode**: In the annotation page, check "Enable SAM2 Mode" in the right sidebar

2. **Hover Preview Mode**:
   - Select "Hover Preview (Point)" mode
   - Move your mouse over the image
   - SAM2 will automatically segment the object under your cursor
   - Click to confirm and create the annotation

3. **Box to Polygon Mode**:
   - Select "Box to Polygon" mode
   - Draw a bounding box around an object
   - Press `S` key to convert the box to a precise polygon
   - Adjust "Polygon Detail" slider for more/fewer points

4. **Polygon Detail Slider**:
   - **Coarse** (left): Fewer points, simpler polygons
   - **Fine** (right): More points, more detailed polygons

## Keyboard Shortcuts

- `S` - Convert selected box to polygon (SAM2 box mode only)
- `1-9` - Select class
- `Delete` - Delete annotation
- `Escape` - Deselect

## Troubleshooting

### "SAM model not loaded" error
- Make sure you've installed the SAM2 package
- Download the model checkpoints
- Set the correct paths in environment variables or `sam2_service.py`

### Slow performance
- Use a smaller model (sam2_hiera_tiny)
- Reduce polygon detail slider
- Ensure you have GPU support (CUDA)

### "Module not found" errors
Run the full installation:
```bash
pip install -r requirements.txt
pip install sam2
# Or for latest version
pip install git+https://github.com/facebookresearch/segment-anything-2.git
```

## System Requirements

- **GPU**: Recommended (CUDA-capable)
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: ~1GB for model weights
- **Python**: 3.8+
- **PyTorch**: 1.7+

## Performance Tips

1. **Use GPU**: SAM2 is much faster with CUDA
2. **Adjust detail level**: Lower detail = faster predictions
3. **Debouncing**: Hover mode waits 300ms before prediction to avoid excessive API calls
4. **Model size**: Tiny model is 5-10x faster than large model

## Architecture

```
Frontend (annotate.js)
    ↓ Mouse hover/box creation
SAM2 API (/api/projects/{id}/sam2/predict-*)
    ↓ Normalized coordinates + simplification tolerance
SAM2 Service (sam2_service.py)
    ↓ Load image, run SAM2 model
    ↓ Convert mask to polygon
    ↓ Simplify polygon based on tolerance
Database (Annotation.polygon_points)
    ↓ Store as JSON
Frontend Display
```

## Notes

- Polygon points are stored as normalized coordinates (0-1 range)
- Bounding box is still required (calculated from polygon bounds)
- Compatible with YOLO format exports (polygons can be converted)
- Polygons are rendered with transparency and outlines
- Selected polygons show vertex points for editing

## Future Enhancements

- [ ] Polygon vertex editing (drag points)
- [ ] Multi-point prompts for complex objects
- [ ] Negative prompts (exclude regions)
- [ ] Polygon smoothing algorithms
- [ ] Export in COCO segmentation format
- [ ] SAM2 video tracking mode

---

For more information, visit the [SAM2 GitHub repository](https://github.com/facebookresearch/segment-anything-2).




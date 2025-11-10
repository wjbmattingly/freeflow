#!/bin/bash
# Download SAM2 model checkpoint for local use

echo "📥 Downloading SAM2 checkpoint for FreeFlow..."
echo ""

# Create models directory
mkdir -p models/sam2

# Download SAM2 Large checkpoint (best quality, ~900MB)
# From Meta's official SAM2 release
cd models/sam2

if [ ! -f "sam2_hiera_large.pt" ]; then
    echo "Downloading sam2_hiera_large.pt (~900MB)..."
    echo "Source: https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
    
    curl -L "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt" \
         -o sam2_hiera_large.pt
    
    if [ $? -eq 0 ]; then
        echo "✅ SAM2 checkpoint downloaded successfully!"
    else
        echo "❌ Download failed. Trying alternative source..."
        # Fallback to GitHub release
        wget "https://github.com/facebookresearch/segment-anything-2/releases/download/v1.0/sam2_hiera_large.pt"
    fi
else
    echo "✅ sam2_hiera_large.pt already exists"
fi

# Download config file
if [ ! -f "sam2_hiera_l.yaml" ]; then
    echo ""
    echo "Downloading SAM2 config file..."
    curl -L "https://raw.githubusercontent.com/facebookresearch/segment-anything-2/main/sam2/configs/sam2.1/sam2.1_hiera_l.yaml" \
         -o sam2_hiera_l.yaml
    
    if [ $? -eq 0 ]; then
        echo "✅ Config file downloaded!"
    fi
fi

cd ../..

echo ""
echo "🎉 SAM2 setup complete!"
echo ""
echo "Model location: $(pwd)/models/sam2/sam2_hiera_large.pt"
echo "Config location: $(pwd)/models/sam2/sam2_hiera_l.yaml"
echo ""
echo "You can now use SAM2 for instance segmentation!"




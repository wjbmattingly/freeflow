#!/bin/bash

echo "🤖 Installing SAM2 (Segment Anything 2) for FreeFlow"
echo ""

# Install required packages
echo "📦 Installing shapely and scipy..."
pip install shapely scipy

# Install SAM2
echo "📦 Installing SAM2 from GitHub..."
pip install git+https://github.com/facebookresearch/segment-anything-2.git

echo ""
echo "✅ Installation complete!"
echo ""
echo "📥 Next steps:"
echo "1. Download SAM2 model checkpoint:"
echo "   mkdir -p models/sam2"
echo "   cd models/sam2"
echo "   wget https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_large.pt"
echo ""
echo "2. Restart your Flask server"
echo "3. Enable SAM2 mode in the annotation page"
echo ""
echo "For detailed setup instructions, see SAM2_SETUP.md"


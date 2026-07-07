#!/bin/bash
# Download SAM model checkpoints for FreeFlow.
#
# SAM3 (default, best quality) is license-gated on Hugging Face:
#   1. Request access at https://huggingface.co/facebook/sam3
#   2. Set HF_TOKEN (or log in with `hf auth login`)
#   3. Run this script
#
# SAM2.1 fallback models download freely from Ultralytics assets.

set -e

MODELS_DIR="${SAM_MODELS_DIR:-models/sam}"
mkdir -p "$MODELS_DIR"

echo "📥 Downloading SAM checkpoints for FreeFlow into $MODELS_DIR"
echo ""

# --- SAM3 (gated, ~3.5GB) ---
if [ ! -f "$MODELS_DIR/sam3.pt" ]; then
    echo "Downloading SAM3 (sam3.pt, ~3.5GB) from Hugging Face..."
    if command -v hf >/dev/null 2>&1; then
        hf download facebook/sam3 sam3.pt --local-dir "$MODELS_DIR" || SAM3_FAILED=1
    elif command -v huggingface-cli >/dev/null 2>&1; then
        huggingface-cli download facebook/sam3 sam3.pt --local-dir "$MODELS_DIR" || SAM3_FAILED=1
    else
        python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='facebook/sam3', filename='sam3.pt', local_dir='$MODELS_DIR')
" || SAM3_FAILED=1
    fi

    if [ -n "$SAM3_FAILED" ]; then
        echo ""
        echo "⚠️  SAM3 download failed. SAM3 weights are license-gated:"
        echo "   1. Request access at https://huggingface.co/facebook/sam3"
        echo "   2. export HF_TOKEN=hf_...   (or run: hf auth login)"
        echo "   3. Re-run this script"
        echo ""
        echo "   Falling back to SAM2.1 Tiny so segmentation still works."
    else
        echo "✅ SAM3 downloaded"
    fi
else
    echo "✅ sam3.pt already exists"
fi

# --- SAM2.1 Tiny fallback (free, ~150MB) ---
if [ ! -f "$MODELS_DIR/sam2.1_t.pt" ]; then
    echo ""
    echo "Downloading SAM2.1 Tiny fallback (sam2.1_t.pt)..."
    curl -L --fail "https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_t.pt" \
         -o "$MODELS_DIR/sam2.1_t.pt"
    echo "✅ SAM2.1 Tiny downloaded"
else
    echo "✅ sam2.1_t.pt already exists"
fi

echo ""
echo "🎉 SAM setup complete! Models in: $MODELS_DIR"

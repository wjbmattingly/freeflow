#!/bin/bash
# Test Dockerfile locally before pushing to HuggingFace

echo "🏗️  Building Docker image..."
docker build -t freeflow-test .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🚀 Starting container..."
    docker run -p 7860:7860 --rm freeflow-test
else
    echo "❌ Build failed!"
    exit 1
fi


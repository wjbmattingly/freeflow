#!/usr/bin/env python3
"""
Training script for Hugging Face Jobs
This script is executed on HF infrastructure
"""

import os
import sys
import yaml
import json
import argparse
from pathlib import Path

def train_on_hf():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epochs', type=int, required=True)
    parser.add_argument('--batch-size', type=int, required=True)
    parser.add_argument('--image-size', type=int, required=True)
    parser.add_argument('--model-size', type=str, required=True)
    parser.add_argument('--dataset-url', type=str, required=True)  # URL to download dataset
    parser.add_argument('--project-id', type=int, required=True)
    parser.add_argument('--job-id', type=int, required=True)
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("🚀 HUGGING FACE JOBS TRAINING")
    print("=" * 60)
    print(f"Model Size: {args.model_size}")
    print(f"Epochs: {args.epochs}")
    print(f"Batch Size: {args.batch_size}")
    print(f"Image Size: {args.image_size}")
    print(f"Project ID: {args.project_id}")
    print(f"Job ID: {args.job_id}")
    print("=" * 60)
    
    # Install dependencies
    print("\n📦 Installing dependencies...")
    os.system("pip install ultralytics torch torchvision --quiet")
    
    # Download dataset
    print(f"\n📥 Downloading dataset from {args.dataset_url}...")
    os.system(f"wget -q {args.dataset_url} -O dataset.zip")
    os.system("unzip -q dataset.zip -d dataset")
    
    # Find data.yaml
    data_yaml = None
    for root, dirs, files in os.walk("dataset"):
        if "data.yaml" in files:
            data_yaml = os.path.join(root, "data.yaml")
            break
    
    if not data_yaml:
        print("❌ Error: data.yaml not found in dataset")
        sys.exit(1)
    
    print(f"✅ Found data.yaml at {data_yaml}")
    
    # Train model
    from ultralytics import YOLO
    
    print(f"\n🏋️ Starting training...")
    model = YOLO(f"yolo11{args.model_size}.pt")
    
    results = model.train(
        data=data_yaml,
        epochs=args.epochs,
        batch=args.batch_size,
        imgsz=args.image_size,
        project="runs",
        name=f"job_{args.job_id}",
        exist_ok=True,
        verbose=True
    )
    
    print(f"\n✅ Training completed!")
    
    # Save model
    model_path = f"runs/job_{args.job_id}/weights/best.pt"
    if os.path.exists(model_path):
        print(f"✅ Model saved to {model_path}")
        
        # Read metrics
        results_csv = f"runs/job_{args.job_id}/results.csv"
        if os.path.exists(results_csv):
            print(f"📊 Metrics saved to {results_csv}")
    else:
        print(f"⚠️  Warning: Model not found at {model_path}")

if __name__ == "__main__":
    train_on_hf()


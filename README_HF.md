---
title: FreeFlow Annotation Platform
emoji: 🎯
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# 🎯 FreeFlow - AI-Powered Annotation Platform

A powerful, modern annotation platform with integrated SAM2 (Segment Anything 2) for intelligent polygon segmentation and YOLO model training capabilities.

## ✨ Features

- **Smart Annotation**: Draw bounding boxes or use AI-powered polygon segmentation
- **SAM2 Integration**: Real-time instance segmentation with multiple model sizes
- **YOLO Training**: Train custom object detection models directly in the browser
- **PDF Support**: Annotate multi-page PDF documents
- **Auto-Save**: Never lose your work with automatic saving
- **Label Assist**: Speed up annotation with AI predictions

## 🤖 SAM2 Models

This Space comes with the **SAM2 Tiny** model pre-installed (38MB, fastest inference). Additional models can be downloaded through the UI:

- **Tiny** (38.9M params) - ✅ Pre-installed
- **Small** (46M params) - Download on demand
- **Base+** (80.8M params) - Download on demand  
- **Large** (224.4M params) - Download on demand

## 🚀 Quick Start

1. Click "Create Project" to start a new annotation project
2. Upload your images or PDFs
3. Define your classes (objects to detect)
4. Enable SAM2 for intelligent segmentation
5. Start annotating!

## 🛠️ Usage

### Standard Annotation
- Draw bounding boxes around objects
- Assign classes to each annotation
- Navigate between images with arrow keys

### SAM2 Modes
1. **Hover Preview**: Move mouse to preview segmentation, click to save
2. **Box to Polygon**: Draw box, press 'S' to convert to precise polygon
3. **Auto Convert**: Draw box and it automatically converts to polygon

### Model Training
- Create dataset versions with train/val/test splits
- Train YOLO models with custom parameters
- Download trained models for deployment
- Evaluate model performance with confusion matrices

## 📦 Deployment Notes

This application is optimized for HuggingFace Spaces:
- Uses port 7860 (HF standard)
- SAM2 Tiny model downloaded on first startup
- Persistent storage for annotations and models
- SocketIO support for real-time training updates

## 🔧 Technical Stack

- **Backend**: Flask + SocketIO
- **Frontend**: Vanilla JavaScript
- **AI Models**: SAM2, YOLOv11
- **Database**: SQLite

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! This is an open-source project aimed at making annotation faster and more accurate.

---

**Note**: First startup may take 1-2 minutes while the SAM2 model downloads. Subsequent startups are instant!


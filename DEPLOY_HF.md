# 🚀 Deploying to HuggingFace Spaces

This guide will help you deploy FreeFlow to HuggingFace Spaces.

## Prerequisites

- A HuggingFace account (free): https://huggingface.co/join
- Git installed on your local machine
- Git LFS installed (for large files): `git lfs install`

## Step-by-Step Deployment

### 1. Create a New Space

1. Go to https://huggingface.co/spaces
2. Click "Create new Space"
3. Fill in the details:
   - **Space name**: `freeflow-annotation` (or your preferred name)
   - **License**: MIT
   - **Select the Space SDK**: Docker
   - **Space hardware**: CPU Basic (free) or upgrade for faster performance
   - **Visibility**: Public or Private

### 2. Clone Your New Space

```bash
git clone https://huggingface.co/spaces/YOUR-USERNAME/YOUR-SPACE-NAME
cd YOUR-SPACE-NAME
```

### 3. Copy Your Application Files

Copy these files from your FreeFlow directory to the cloned space:

```bash
# Core application files
cp app.py routes.py database.py models.py training.py sam2_service.py [space-directory]/

# Static and template files
cp -r static/ templates/ [space-directory]/

# Configuration files
cp requirements.txt Dockerfile .dockerignore [space-directory]/

# Rename README for HuggingFace
cp README_HF.md [space-directory]/README.md

# Optional: Copy assets
cp -r assets/ [space-directory]/
```

### 4. Commit and Push

```bash
cd [space-directory]
git add .
git commit -m "Initial deployment of FreeFlow"
git push
```

### 5. Wait for Build

HuggingFace Spaces will automatically:
1. Build your Docker container (3-5 minutes)
2. Download the SAM2 Tiny model on first startup (1-2 minutes)
3. Start your application

Watch the build progress in the "Logs" tab of your Space.

### 6. Access Your Application

Once deployed, your app will be available at:
```
https://huggingface.co/spaces/YOUR-USERNAME/YOUR-SPACE-NAME
```

## Configuration Options

### Environment Variables

You can set these in your Space settings:

- `SAM2_DEFAULT_MODEL`: Default model size (`tiny`, `small`, `base_plus`, `large`)
- `MAX_UPLOAD_SIZE`: Maximum file upload size in MB (default: 1000)

### Hardware Upgrades

For better performance, consider upgrading your Space hardware:

- **CPU Basic** (free): Good for light usage
- **CPU Upgrade** ($0.03/hr): Better performance
- **GPU T4** ($0.60/hr): Much faster SAM2 inference
- **GPU A10G** ($3/hr): Best performance for training

## Model Storage

### Pre-installed Models
- SAM2 Tiny (38MB) is downloaded automatically on first startup

### Downloading Additional Models
Users can download larger SAM2 models through the UI:
1. Enable SAM2 in the annotation interface
2. Select desired model from dropdown
3. Click "Download Model" if not already downloaded

### Model Locations
- SAM2 models: `/app/models/sam2/`
- Trained YOLO models: `/app/output_models/`
- User uploads: `/app/uploads/`
- Database: `/app/instance/`

## Persistent Storage

HuggingFace Spaces provides:
- **16GB persistent storage** (free tier)
- Data persists between container restarts
- Stored in: `/app/` directory

## Troubleshooting

### Build Failures

Check the build logs for errors. Common issues:
- Missing dependencies in `requirements.txt`
- Port not set to 7860
- Dockerfile syntax errors

### Application Won't Start

1. Check the "Logs" tab for error messages
2. Ensure port 7860 is exposed and bound correctly
3. Verify all required files are present

### SAM2 Not Working

1. Check if model downloaded successfully in logs
2. Try downloading model manually through UI
3. Upgrade to GPU hardware for faster inference

### Out of Storage

- Delete old training runs and datasets
- Use smaller SAM2 models
- Upgrade to paid tier for more storage

## Updating Your Deployment

To update your deployed application:

```bash
# Make changes locally
# Commit and push
git add .
git commit -m "Update: [describe changes]"
git push
```

HuggingFace will automatically rebuild and redeploy.

## Performance Tips

1. **Use GPU hardware** for SAM2 inference (much faster)
2. **Start with Tiny model** - smallest and fastest
3. **Limit concurrent users** on free tier
4. **Clean up old data** regularly to save storage
5. **Disable auto-save** for better performance under load

## Support

- HuggingFace Docs: https://huggingface.co/docs/hub/spaces
- FreeFlow Issues: [Your GitHub repo]

---

**Ready to Deploy?** Follow the steps above and your annotation platform will be live in minutes! 🎉


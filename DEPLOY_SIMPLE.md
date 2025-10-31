# 🚀 Simple HuggingFace Deployment from GitHub

The easiest way to deploy FreeFlow to HuggingFace Spaces.

## Prerequisites

- Your FreeFlow code pushed to GitHub
- HuggingFace account (free): https://huggingface.co/join

## Option A: Direct Push (Recommended)

This pushes your entire repo to HuggingFace:

### 1. Create Space on HuggingFace
- Go to https://huggingface.co/new-space
- Name: `freeflow-annotation`
- SDK: **Docker**
- Create Space

### 2. Push Your Code

```bash
cd /Users/wjm55/yale/freeflow

# Add HuggingFace as a remote
git remote add hf https://huggingface.co/spaces/YOUR-USERNAME/YOUR-SPACE-NAME

# Ensure README.md has the HF metadata
cp README_HF.md README.md

# Commit everything
git add .
git commit -m "Deploy to HuggingFace Spaces"

# Push to HuggingFace
git push hf main
```

### 3. Done! ✅

HuggingFace will automatically:
- Build your Docker container
- Download SAM2 model
- Start your app at: `https://huggingface.co/spaces/YOUR-USERNAME/YOUR-SPACE-NAME`

---

## Option B: Minimal Setup (Just Dockerfile + README)

If you want to keep your HF Space minimal and clone from GitHub:

### 1. Create a minimal Space with just these files:

**README.md** (copy README_HF.md):
```markdown
---
title: FreeFlow Annotation Platform
emoji: 🎯
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---
[Rest of README_HF.md content]
```

**Dockerfile**:
```dockerfile
FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git curl libgl1-mesa-glx libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Clone your GitHub repo
RUN git clone https://github.com/YOUR-USERNAME/freeflow.git /tmp/repo && \
    mv /tmp/repo/* /app/ && rm -rf /tmp/repo

RUN pip install --no-cache-dir -r requirements.txt gunicorn eventlet

RUN mkdir -p /app/models/sam2 /app/uploads /app/instance

ENV PYTHONUNBUFFERED=1
EXPOSE 7860

RUN echo '#!/bin/bash\n\
if [ ! -f "/app/models/sam2/sam2_hiera_tiny.pt" ]; then\n\
    curl -L "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt" \\\n\
         -o /app/models/sam2/sam2_hiera_tiny.pt\n\
fi\n\
exec gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:7860 app:app\n\
' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]
```

### 2. Push to HuggingFace:

```bash
# Clone your new space
git clone https://huggingface.co/spaces/YOUR-USERNAME/YOUR-SPACE-NAME
cd YOUR-SPACE-NAME

# Add the files
# (create README.md and Dockerfile as shown above)

git add .
git commit -m "Deploy from GitHub"
git push
```

---

## Which Method Should I Use?

### Use Option A (Direct Push) if:
✅ You want simplicity
✅ You're okay with having all files in the HF Space
✅ You want faster builds (no git clone needed)

### Use Option B (Clone from GitHub) if:
✅ You want to keep HF Space minimal
✅ Your main repo is on GitHub
✅ You want to manage code in one place

---

## After Deployment

1. Wait 2-3 minutes for first build
2. Check "Logs" tab if issues arise
3. Your app will be live at your Space URL

## Updating

**Option A**: Just push to HuggingFace
```bash
git push hf main
```

**Option B**: Push to GitHub, then rebuild Space
```bash
git push origin main
# Then restart your HF Space to pull latest code
```

---

**Need help?** Check DEPLOY_HF.md for detailed troubleshooting.


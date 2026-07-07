# Dockerfile for FreeFlow — works on HuggingFace Spaces, CasaOS, or plain Docker
# The app source is pulled from GitHub at build time (no local checkout needed):
#   docker build -t freeflow:latest https://github.com/wjbmattingly/freeflow.git
#
# Port is configurable:
#   - at build time:  docker build --build-arg PORT=8080 ...
#   - at run time:    docker run -e PORT=8080 -p 8080:8080 ...
#
# GPU support: torch's Linux wheels include CUDA. Run the container with GPU
# access (--gpus all, or the docker-compose.gpu.yml override) and the app
# detects it automatically at startup — no configuration needed.
FROM python:3.10-slim

# Install system dependencies for OpenCV and git (as root)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible dependency installs
RUN pip install --no-cache-dir uv

# Create non-root user (REQUIRED by HuggingFace Spaces)
RUN useradd -m -u 1000 user

# Set working directory
WORKDIR /app

# Clone your repository from GitHub (as root, before switching users)
ARG REPO_URL=https://github.com/wjbmattingly/freeflow
RUN git clone ${REPO_URL} /tmp/repo && \
    cd /tmp/repo && \
    cp -r . /app/ && \
    cd /app && \
    rm -rf /tmp/repo /app/.git

# Install Python dependencies with uv (into the system interpreter)
RUN uv pip install --system --no-cache -r pyproject.toml

# Create necessary directories with proper permissions
RUN mkdir -p /app/models/sam \
    /app/uploads \
    /app/instance \
    /app/datasets \
    /app/training_runs \
    /app/output_models

# Create startup script (before switching to non-root user)
RUN echo '#!/bin/bash\n\
PORT="${PORT:-7860}"\n\
echo "🚀 Starting FreeFlow Annotation Platform"\n\
echo ""\n\
echo "🔍 Checking for GPU..."\n\
python3 -c "import torch; print(f\"✅ GPU detected: {torch.cuda.get_device_name(0)} x{torch.cuda.device_count()}\") if torch.cuda.is_available() else print(\"ℹ️  No GPU detected - running on CPU\")"\n\
echo ""\n\
echo "📦 Checking SAM models..."\n\
mkdir -p /app/models/sam\n\
# SAM3 weights are license-gated; download them if an HF_TOKEN with access is provided\n\
if [ -n "$HF_TOKEN" ] && [ ! -f "/app/models/sam/sam3.pt" ]; then\n\
    echo "📥 Downloading SAM3 model (~3.5GB, requires access to facebook/sam3)..."\n\
    python3 -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id=\"facebook/sam3\", filename=\"sam3.pt\", local_dir=\"/app/models/sam\")" \\\n\
        && echo "✅ SAM3 model downloaded" \\\n\
        || echo "⚠️  SAM3 download failed (no access?) - falling back to SAM2.1"\n\
fi\n\
# Always ensure the free SAM2.1 Tiny fallback is available\n\
if [ ! -f "/app/models/sam/sam2.1_t.pt" ]; then\n\
    echo "📥 Downloading SAM2.1 Tiny fallback model..."\n\
    curl -L --fail "https://github.com/ultralytics/assets/releases/download/v8.3.0/sam2.1_t.pt" \\\n\
         -o /app/models/sam/sam2.1_t.pt \\\n\
        && echo "✅ SAM2.1 Tiny model downloaded" \\\n\
        || echo "⚠️  SAM model download failed - SAM features will be unavailable"\n\
else\n\
    echo "✅ SAM model already exists"\n\
fi\n\
echo ""\n\
echo "🗄️  Initializing database..."\n\
python3 init_db.py || echo "⚠️ Database init had issues"\n\
echo ""\n\
echo "🐍 Testing Python import..."\n\
python3 -c "import app; print(\"✅ App imports OK\")" || echo "❌ App import failed!"\n\
echo ""\n\
echo "🌐 Starting server on port ${PORT}..."\n\
exec gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:${PORT} --timeout 120 --access-logfile - --error-logfile - --log-level info app:app\n\
' > /app/start_docker.sh && chmod +x /app/start_docker.sh

# Verify static files exist (debugging)
RUN ls -la /app/static/ || echo "⚠️  Static folder not found!"

# Set proper ownership of all files to non-root user
RUN chown -R user:user /app

# Set environment variables
ENV FLASK_APP=app.py
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/models
ENV TORCH_HOME=/app/models
ENV SAM_MODELS_DIR=/app/models/sam

# Configurable port (build-arg sets the default; PORT env overrides at runtime)
ARG PORT=7860
ENV PORT=${PORT}
EXPOSE ${PORT}

# Switch to non-root user (REQUIRED by HuggingFace Spaces; CasaOS compose
# overrides this with user: "0:0" so bind-mounted volumes stay writable)
USER user
ENV HOME=/home/user

# Run the startup script
CMD ["/app/start_docker.sh"]

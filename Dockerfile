# Dockerfile for HuggingFace Spaces - Clone from GitHub
FROM python:3.10-slim

# Install system dependencies for SAM2 and git (as root)
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

# Create non-root user (REQUIRED by HuggingFace Spaces)
RUN useradd -m -u 1000 user

# Set working directory
WORKDIR /app

# Clone your repository from GitHub (as root, before switching users)
ARG REPO_URL=https://github.com/wjbmattingly/freeflow
RUN git clone ${REPO_URL} /tmp/repo && \
    mv /tmp/repo/* /tmp/repo/.* /app/ 2>/dev/null || true && \
    rm -rf /tmp/repo

# Install Python dependencies (as root)
RUN pip install --no-cache-dir -r requirements.txt

# Install gunicorn and eventlet for SocketIO support
RUN pip install --no-cache-dir gunicorn eventlet Flask-CORS

# Create necessary directories with proper permissions
RUN mkdir -p /app/models/sam2 \
    /app/uploads \
    /app/instance \
    /app/datasets \
    /app/training_runs \
    /app/output_models

# Create startup script (before switching to non-root user)
RUN echo '#!/bin/bash\n\
echo "🚀 Starting FreeFlow Annotation Platform on HuggingFace Spaces"\n\
echo ""\n\
echo "📦 Checking SAM2 models..."\n\
# Download tiny model by default (smallest, fastest)\n\
if [ ! -f "/app/models/sam2/sam2_hiera_tiny.pt" ]; then\n\
    echo "📥 Downloading SAM2 Tiny model (38MB)..."\n\
    mkdir -p /app/models/sam2\n\
    curl -L "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt" \\\n\
         -o /app/models/sam2/sam2_hiera_tiny.pt\n\
    if [ $? -eq 0 ]; then\n\
        echo "✅ SAM2 Tiny model downloaded"\n\
    else\n\
        echo "⚠️  SAM2 model download failed - SAM2 features will be unavailable"\n\
    fi\n\
else\n\
    echo "✅ SAM2 model already exists"\n\
fi\n\
echo ""\n\
echo "🗄️  Initializing database..."\n\
python3 init_db.py\n\
echo ""\n\
echo "🌐 Starting server on port 7860..."\n\
exec gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:7860 --timeout 120 --access-logfile - --error-logfile - app:app\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set proper ownership of all files to non-root user
RUN chown -R user:user /app

# Set environment variables
ENV FLASK_APP=app.py
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/models
ENV TORCH_HOME=/app/models
ENV SAM2_MODELS_DIR=/app/models/sam2
ENV HOME=/home/user

# Switch to non-root user (REQUIRED by HuggingFace Spaces)
USER user

# Expose port 7860 (HuggingFace Spaces standard)
EXPOSE 7860

# Run the startup script
CMD ["/app/start.sh"]


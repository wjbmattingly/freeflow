#!/bin/bash

# FreeFlow Startup Script (uv)

echo "🚀 Starting FreeFlow Annotation Platform..."
echo ""

# Require uv (https://docs.astral.sh/uv/)
if ! command -v uv >/dev/null 2>&1; then
    echo "❌ uv is not installed."
    echo "   Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Install/sync dependencies into .venv
echo "📦 Syncing dependencies with uv..."
uv sync

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Starting Flask server on http://localhost:5005"
echo "   Press Ctrl+C to stop the server"
echo ""

# Start the application
exec uv run python app.py

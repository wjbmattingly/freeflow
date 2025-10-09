#!/bin/bash

# FreeFlow Startup Script

echo "🚀 Starting FreeFlow Annotation Platform..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
if [ ! -f "venv/.installed" ]; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
    touch venv/.installed
else
    echo "Dependencies already installed."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Starting Flask server on http://localhost:5000"
echo "   Press Ctrl+C to stop the server"
echo ""

# Start the application
python app.py


#!/bin/bash

set -e

echo "🎥 Twitch Stream Service - Setup"
echo "=================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm $(npm --version) found"

# Check for FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is not installed"
    echo ""
    echo "Install FFmpeg:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  brew install ffmpeg"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "  sudo apt-get install ffmpeg  # Debian/Ubuntu"
        echo "  sudo yum install ffmpeg      # CentOS/RHEL"
    fi
    exit 1
fi

echo "✅ FFmpeg $(ffmpeg -version | head -n1 | awk '{print $3}') found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building TypeScript..."
npm run build

echo ""
echo "📁 Creating directories..."
mkdir -p videos logs overlays

echo ""
echo "⚙️  Setting up configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file - please edit with your Twitch stream key"
else
    echo ".env file already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your TWITCH_STREAM_KEY"
echo "  2. Add video files to the videos/ directory"
echo "  3. Run 'npm run dev' to test streaming"
echo "  4. Run 'scripts/install.sh' to install as system service"
echo ""

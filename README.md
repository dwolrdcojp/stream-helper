# Twitch Stream Service

A lightweight, 24/7 automated Twitch streaming service built with TypeScript and FFmpeg. Stream video files directly to Twitch without OBS, with minimal CPU and memory footprint.

> **Perfect for**: 24/7 streams, video marathons, automated content, testing stream setups, and running background streams without screen sharing.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Getting Your Twitch Stream Key](#getting-your-twitch-stream-key)
- [Common Workflows](#common-workflows)
- [Configuration Guide](#configuration-guide)
- [Service Management](#service-management)
- [Twitch Streaming Guidelines](#twitch-streaming-guidelines)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Development](#development)

## Features

- 🎥 **Direct RTMP Streaming** - No OBS required, streams directly to Twitch
- 🔍 **Preview Mode** - Test locally in your browser before going live
- 🔄 **24/7 Automation** - Runs as a system service with automatic restarts
- 📝 **Text Overlays** - Display current video name and custom text
- 🔁 **Playlist Management** - Loop, shuffle, and auto-detect new videos
- ⚡ **Low Resource Usage** - ~30-50MB memory footprint
- 🛡️ **Resilient** - Automatic retry with exponential backoff
- 💻 **Cross-Platform** - Works on both Linux and macOS
- 🔧 **Configurable** - Full control over bitrate, resolution, FPS, and more

## Requirements

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **FFmpeg** (Installation instructions below)
- **Twitch Stream Key** (only for live streaming - [How to get it](#getting-your-twitch-stream-key))

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Linux (CentOS/RHEL):**
```bash
sudo yum install ffmpeg
```

**Verify installation:**
```bash
ffmpeg -version
```

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd stream

# Install dependencies and setup
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The setup script will:
- Install npm dependencies
- Build the TypeScript code
- Create necessary directories (videos, logs, overlays)
- Create a `.env` file from the template

### 2. Test with Preview Mode (Recommended!)

Before going live, test everything locally:

```bash
# Add a test video
cp /path/to/your/video.mp4 videos/

# The .env file should already have PREVIEW_MODE=true
# Start the service
npm run dev
```

You should see:
```
🎥 Twitch Stream Service v1.0.0
================================

[Config] Loaded configuration
[Config] 🔍 PREVIEW MODE - Streaming locally at http://localhost:8080
[Playlist] Loaded 1 video(s)
  [1] your-video.mp4
[Preview] Server running at http://localhost:8080
[Preview] Open http://localhost:8080 in your browser
[Service] Starting stream...
```

**Open http://localhost:8080 in your browser** - You should see your video playing with the overlay showing the filename!

### 3. Go Live on Twitch

Once you're satisfied with the preview:

1. **Get your Twitch stream key** ([Instructions](#getting-your-twitch-stream-key))

2. **Edit `.env`:**
   ```bash
   PREVIEW_MODE=false
   TWITCH_STREAM_KEY=live_123456789_abcdefghijklmnopqrstuvwxyz
   ```

3. **Start streaming:**
   ```bash
   npm run dev
   ```

4. **Check your Twitch dashboard** - Your stream should be live!

### 4. Run as 24/7 Service (Optional)

To keep the stream running even after closing the terminal:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

The installer will:
- Create a system service (launchd on macOS, systemd on Linux)
- Configure auto-restart on failure
- Set up log file rotation
- Optionally enable auto-start on boot

## Getting Your Twitch Stream Key

1. Go to [Twitch Dashboard](https://dashboard.twitch.tv/)
2. Click on **Settings** → **Stream**
3. Under **Primary Stream Key**, click **Copy**
4. Paste it into your `.env` file as `TWITCH_STREAM_KEY`

**Security Warning:** Never share your stream key! Anyone with your key can stream to your channel.

## Common Workflows

### Running a 24/7 Video Marathon

```bash
# 1. Add all your videos
cp episode1.mp4 episode2.mp4 episode3.mp4 videos/

# 2. Configure looping in .env
LOOP_PLAYLIST=true
SHUFFLE_PLAYLIST=false  # Keep videos in order

# 3. Install as service
./scripts/install.sh

# 4. Start and forget!
# Service will automatically restart if it crashes
```

### Testing Different Overlay Styles

```bash
# Edit .env for different overlay positions
PREVIEW_MODE=true

# Top-left corner (default)
OVERLAY_POSITION=x=10:y=10

# Bottom-left corner
OVERLAY_POSITION=x=10:y=h-th-10

# Top-right corner
OVERLAY_POSITION=x=w-tw-10:y=10

# Bottom-right corner
OVERLAY_POSITION=x=w-tw-10:y=h-th-10

# Center
OVERLAY_POSITION=x=(w-tw)/2:y=(h-th)/2

# Run preview to test
npm run dev
```

### Adding Videos While Streaming

The service automatically detects new videos:

```bash
# While the service is running, just add videos
cp new-video.mp4 videos/

# Check logs to see it was detected
tail -f logs/service.log
```

You'll see: `[Playlist] Directory change detected: add - new-video.mp4`

### Switching Between Preview and Live

```bash
# Test in preview
PREVIEW_MODE=true npm run dev

# Ctrl+C to stop

# Go live
PREVIEW_MODE=false npm run dev
```

Or use environment variable override:
```bash
PREVIEW_MODE=true npm run dev  # Preview
PREVIEW_MODE=false npm run dev # Live
```

## Configuration Guide

### Video Quality Recommendations

Choose settings based on your upload speed:

**High Quality (6+ Mbps upload):**
```bash
VIDEO_BITRATE=6000k
AUDIO_BITRATE=160k
RESOLUTION=1920x1080
FPS=60
PRESET=fast
```

**Standard Quality (3-6 Mbps upload):**
```bash
VIDEO_BITRATE=3000k
AUDIO_BITRATE=160k
RESOLUTION=1920x1080
FPS=30
PRESET=veryfast
```

**Low Bandwidth (< 3 Mbps upload):**
```bash
VIDEO_BITRATE=2000k
AUDIO_BITRATE=128k
RESOLUTION=1280x720
FPS=30
PRESET=veryfast
```

**Test your upload speed:** [Fast.com](https://fast.com) or [Speedtest.net](https://speedtest.net)

### Preview Mode Settings

```bash
PREVIEW_MODE=false          # Set to true to test locally
PREVIEW_PORT=8080           # Local preview server port
PREVIEW_DIR=./preview       # Directory for HLS files
```

**When PREVIEW_MODE=true:**
- ✅ No Twitch stream key required
- ✅ View at `http://localhost:8080`
- ✅ Same quality as live mode
- ✅ See overlays in real-time
- ✅ No internet bandwidth used

### Twitch Settings

```bash
TWITCH_STREAM_KEY=live_xxxxx  # Get from Twitch Dashboard
TWITCH_SERVER=rtmp://live.twitch.tv/app
```

**Regional Servers** (optional, for better latency):
- US West: `rtmp://live-sjc.twitch.tv/app`
- US East: `rtmp://live-iad.twitch.tv/app`
- EU: `rtmp://live-fra.twitch.tv/app`
- Asia: `rtmp://live-sin.twitch.tv/app`

### Hardware Acceleration

Dramatically reduces CPU usage:

```bash
# macOS (recommended for Mac users)
HW_ACCEL=videotoolbox

# Linux with Intel/AMD GPU
HW_ACCEL=vaapi

# No hardware acceleration (works everywhere)
HW_ACCEL=none
```

**CPU Usage Comparison:**
- Software (`none`): 40-80% CPU
- Hardware (`videotoolbox`/`vaapi`): 5-15% CPU

### Overlay Customization

```bash
OVERLAY_ENABLED=true
OVERLAY_FONT_SIZE=24              # Size in pixels
OVERLAY_POSITION=x=10:y=10        # Top-left corner
OVERLAY_COLOR=white               # Text color
OVERLAY_FONT=/path/to/font.ttf    # Optional custom font
```

**Common Colors:** white, black, yellow, red, blue, green

**Position Examples:**
- Top-left: `x=10:y=10`
- Top-right: `x=w-tw-10:y=10`
- Bottom-left: `x=10:y=h-th-10`
- Bottom-right: `x=w-tw-10:y=h-th-10`

### Playlist Management

```bash
VIDEO_DIR=./videos              # Where to look for videos
LOOP_PLAYLIST=true              # Restart playlist when finished
SHUFFLE_PLAYLIST=false          # Randomize order
```

**Supported Formats:** MP4, MKV, AVI, MOV, FLV, WebM, M4V

### Reliability Settings

```bash
HEALTH_CHECK_INTERVAL=30000     # Check every 30 seconds
MAX_RETRIES=10                  # Retry up to 10 times
RETRY_BACKOFF_MS=5000          # Start with 5s delay, then exponential
```

**Exponential Backoff:** 5s → 10s → 20s → 40s → 80s...

### Logging

```bash
LOG_DIR=./logs
LOG_LEVEL=info          # debug | info | warn | error
```

- **debug**: See all FFmpeg output (verbose)
- **info**: Normal operation logs
- **warn**: Warnings only
- **error**: Errors only

## Service Management

### macOS (launchd)

```bash
# Install service (one-time)
./scripts/install.sh

# Start streaming
launchctl load ~/Library/LaunchAgents/com.stream.service.plist

# Stop streaming
launchctl unload ~/Library/LaunchAgents/com.stream.service.plist

# View live logs
tail -f logs/service.log

# Check if running
launchctl list | grep stream

# Remove service
launchctl unload ~/Library/LaunchAgents/com.stream.service.plist
rm ~/Library/LaunchAgents/com.stream.service.plist
```

### Linux (systemd)

```bash
# Install service (one-time)
./scripts/install.sh

# Start streaming
systemctl --user start stream

# Stop streaming
systemctl --user stop stream

# Restart streaming
systemctl --user restart stream

# Auto-start on boot
systemctl --user enable stream

# Disable auto-start
systemctl --user disable stream

# View status
systemctl --user status stream

# View live logs
journalctl --user -u stream -f

# Remove service
systemctl --user stop stream
systemctl --user disable stream
rm ~/.config/systemd/user/stream.service
systemctl --user daemon-reload
```

## Twitch Streaming Guidelines

### Twitch Requirements

- **Minimum bitrate:** 2500 kbps
- **Maximum bitrate:** 6000 kbps (for non-partners)
- **Recommended resolution:** 1920x1080 or 1280x720
- **Frame rate:** 30 or 60 FPS
- **Audio:** 128-160 kbps, 44.1kHz or 48kHz

### Recommended Settings by Twitch

**1080p60 (Partners/Affiliates):**
```bash
VIDEO_BITRATE=6000k
RESOLUTION=1920x1080
FPS=60
```

**1080p30 (Most users):**
```bash
VIDEO_BITRATE=4500k
RESOLUTION=1920x1080
FPS=30
```

**720p30 (Lower bandwidth):**
```bash
VIDEO_BITRATE=3000k
RESOLUTION=1280x720
FPS=30
```

### Testing Your Stream Quality

1. **Preview mode first:** Always test in preview mode
2. **Check Twitch Inspector:** https://inspector.twitch.tv
3. **Monitor for dropped frames:** Should be < 1%
4. **Test for 5-10 minutes:** Ensure stability

## Troubleshooting

### Stream Not Starting

**Problem:** Service starts but doesn't stream

**Solutions:**
1. Check Twitch stream key: `echo $TWITCH_STREAM_KEY`
2. Verify FFmpeg is installed: `ffmpeg -version`
3. Check logs: `tail -f logs/service.log`
4. Test in preview mode first: `PREVIEW_MODE=true`
5. Ensure videos exist: `ls -la videos/`

### Preview Mode Not Loading

**Problem:** http://localhost:8080 doesn't load

**Solutions:**
1. Check service is running: Look for "Preview Server running" message
2. Verify port is free: `lsof -i :8080`
3. Try different port: `PREVIEW_PORT=3000`
4. Check firewall settings
5. Use `http://127.0.0.1:8080` instead of localhost

### High CPU Usage

**Problem:** CPU at 80-100%

**Solutions:**
1. Enable hardware acceleration:
   ```bash
   # macOS
   HW_ACCEL=videotoolbox

   # Linux
   HW_ACCEL=vaapi
   ```
2. Use faster preset: `PRESET=ultrafast`
3. Lower bitrate: `VIDEO_BITRATE=2500k`
4. Reduce resolution: `RESOLUTION=1280x720`
5. Lower FPS: `FPS=30`

### Stream Buffering/Stuttering

**Problem:** Stream lags or buffers on Twitch

**Solutions:**
1. Check upload speed (should be 2x your bitrate)
2. Lower bitrate: `VIDEO_BITRATE=3000k`
3. Use closer server (see [Twitch Settings](#twitch-settings))
4. Check system load: `top` or `htop`
5. Verify video codec: `ffmpeg -i your-video.mp4` (should be H.264)

### FFmpeg Errors

**Problem:** FFmpeg crashes or shows errors

**Solutions:**
1. Enable debug logging:
   ```bash
   LOG_LEVEL=debug npm run dev
   ```
2. Check video file integrity:
   ```bash
   ffmpeg -v error -i your-video.mp4 -f null -
   ```
3. Re-encode problematic videos:
   ```bash
   ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4
   ```
4. Update FFmpeg: `brew upgrade ffmpeg` or `sudo apt upgrade ffmpeg`

### Service Won't Stay Running

**Problem:** Service stops unexpectedly

**Solutions:**
1. Check service logs:
   ```bash
   # macOS
   tail -f logs/service-error.log

   # Linux
   journalctl --user -u stream --no-pager
   ```
2. Verify `.env` file exists and is valid
3. Check file permissions: `ls -la .env`
4. Increase retry limit: `MAX_RETRIES=20`
5. Check system resources: `free -h` (Linux) or `vm_stat` (macOS)

### No Videos Found

**Problem:** "No video files found in ./videos"

**Solutions:**
1. Check video directory: `ls -la videos/`
2. Verify file formats are supported (MP4, MKV, AVI, MOV, FLV, WebM, M4V)
3. Check permissions: `chmod 644 videos/*.mp4`
4. Use absolute path: `VIDEO_DIR=/full/path/to/videos`

## FAQ

### Can I stream to platforms other than Twitch?

Yes! Just change the `TWITCH_SERVER` to any RTMP endpoint:

```bash
# YouTube Live
TWITCH_SERVER=rtmp://a.rtmp.youtube.com/live2

# Facebook Live
TWITCH_SERVER=rtmps://live-api-s.facebook.com:443/rtmp

# Custom RTMP server
TWITCH_SERVER=rtmp://your-server.com/live
```

### How much bandwidth do I need?

Your upload speed should be at least **1.5x your video bitrate**:

- 3000k bitrate = 4.5 Mbps upload minimum
- 4500k bitrate = 6.75 Mbps upload minimum
- 6000k bitrate = 9 Mbps upload minimum

### Can I stream multiple videos simultaneously?

Not with a single instance. But you can:
1. Clone the repo to another directory
2. Use different ports and directories
3. Run multiple instances

### Does this work on Windows?

Not natively, but you can use:
- WSL2 (Windows Subsystem for Linux)
- Docker container (coming soon)

### How do I update videos without restarting?

Just add files to the `videos/` directory - they're auto-detected! The new videos will be added to the playlist automatically.

### Can I use this with OBS?

Yes, but it defeats the purpose. This tool replaces OBS for file-based streaming. If you need OBS features (camera, screen capture, etc.), use OBS instead.

### Is there a way to schedule streams?

Yes! Use cron (Linux/macOS) to start/stop the service:

```bash
# Start stream at 8 PM daily
0 20 * * * launchctl load ~/Library/LaunchAgents/com.stream.service.plist

# Stop stream at 2 AM daily
0 2 * * * launchctl unload ~/Library/LaunchAgents/com.stream.service.plist
```

### What happens if a video file is corrupted?

The service will:
1. Log the error
2. Skip to the next video
3. Retry based on your `MAX_RETRIES` setting
4. Continue streaming

### Can I stream to multiple platforms at once?

Not directly, but you can use a restreaming service like:
- Restream.io
- StreamYard
- OBS.Ninja

Or run multiple instances of this service.

## Development

### Project Structure

```
stream/
├── src/                    # TypeScript source
│   ├── index.ts           # Main service orchestrator
│   ├── streamer.ts        # FFmpeg process manager
│   ├── playlist.ts        # Video queue + file watching
│   ├── overlay.ts         # Dynamic text overlays
│   ├── monitor.ts         # Health checks + retry logic
│   ├── config.ts          # Environment configuration
│   ├── preview-server.ts  # HTTP server for preview mode
│   └── types.ts           # TypeScript interfaces
├── dist/                  # Compiled JavaScript (generated)
├── videos/                # Your video files
├── preview/               # HLS files (preview mode)
├── logs/                  # Service logs
├── overlays/              # Overlay text files
├── services/              # systemd/launchd templates
└── scripts/               # Setup and installation
```

### Available Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx (no build needed)
npm start           # Run compiled version from dist/
npm run watch       # Auto-compile on file changes
npm run clean       # Remove dist/ directory
```

### Making Changes

1. **Edit TypeScript files** in `src/`
2. **Test changes:** `npm run dev`
3. **Build for production:** `npm run build`
4. **Reinstall service:** `./scripts/install.sh`

### Debugging

```bash
# Enable verbose logging
LOG_LEVEL=debug npm run dev

# Check FFmpeg command being used
# Look for "[FFmpeg]" in the output

# Test a single video
rm videos/*.mp4
cp test.mp4 videos/
npm run dev
```

## Performance Optimization

### Minimal Resource Configuration

For the lowest CPU and memory usage:

```bash
HW_ACCEL=videotoolbox       # or vaapi on Linux
PRESET=ultrafast
VIDEO_BITRATE=2500k
RESOLUTION=1280x720
FPS=30
OVERLAY_ENABLED=false       # Overlays add ~5% CPU
```

**Expected usage:** ~25-35MB RAM, ~5-10% CPU

### Maximum Quality Configuration

For the best possible quality:

```bash
HW_ACCEL=none               # Software encoding = better quality
PRESET=slow                 # Slower = better compression
VIDEO_BITRATE=6000k
RESOLUTION=1920x1080
FPS=60
OVERLAY_ENABLED=true
```

**Expected usage:** ~50-80MB RAM, ~60-80% CPU

## Security Notes

- ⚠️ **Never commit** your `.env` file or Twitch stream key to git
- ✅ `.env` is already in `.gitignore`
- ✅ Service runs with user permissions (not root)
- ✅ Stream key is only stored locally in `.env`
- 🔒 Use environment variables for CI/CD deployments

## License

MIT

## Support

- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-repo/discussions)
- **Twitch API:** [Twitch Developer Docs](https://dev.twitch.tv/docs/)
- **FFmpeg Help:** [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

---

**Made with ❤️ for streamers who want to automate their content**

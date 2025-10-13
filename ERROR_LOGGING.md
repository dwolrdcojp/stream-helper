# Enhanced Error Logging

## Overview

The stream-helper now includes comprehensive error logging to help diagnose issues when videos crash or skip during streaming.

## What's Been Improved

### 1. **Detailed Error Reports**
When a stream fails, you'll now get a comprehensive error report that includes:

```
╔════════════════════════════════════════════════════════════════╗
║                    STREAM ERROR REPORT                         ║
╚════════════════════════════════════════════════════════════════╝

📹 Video: /path/to/video.mp4
⏱️  Stream Duration: 00:15:32 / 00:45:00
📊 Completion: 34.4%
🕐 Elapsed Time: 932.1s
🕐 Timestamp: 2025-10-13T19:30:45.123Z

📝 Input File Metadata:
   Container: mp4
   Video Codec: mpeg4
   Audio Codec: mp2
   Resolution: 640x480
   FPS: 29.97
   Sample Rate: 44100 Hz

🔴 Error Details:
   Type: FFmpeg Exit Error
   Exit Code: 1

🔍 FFmpeg Error Messages:
   [h264_nvenc @ 0x...] Cannot load libcuda.so.1
   [h264_nvenc @ 0x...] Failed to create encoder
   Error initializing output stream 0:0 -- Error while opening encoder

📋 Last FFmpeg Output:
   frame= 1234 fps= 30 q=28.0 size=   45678kB time=00:00:41.13 bitrate=...
   ...

💡 Possible Causes:
   • NVENC hardware encoder error
   • Try setting HW_ACCEL=none in .env
   • GPU may be overloaded or driver issue

╚════════════════════════════════════════════════════════════════╝
```

### 2. **Video Metadata Capture**
The system now automatically parses and logs:
- Input container format (mp4, mkv, avi, etc.)
- Video codec (h264, mpeg4, mpeg1video, etc.)
- Audio codec (aac, mp2, mp3, etc.)
- Resolution and FPS
- Audio sample rate
- Total video duration

### 3. **Progress Tracking**
- Tracks how long each video has been streaming
- Shows completion percentage when errors occur
- Detects if videos end prematurely (< 98% complete)

### 4. **Intelligent Error Diagnosis**
The system analyzes FFmpeg output and provides context-aware suggestions:

| Error Pattern | Suggested Fix |
|--------------|---------------|
| SIGKILL signal | Out of memory - reduce VIDEO_BITRATE or disable HW_ACCEL |
| Invalid data found | Corrupted file or incompatible codec - re-encode |
| NVENC errors | GPU issue - set HW_ACCEL=none |
| RTMP/Connection errors | Network issue - check stream key and server |
| Conversion failed | Unsupported format - re-encode file |
| Early termination | Filter chain issue - check input resolution/fps |

### 5. **Service-Level Logging**
Enhanced start/completion/failure messages:

```
======================================================================
▶️  Starting: Drift Heaven Vol. 6.mp4
   Path: /home/max/repos/stream-helper/videos/Drift Heaven Vol. 6.mp4
   Start Time: 2025-10-13T19:30:00.000Z
======================================================================

... streaming ...

======================================================================
✅ Completed: Drift Heaven Vol. 6.mp4
   Duration: 00:45:23
   End Time: 2025-10-13T20:15:23.456Z
======================================================================
```

Or on failure:

```
======================================================================
❌ Stream Failed: Drift Heaven Vol. 6.mp4
   Duration Before Failure: 00:15:32
   Failure Time: 2025-10-13T19:45:32.123Z
======================================================================

[Service] 🔄 Moving to next video (retry 1/10)
[Service] ⏳ Backoff delay: 00:00:05
```

## How to Use

### Debug Mode
For maximum verbosity, set in `.env`:
```bash
LOG_LEVEL=debug
```

This will print:
- Full FFmpeg command
- All FFmpeg stderr output in real-time
- Detailed progress information

### Normal Mode (Recommended)
```bash
LOG_LEVEL=info
```

Shows:
- Start/completion messages
- Full error reports when failures occur
- Retry information

### Production Mode
```bash
LOG_LEVEL=warn
```

Only shows warnings and errors.

## Example Error Scenarios

### Scenario 1: Incompatible Codec
**Video**: MPEG-1 video with MP2 audio  
**Error**: Conversion failed  
**Report Shows**:
- Input codec details (mpeg1video, mp2)
- Exact FFmpeg error about audio resampling
- Suggestion to re-encode the file

### Scenario 2: GPU Overload
**Video**: 4K video with NVENC enabled  
**Error**: h264_nvenc initialization failed  
**Report Shows**:
- NVENC-specific error messages
- GPU driver information
- Suggestion to disable HW_ACCEL

### Scenario 3: Network Issues
**Video**: Any  
**Error**: RTMP connection refused  
**Report Shows**:
- Network error details
- Last successful frame streamed
- Suggestion to check stream key/server

## Monitoring Tips

1. **Watch for patterns**: If specific videos always fail at the same point, it's likely a file issue
2. **Check completion %**: Videos failing at < 10% suggest initialization errors (codecs, GPU)
3. **Check completion %**: Videos failing at > 50% suggest resource exhaustion or network issues
4. **Monitor retry counts**: Consistent failures suggest configuration problems

## Next Steps

When you encounter errors:

1. **Read the error report carefully** - it provides context-specific suggestions
2. **Check the metadata section** - incompatible codecs are often the root cause
3. **Try the suggested fixes** - they're based on the actual error patterns
4. **Enable debug logging** - if you need more details
5. **Share error reports** - they contain all info needed for bug fixes

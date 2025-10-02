import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import type { StreamConfig } from './types.js';

export class PreviewServer {
  private server: ReturnType<typeof createServer> | null = null;
  private config: StreamConfig;

  constructor(config: StreamConfig) {
    this.config = config;
  }

  /**
   * Start the preview HTTP server
   */
  start(): void {
    if (this.server) {
      throw new Error('Preview server already running');
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.config.previewPort, () => {
      console.log(`[Preview] Server running at http://localhost:${this.config.previewPort}`);
      console.log(`[Preview] Open http://localhost:${this.config.previewPort} in your browser`);
    });

    this.server.on('error', (error) => {
      console.error('[Preview] Server error:', error);
    });
  }

  /**
   * Stop the preview server
   */
  stop(): Promise<void> {
    if (!this.server) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log('[Preview] Server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';

    if (url === '/' || url === '/index.html') {
      this.servePreviewPage(res);
    } else if (url.startsWith('/preview/')) {
      // Serve HLS files from preview directory
      const filename = url.substring('/preview/'.length);
      this.serveFile(res, join(this.config.previewDir, filename));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  /**
   * Serve the preview HTML page
   */
  private servePreviewPage(res: ServerResponse): void {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stream Preview</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0e0e10;
            color: #efeff1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            width: 100%;
        }
        h1 {
            text-align: center;
            margin-bottom: 20px;
            color: #9147ff;
        }
        .video-container {
            position: relative;
            width: 100%;
            padding-bottom: 56.25%; /* 16:9 aspect ratio */
            background: #18181b;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        video {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }
        .info {
            margin-top: 20px;
            padding: 20px;
            background: #18181b;
            border-radius: 8px;
            text-align: center;
        }
        .status {
            display: inline-block;
            padding: 6px 12px;
            background: #00c853;
            color: white;
            border-radius: 4px;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .message {
            color: #adadb8;
            margin-top: 10px;
        }
        .error {
            background: #f44336;
        }
        .waiting {
            background: #ff9800;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
    <div class="container">
        <h1>🎥 Stream Preview</h1>
        <div class="video-container">
            <video id="video" controls autoplay muted></video>
        </div>
        <div class="info">
            <div class="status" id="status">● CONNECTING</div>
            <div class="message" id="message">Waiting for stream...</div>
        </div>
    </div>

    <script>
        const video = document.getElementById('video');
        const status = document.getElementById('status');
        const message = document.getElementById('message');
        const streamUrl = '/preview/stream.m3u8';

        function updateStatus(state, text, msg) {
            status.className = 'status ' + state;
            status.textContent = '● ' + text;
            message.textContent = msg;
        }

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 10,
                maxMaxBufferLength: 30,
            });

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                updateStatus('', 'LIVE', 'Stream is playing');
                video.play().catch(err => {
                    console.log('Auto-play prevented:', err);
                    updateStatus('waiting', 'READY', 'Click play to start');
                });
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            updateStatus('waiting', 'CONNECTING', 'Waiting for stream...');
                            setTimeout(() => hls.loadSource(streamUrl), 2000);
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            updateStatus('waiting', 'RECOVERING', 'Recovering from media error...');
                            hls.recoverMediaError();
                            break;
                        default:
                            updateStatus('error', 'ERROR', 'Fatal error: ' + data.type);
                            break;
                    }
                }
            });

            video.addEventListener('playing', () => {
                updateStatus('', 'LIVE', 'Stream is playing');
            });

            video.addEventListener('waiting', () => {
                updateStatus('waiting', 'BUFFERING', 'Buffering...');
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = streamUrl;
            video.addEventListener('loadedmetadata', () => {
                updateStatus('', 'LIVE', 'Stream is playing');
                video.play();
            });
            video.addEventListener('error', () => {
                updateStatus('waiting', 'CONNECTING', 'Waiting for stream...');
                setTimeout(() => {
                    video.src = streamUrl;
                }, 2000);
            });
        } else {
            updateStatus('error', 'ERROR', 'HLS not supported in this browser');
        }
    </script>
</body>
</html>
    `;

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
  }

  /**
   * Serve a file from filesystem
   */
  private serveFile(res: ServerResponse, filePath: string): void {
    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    try {
      const stats = statSync(filePath);
      const ext = extname(filePath);
      const contentType = this.getContentType(ext);

      const content = readFileSync(filePath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });

      res.end(content);
    } catch (error) {
      console.error('[Preview] Error serving file:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  /**
   * Get MIME type for file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.m3u8': 'application/vnd.apple.mpegurl',
      '.ts': 'video/mp2t',
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
    };

    return types[ext] || 'application/octet-stream';
  }
}

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import type { StreamConfig, FFmpegOptions } from './types.js';

export class Streamer {
  private process: ChildProcess | null = null;
  private config: StreamConfig;
  private currentVideoPath: string | null = null;
  private overlayTextFile: string;

  constructor(config: StreamConfig, overlayTextFile: string) {
    this.config = config;
    this.overlayTextFile = overlayTextFile;
  }

  /**
   * Start streaming a video file to Twitch
   */
  async start(videoPath: string): Promise<void> {
    if (this.process) {
      throw new Error('Stream already running');
    }

    if (!existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    this.currentVideoPath = videoPath;
    const args = this.buildFFmpegArgs(videoPath);

    this.process = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.setupProcessHandlers();
  }

  /**
   * Stop the current stream
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.once('exit', () => {
        this.process = null;
        this.currentVideoPath = null;
        resolve();
      });

      // Send 'q' to gracefully quit FFmpeg
      this.process.stdin?.write('q');

      // Force kill after 5 seconds if not stopped
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Check if stream is currently running
   */
  isStreaming(): boolean {
    return this.process !== null;
  }

  /**
   * Get current video path
   */
  getCurrentVideo(): string | null {
    return this.currentVideoPath;
  }

  /**
   * Build FFmpeg command line arguments
   */
  private buildFFmpegArgs(videoPath: string): string[] {
    if (this.config.previewMode) {
      return this.buildPreviewArgs(videoPath);
    }
    return this.buildTwitchArgs(videoPath);
  }

  /**
   * Build FFmpeg arguments for Twitch RTMP streaming
   */
  private buildTwitchArgs(videoPath: string): string[] {
    const args: string[] = [];

    // Input options
    args.push('-re'); // Read input at native frame rate

    // Hardware acceleration (if enabled)
    if (this.config.hwAccel && this.config.hwAccel !== 'none') {
      if (this.config.hwAccel === 'videotoolbox') {
        args.push('-hwaccel', 'videotoolbox');
      } else if (this.config.hwAccel === 'vaapi') {
        args.push('-hwaccel', 'vaapi');
        args.push('-vaapi_device', '/dev/dri/renderD128');
      }
    }

    args.push('-i', videoPath);

    // Video codec settings
    args.push('-c:v', 'libx264');
    args.push('-preset', this.config.preset);
    args.push('-b:v', this.config.videoBitrate);
    args.push('-maxrate', this.config.videoBitrate);
    args.push('-bufsize', this.calculateBufferSize(this.config.videoBitrate));
    args.push('-r', this.config.fps.toString());
    args.push('-g', (this.config.fps * 2).toString()); // Keyframe interval
    args.push('-pix_fmt', 'yuv420p');

    // Resolution scaling
    let videoFilter = `scale=${this.config.resolution}`;

    // Add overlay filter if enabled
    if (this.config.overlayEnabled && existsSync(this.overlayTextFile)) {
      const fontFile = this.config.overlayFont
        ? `:fontfile=${this.config.overlayFont}`
        : '';

      videoFilter += `,drawtext=textfile=${this.overlayTextFile}:reload=1:${this.config.overlayPosition}:fontsize=${this.config.overlayFontSize}:fontcolor=${this.config.overlayColor}${fontFile}:box=1:boxcolor=black@0.5:boxborderw=5`;
    }

    args.push('-vf', videoFilter);

    // Audio codec settings
    args.push('-c:a', 'aac');
    args.push('-b:a', this.config.audioBitrate);
    args.push('-ar', '44100');
    args.push('-ac', '2');

    // Output format settings
    args.push('-f', 'flv');
    args.push('-flvflags', 'no_duration_filesize');

    // Output URL
    const rtmpUrl = `${this.config.twitchServer}/${this.config.twitchStreamKey}`;
    args.push(rtmpUrl);

    return args;
  }

  /**
   * Build FFmpeg arguments for local HLS preview
   */
  private buildPreviewArgs(videoPath: string): string[] {
    const args: string[] = [];

    // Input options
    args.push('-re'); // Read input at native frame rate

    // Hardware acceleration (if enabled)
    if (this.config.hwAccel && this.config.hwAccel !== 'none') {
      if (this.config.hwAccel === 'videotoolbox') {
        args.push('-hwaccel', 'videotoolbox');
      } else if (this.config.hwAccel === 'vaapi') {
        args.push('-hwaccel', 'vaapi');
        args.push('-vaapi_device', '/dev/dri/renderD128');
      }
    }

    args.push('-i', videoPath);

    // Video codec settings
    args.push('-c:v', 'libx264');
    args.push('-preset', this.config.preset);
    args.push('-b:v', this.config.videoBitrate);
    args.push('-maxrate', this.config.videoBitrate);
    args.push('-bufsize', this.calculateBufferSize(this.config.videoBitrate));
    args.push('-r', this.config.fps.toString());
    args.push('-g', (this.config.fps * 2).toString()); // Keyframe interval
    args.push('-pix_fmt', 'yuv420p');

    // Resolution scaling
    let videoFilter = `scale=${this.config.resolution}`;

    // Add overlay filter if enabled
    if (this.config.overlayEnabled && existsSync(this.overlayTextFile)) {
      const fontFile = this.config.overlayFont
        ? `:fontfile=${this.config.overlayFont}`
        : '';

      videoFilter += `,drawtext=textfile=${this.overlayTextFile}:reload=1:${this.config.overlayPosition}:fontsize=${this.config.overlayFontSize}:fontcolor=${this.config.overlayColor}${fontFile}:box=1:boxcolor=black@0.5:boxborderw=5`;
    }

    args.push('-vf', videoFilter);

    // Audio codec settings
    args.push('-c:a', 'aac');
    args.push('-b:a', this.config.audioBitrate);
    args.push('-ar', '44100');
    args.push('-ac', '2');

    // HLS output settings
    args.push('-f', 'hls');
    args.push('-hls_time', '2'); // 2 second segments
    args.push('-hls_list_size', '3'); // Keep 3 segments in playlist
    args.push('-hls_flags', 'delete_segments'); // Auto-delete old segments
    args.push('-start_number', '1');

    // Output path
    const hlsPath = `${this.config.previewDir}/stream.m3u8`;
    args.push(hlsPath);

    return args;
  }

  /**
   * Calculate buffer size based on bitrate
   */
  private calculateBufferSize(bitrate: string): string {
    const bitrateNum = parseInt(bitrate.replace('k', ''), 10);
    return `${bitrateNum * 2}k`;
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data) => {
      const output = data.toString();
      if (this.config.logLevel === 'debug') {
        console.log('[FFmpeg stdout]', output);
      }
    });

    this.process.stderr?.on('data', (data) => {
      const output = data.toString();
      // FFmpeg outputs progress to stderr
      if (this.config.logLevel === 'debug') {
        console.log('[FFmpeg]', output);
      }
    });

    this.process.on('error', (error) => {
      console.error('[Streamer] Process error:', error);
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`[Streamer] FFmpeg exited with code ${code}`);
      }
      if (signal) {
        console.log(`[Streamer] FFmpeg killed with signal ${signal}`);
      }
      this.process = null;
      this.currentVideoPath = null;
    });
  }
}

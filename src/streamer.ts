import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import type { StreamConfig } from './types.js';

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

    if (this.config.logLevel === 'debug') {
      console.log('[Streamer] FFmpeg command:', 'ffmpeg', args.join(' '));
    }

    return new Promise((resolve, reject) => {
      this.process = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const errorChunks: string[] = [];

      this.process.stderr?.on('data', (data) => {
        const output = data.toString();
        errorChunks.push(output);
        if (this.config.logLevel === 'debug') {
          console.log('[FFmpeg]', output);
        }
      });

      this.process.stdout?.on('data', (data) => {
        const output = data.toString();
        if (this.config.logLevel === 'debug') {
          console.log('[FFmpeg stdout]', output);
        }
      });

      this.process.on('error', (error) => {
        console.error('[Streamer] Process error:', error);
        this.process = null;
        this.currentVideoPath = null;
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        const fullError = errorChunks.join('');
        this.process = null;
        this.currentVideoPath = null;

        if (signal) {
          console.log(`[Streamer] FFmpeg killed with signal ${signal}`);
          reject(new Error(`FFmpeg killed with signal ${signal}`));
        } else if (code !== 0 && code !== null) {
          console.error(`[Streamer] FFmpeg exited with code ${code}`);
          const errorLines = fullError.split('\n').filter(line => 
            line.toLowerCase().includes('error') || 
            line.toLowerCase().includes('failed') ||
            line.toLowerCase().includes('invalid')
          ).slice(-5);
          const errorSummary = errorLines.length > 0 ? '\n' + errorLines.join('\n') : '';
          reject(new Error(`FFmpeg exited with code ${code}${errorSummary}`));
        } else {
          resolve();
        }
      });
    });
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

    // Hardware acceleration for decoding (if enabled)
    // Note: For NVENC, we only use it for encoding, not decoding, to keep filter chain simple
    if (this.config.hwAccel && this.config.hwAccel !== 'none' && this.config.hwAccel !== 'nvenc') {
      if (this.config.hwAccel === 'videotoolbox') {
        args.push('-hwaccel', 'videotoolbox');
      } else if (this.config.hwAccel === 'vaapi') {
        args.push('-hwaccel', 'vaapi');
        args.push('-vaapi_device', '/dev/dri/renderD128');
      }
    }

    args.push('-i', videoPath);

    // Video codec settings
    const videoCodec = this.config.hwAccel === 'nvenc' ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', videoCodec);
    args.push('-preset', this.config.preset);
    args.push('-b:v', this.config.videoBitrate);
    args.push('-maxrate', this.config.videoBitrate);
    args.push('-bufsize', this.calculateBufferSize(this.config.videoBitrate));
    args.push('-r', this.config.fps.toString());
    args.push('-g', (this.config.fps * 2).toString()); // Keyframe interval
    args.push('-pix_fmt', 'yuv420p');

    // Resolution scaling and filters (always use CPU filters for simplicity)
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

    // Hardware acceleration for decoding (if enabled)
    // Note: For NVENC, we only use it for encoding, not decoding, to keep filter chain simple
    if (this.config.hwAccel && this.config.hwAccel !== 'none' && this.config.hwAccel !== 'nvenc') {
      if (this.config.hwAccel === 'videotoolbox') {
        args.push('-hwaccel', 'videotoolbox');
      } else if (this.config.hwAccel === 'vaapi') {
        args.push('-hwaccel', 'vaapi');
        args.push('-vaapi_device', '/dev/dri/renderD128');
      }
    }

    args.push('-i', videoPath);

    // Video codec settings
    const videoCodec = this.config.hwAccel === 'nvenc' ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', videoCodec);
    args.push('-preset', this.config.preset);
    args.push('-b:v', this.config.videoBitrate);
    args.push('-maxrate', this.config.videoBitrate);
    args.push('-bufsize', this.calculateBufferSize(this.config.videoBitrate));
    args.push('-r', this.config.fps.toString());
    args.push('-g', (this.config.fps * 2).toString()); // Keyframe interval
    args.push('-pix_fmt', 'yuv420p');

    // Resolution scaling and filters (always use CPU filters for simplicity)
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

}

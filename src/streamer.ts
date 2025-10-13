import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import type { StreamConfig } from './types.js';

export class Streamer {
  private process: ChildProcess | null = null;
  private config: StreamConfig;
  private currentVideoPath: string | null = null;
  private overlayTextFile: string;
  private videoStartTime: Date | null = null;
  private streamDuration: number = 0;
  private videoDuration: number = 0;

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
    this.videoStartTime = new Date();
    this.streamDuration = 0;
    this.videoDuration = 0;

    const args = this.buildFFmpegArgs(videoPath);

    if (this.config.logLevel === 'debug') {
      console.log('[Streamer] FFmpeg command:', 'ffmpeg', args.join(' '));
    }

    return new Promise((resolve, reject) => {
      this.process = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const errorChunks: string[] = [];
      const inputMetadata: any = {};

      this.process.stderr?.on('data', (data) => {
        const output = data.toString();
        errorChunks.push(output);
        
        this.parseFFmpegOutput(output, inputMetadata);
        
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
        const errorReport = this.generateErrorReport(error, null, null, errorChunks, inputMetadata);
        console.error(errorReport);
        this.process = null;
        this.currentVideoPath = null;
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        const wasCompleted = this.wasVideoCompleted();
        
        this.process = null;
        this.currentVideoPath = null;

        if (signal) {
          const errorReport = this.generateErrorReport(null, code, signal, errorChunks, inputMetadata);
          console.error(errorReport);
          reject(new Error(`FFmpeg killed with signal ${signal}`));
        } else if (code !== 0 && code !== null) {
          const errorReport = this.generateErrorReport(null, code, signal, errorChunks, inputMetadata);
          console.error(errorReport);
          reject(new Error(`FFmpeg exited with code ${code}`));
        } else if (!wasCompleted && code === 0) {
          console.warn(`[Streamer] ⚠️  Video ended early (streamed ${this.formatDuration(this.streamDuration)} of ${this.formatDuration(this.videoDuration)})`);
          resolve();
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

    args.push('-vsync', 'cfr');

    // Video codec settings
    const videoCodec = this.config.hwAccel === 'nvenc' ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', videoCodec);
    args.push('-preset', this.config.preset);
    args.push('-b:v', this.config.videoBitrate);
    args.push('-maxrate', this.config.videoBitrate);
    args.push('-bufsize', this.calculateBufferSize(this.config.videoBitrate));
    args.push('-r', this.config.fps.toString());
    args.push('-g', (this.config.fps * 2).toString());
    args.push('-pix_fmt', 'yuv420p');

    let videoFilter = `scale=${this.config.resolution}:force_original_aspect_ratio=decrease,pad=${this.config.resolution}:(ow-iw)/2:(oh-ih)/2:black`;
    
    if (this.config.overlayEnabled && existsSync(this.overlayTextFile)) {
      const fontFile = this.config.overlayFont
        ? `:fontfile=${this.config.overlayFont}`
          : '';
      videoFilter += `,drawtext=textfile=${this.overlayTextFile}:reload=1:${this.config.overlayPosition}:fontsize=${this.config.overlayFontSize}:fontcolor=${this.config.overlayColor}${fontFile}:box=1:boxcolor=black@0.5:boxborderw=5`;
    }

    args.push('-vf', videoFilter);

    args.push('-c:a', 'aac');
    args.push('-b:a', this.config.audioBitrate);
    args.push('-ar', '48000');
    args.push('-ac', '2');
    args.push('-af', 'aresample=async=1');

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

    args.push('-vsync', 'cfr');

    const videoCodec = this.config.hwAccel === 'nvenc' ? 'h264_nvenc' : 'libx264';
    args.push('-c:v', videoCodec);
    args.push('-preset', this.config.preset);
    args.push('-b:v', this.config.videoBitrate);
    args.push('-maxrate', this.config.videoBitrate);
    args.push('-bufsize', this.calculateBufferSize(this.config.videoBitrate));
    args.push('-r', this.config.fps.toString());
    args.push('-g', (this.config.fps * 2).toString());
    args.push('-pix_fmt', 'yuv420p');

    let videoFilter = `scale=${this.config.resolution}:force_original_aspect_ratio=decrease,pad=${this.config.resolution}:(ow-iw)/2:(oh-ih)/2:black`;
    
    if (this.config.overlayEnabled && existsSync(this.overlayTextFile)) {
      const fontFile = this.config.overlayFont
        ? `:fontfile=${this.config.overlayFont}`
          : '';
      videoFilter += `,drawtext=textfile=${this.overlayTextFile}:reload=1:${this.config.overlayPosition}:fontsize=${this.config.overlayFontSize}:fontcolor=${this.config.overlayColor}${fontFile}:box=1:boxcolor=black@0.5:boxborderw=5`;
    }

    args.push('-vf', videoFilter);

    args.push('-c:a', 'aac');
    args.push('-b:a', this.config.audioBitrate);
    args.push('-ar', '48000');
    args.push('-ac', '2');
    args.push('-af', 'aresample=async=1');

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

  private parseFFmpegOutput(output: string, metadata: any): void {
    if (output.includes('Duration:')) {
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        this.videoDuration = hours * 3600 + minutes * 60 + seconds;
        metadata.duration = this.videoDuration;
      }

      const inputMatch = output.match(/Input #\d+, (\w+),/);
      if (inputMatch) {
        metadata.container = inputMatch[1];
      }
    }

    if (output.includes('Stream #') && output.includes('Video:')) {
      const codecMatch = output.match(/Video: (\w+)/);
      const resMatch = output.match(/(\d{3,4})x(\d{3,4})/);
      const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps/);
      
      if (codecMatch) metadata.videoCodec = codecMatch[1];
      if (resMatch) metadata.resolution = `${resMatch[1]}x${resMatch[2]}`;
      if (fpsMatch) metadata.fps = fpsMatch[1];
    }

    if (output.includes('Stream #') && output.includes('Audio:')) {
      const audioCodecMatch = output.match(/Audio: (\w+)/);
      const sampleRateMatch = output.match(/(\d+) Hz/);
      
      if (audioCodecMatch) metadata.audioCodec = audioCodecMatch[1];
      if (sampleRateMatch) metadata.sampleRate = sampleRateMatch[1];
    }

    if (output.includes('time=')) {
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        this.streamDuration = hours * 3600 + minutes * 60 + seconds;
      }
    }
  }

  private wasVideoCompleted(): boolean {
    if (this.videoDuration === 0) return true;
    const completionPercentage = (this.streamDuration / this.videoDuration) * 100;
    return completionPercentage >= 98;
  }

  private generateErrorReport(
    error: Error | null,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    errorChunks: string[],
    metadata: any
  ): string {
    const report: string[] = [];
    const now = new Date();
    const elapsed = this.videoStartTime ? (now.getTime() - this.videoStartTime.getTime()) / 1000 : 0;
    
    report.push('\n╔════════════════════════════════════════════════════════════════╗');
    report.push('║                    STREAM ERROR REPORT                         ║');
    report.push('╚════════════════════════════════════════════════════════════════╝\n');
    
    report.push(`📹 Video: ${this.currentVideoPath}`);
    report.push(`⏱️  Stream Duration: ${this.formatDuration(this.streamDuration)} / ${this.formatDuration(this.videoDuration)}`);
    report.push(`📊 Completion: ${this.videoDuration > 0 ? ((this.streamDuration / this.videoDuration) * 100).toFixed(1) : 0}%`);
    report.push(`🕐 Elapsed Time: ${elapsed.toFixed(1)}s`);
    report.push(`🕐 Timestamp: ${now.toISOString()}\n`);

    if (Object.keys(metadata).length > 0) {
      report.push('📝 Input File Metadata:');
      if (metadata.container) report.push(`   Container: ${metadata.container}`);
      if (metadata.videoCodec) report.push(`   Video Codec: ${metadata.videoCodec}`);
      if (metadata.audioCodec) report.push(`   Audio Codec: ${metadata.audioCodec}`);
      if (metadata.resolution) report.push(`   Resolution: ${metadata.resolution}`);
      if (metadata.fps) report.push(`   FPS: ${metadata.fps}`);
      if (metadata.sampleRate) report.push(`   Sample Rate: ${metadata.sampleRate} Hz`);
      report.push('');
    }

    report.push('🔴 Error Details:');
    if (error) {
      report.push(`   Type: Process Error`);
      report.push(`   Message: ${error.message}`);
    } else if (signal) {
      report.push(`   Type: Process Killed`);
      report.push(`   Signal: ${signal}`);
    } else if (exitCode !== null && exitCode !== 0) {
      report.push(`   Type: FFmpeg Exit Error`);
      report.push(`   Exit Code: ${exitCode}`);
    }
    report.push('');

    const fullError = errorChunks.join('');
    const errorLines = fullError.split('\n').filter(line => {
      const lower = line.toLowerCase();
      return lower.includes('error') || 
             lower.includes('failed') || 
             lower.includes('invalid') ||
             lower.includes('cannot') ||
             lower.includes('unable') ||
             lower.includes('not found') ||
             lower.includes('deprecated');
    });

    if (errorLines.length > 0) {
      report.push('🔍 FFmpeg Error Messages:');
      errorLines.slice(-10).forEach(line => {
        report.push(`   ${line.trim()}`);
      });
      report.push('');
    }

    const lastLines = fullError.split('\n').filter(l => l.trim()).slice(-15);
    if (lastLines.length > 0) {
      report.push('📋 Last FFmpeg Output:');
      lastLines.forEach(line => {
        report.push(`   ${line.trim()}`);
      });
      report.push('');
    }

    report.push('💡 Possible Causes:');
    if (signal === 'SIGKILL') {
      report.push('   • System ran out of memory');
      report.push('   • Process was killed by OOM killer');
      report.push('   • Try reducing VIDEO_BITRATE or disable HW_ACCEL');
    } else if (fullError.includes('Invalid data found')) {
      report.push('   • Corrupted video file');
      report.push('   • Incompatible codec or container format');
      report.push('   • Try re-encoding the video file');
    } else if (fullError.includes('NVENC') || fullError.includes('h264_nvenc')) {
      report.push('   • NVENC hardware encoder error');
      report.push('   • Try setting HW_ACCEL=none in .env');
      report.push('   • GPU may be overloaded or driver issue');
    } else if (fullError.includes('Connection refused') || fullError.includes('RTMP')) {
      report.push('   • Network connection issue');
      report.push('   • Twitch server unreachable');
      report.push('   • Check TWITCH_SERVER and TWITCH_STREAM_KEY');
    } else if (fullError.includes('Conversion failed')) {
      report.push('   • Audio/video codec conversion failed');
      report.push('   • Input file has unsupported format');
      report.push('   • Try re-encoding with ffmpeg first');
    } else if (this.streamDuration < this.videoDuration * 0.5) {
      report.push('   • Video stopped early in streaming');
      report.push('   • Possible filter chain issue');
      report.push('   • Check if input resolution/fps is extreme');
    } else {
      report.push('   • Unknown error - check full logs above');
      report.push('   • Try setting LOG_LEVEL=debug in .env for more details');
    }

    report.push('\n╚════════════════════════════════════════════════════════════════╝\n');
    
    return report.join('\n');
  }

  private formatDuration(seconds: number): string {
    if (seconds === 0) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

}

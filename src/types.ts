export interface StreamConfig {
  // Mode settings
  previewMode: boolean;
  previewPort: number;
  previewDir: string;

  // Twitch settings
  twitchStreamKey: string;
  twitchServer: string;

  // Video settings
  videoBitrate: string;
  audioBitrate: string;
  resolution: string;
  fps: number;
  preset: string;

  // Hardware acceleration (optional)
  hwAccel?: 'videotoolbox' | 'vaapi' | 'none';

  // Overlay settings
  overlayEnabled: boolean;
  overlayFontSize: number;
  overlayPosition: string;
  overlayColor: string;
  overlayFont?: string;

  // Playlist settings
  videoDir: string;
  loopPlaylist: boolean;
  shufflePlaylist: boolean;

  // Monitoring settings
  healthCheckInterval: number;
  maxRetries: number;
  retryBackoffMs: number;

  // Logging
  logDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface VideoFile {
  path: string;
  filename: string;
  addedAt: Date;
}

export interface StreamStatus {
  isStreaming: boolean;
  currentVideo: VideoFile | null;
  startTime: Date | null;
  uptime: number;
  retryCount: number;
  errors: string[];
}

export interface OverlayData {
  videoName: string;
  timestamp: string;
  customText?: string;
}

export interface FFmpegOptions {
  input: string;
  output: string;
  videoCodec: string;
  audioCodec: string;
  videoBitrate: string;
  audioBitrate: string;
  resolution: string;
  fps: number;
  preset: string;
  hwAccel?: string;
  overlayText?: string;
  overlayOptions?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  uptime: number;
  currentVideo: string | null;
  errorCount: number;
  lastError?: string;
}

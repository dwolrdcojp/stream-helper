import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { StreamConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

/**
 * Load environment variables from .env file
 */
function loadEnvFile(): void {
  try {
    const envPath = join(projectRoot, '.env');
    const envFile = readFileSync(envPath, 'utf-8');

    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();

      if (key && value) {
        process.env[key.trim()] = value;
      }
    });
  } catch (error) {
    // .env file is optional, will use defaults
  }
}

/**
 * Get environment variable or default value
 */
function env(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * Load and validate stream configuration
 */
export function loadConfig(): StreamConfig {
  loadEnvFile();

  const previewMode = env('PREVIEW_MODE', 'false') === 'true';

  const config: StreamConfig = {
    // Mode settings
    previewMode,
    previewPort: parseInt(env('PREVIEW_PORT', '8080'), 10),
    previewDir: env('PREVIEW_DIR', join(projectRoot, 'preview')),

    // Twitch settings
    twitchStreamKey: env('TWITCH_STREAM_KEY'),
    twitchServer: env('TWITCH_SERVER', 'rtmp://live.twitch.tv/app'),

    // Video settings
    videoBitrate: env('VIDEO_BITRATE', '3000k'),
    audioBitrate: env('AUDIO_BITRATE', '160k'),
    resolution: env('RESOLUTION', '1920x1080'),
    fps: parseInt(env('FPS', '30'), 10),
    preset: env('PRESET', 'veryfast'),

    // Hardware acceleration
    hwAccel: (env('HW_ACCEL', 'none') as 'videotoolbox' | 'vaapi' | 'none'),

    // Overlay settings
    overlayEnabled: env('OVERLAY_ENABLED', 'true') === 'true',
    overlayFontSize: parseInt(env('OVERLAY_FONT_SIZE', '24'), 10),
    overlayPosition: env('OVERLAY_POSITION', 'x=10:y=10'),
    overlayColor: env('OVERLAY_COLOR', 'white'),
    overlayFont: env('OVERLAY_FONT', ''),

    // Playlist settings
    videoDir: env('VIDEO_DIR', join(projectRoot, 'videos')),
    loopPlaylist: env('LOOP_PLAYLIST', 'true') === 'true',
    shufflePlaylist: env('SHUFFLE_PLAYLIST', 'false') === 'true',

    // Monitoring settings
    healthCheckInterval: parseInt(env('HEALTH_CHECK_INTERVAL', '30000'), 10),
    maxRetries: parseInt(env('MAX_RETRIES', '10'), 10),
    retryBackoffMs: parseInt(env('RETRY_BACKOFF_MS', '5000'), 10),

    // Logging
    logDir: env('LOG_DIR', join(projectRoot, 'logs')),
    logLevel: (env('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error'),
  };

  // Validate required fields (only for live mode)
  if (!previewMode && !config.twitchStreamKey) {
    throw new Error('TWITCH_STREAM_KEY is required in .env file for live streaming. Set PREVIEW_MODE=true to test locally.');
  }

  return config;
}

/**
 * Get absolute path relative to project root
 */
export function getProjectPath(...paths: string[]): string {
  return join(projectRoot, ...paths);
}

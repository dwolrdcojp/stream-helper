#!/usr/bin/env node

import { mkdirSync, existsSync } from 'fs';
import { loadConfig, getProjectPath } from './config.js';
import { Streamer } from './streamer.js';
import { PlaylistManager } from './playlist.js';
import { OverlayManager } from './overlay.js';
import { HealthMonitor } from './monitor.js';
import { PreviewServer } from './preview-server.js';

class StreamService {
  private config;
  private streamer;
  private playlist;
  private overlay;
  private monitor;
  private previewServer;
  private overlayFilePath;
  private isShuttingDown = false;

  constructor() {
    console.log('🎥 Twitch Stream Service v1.0.0');
    console.log('================================\n');

    // Load configuration
    this.config = loadConfig();
    console.log('[Config] Loaded configuration');

    if (this.config.previewMode) {
      console.log('[Config] 🔍 PREVIEW MODE - Streaming locally at http://localhost:' + this.config.previewPort);
    } else {
      console.log('[Config] 📡 LIVE MODE - Streaming to Twitch');
    }

    // Ensure directories exist
    this.ensureDirectories();

    // Initialize components
    this.overlayFilePath = getProjectPath('overlays', 'current.txt');
    this.streamer = new Streamer(this.config, this.overlayFilePath);
    this.playlist = new PlaylistManager(this.config);
    this.overlay = new OverlayManager(this.overlayFilePath);
    this.monitor = new HealthMonitor(this.config);
    this.previewServer = this.config.previewMode ? new PreviewServer(this.config) : null;
  }

  /**
   * Start the streaming service
   */
  async start(): Promise<void> {
    try {
      // Start preview server if in preview mode
      if (this.previewServer) {
        this.previewServer.start();
        console.log('');
      }

      // Initialize playlist
      await this.playlist.initialize();

      // Start directory watching
      this.playlist.startWatching();

      // Start health monitoring
      this.monitor.start();

      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();

      console.log('[Service] Starting stream...\n');

      // Start streaming loop
      await this.streamLoop();
    } catch (error) {
      console.error('[Service] Fatal error:', error);
      process.exit(1);
    }
  }

  /**
   * Main streaming loop
   */
  private async streamLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      const video = this.playlist.getNext();

      if (!video) {
        console.log('[Service] No more videos in playlist');
        if (!this.config.loopPlaylist) {
          break;
        }
        continue;
      }

      try {
        console.log(`[Service] Starting: ${video.filename}`);

        // Update overlay
        this.overlay.update({
          videoName: video.filename,
          timestamp: new Date().toISOString(),
        });

        // Update monitor
        this.monitor.updateCurrentVideo(video.filename);

        // Start streaming
        await this.streamer.start(video.path);

        // Wait for stream to complete
        await this.waitForStreamEnd();

        // Reset retry count on successful stream
        this.monitor.resetRetry();

        console.log(`[Service] Completed: ${video.filename}\n`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Service] Stream error: ${errorMsg}`);

        this.monitor.recordError(errorMsg);
        this.monitor.incrementRetry();

        if (!this.monitor.shouldRetry()) {
          console.error('[Service] Max retries exceeded, stopping service');
          break;
        }

        const delay = this.monitor.getBackoffDelay();
        console.log(`[Service] Retrying in ${delay}ms... (attempt ${this.monitor.getStatus().retryCount}/${this.config.maxRetries})\n`);

        await this.sleep(delay);
      }
    }

    await this.shutdown();
  }

  /**
   * Wait for current stream to end
   */
  private async waitForStreamEnd(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (!this.streamer.isStreaming()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);

      // If shutdown is triggered, stop waiting
      if (this.isShuttingDown) {
        clearInterval(checkInterval);
        reject(new Error('Shutdown triggered'));
      }
    });
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('\n[Service] Shutting down gracefully...');

    // Stop streaming
    if (this.streamer.isStreaming()) {
      console.log('[Service] Stopping stream...');
      await this.streamer.stop();
    }

    // Stop preview server
    if (this.previewServer) {
      console.log('[Service] Stopping preview server...');
      await this.previewServer.stop();
    }

    // Stop playlist watching
    this.playlist.stopWatching();

    // Stop health monitoring
    this.monitor.stop();

    // Clear overlay
    this.overlay.clear();

    // Print final status
    const status = this.monitor.getStatus();
    console.log('\n[Service] Final status:');
    console.log(`  Uptime: ${this.formatUptime(status.uptime)}`);
    console.log(`  Errors: ${status.errors.length}`);
    console.log(`  Retries: ${status.retryCount}`);

    console.log('\n[Service] Shutdown complete');
    process.exit(0);
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    process.on('SIGINT', () => {
      console.log('\n[Service] Received SIGINT');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('\n[Service] Received SIGTERM');
      this.shutdown();
    });

    process.on('uncaughtException', (error) => {
      console.error('[Service] Uncaught exception:', error);
      this.monitor.recordError(error);
      this.shutdown();
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[Service] Unhandled rejection:', reason);
      this.monitor.recordError(String(reason));
      this.shutdown();
    });
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.config.videoDir,
      this.config.logDir,
      getProjectPath('overlays'),
    ];

    // Add preview directory if in preview mode
    if (this.config.previewMode) {
      dirs.push(this.config.previewDir);
    }

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`[Service] Created directory: ${dir}`);
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Format uptime for display
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Start the service
const service = new StreamService();
service.start();

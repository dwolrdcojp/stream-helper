import type { StreamStatus, StreamConfig, HealthCheckResult } from './types.js';

export class HealthMonitor {
  private config: StreamConfig;
  private status: StreamStatus;
  private startTime: Date | null = null;
  private retryCount: number = 0;
  private errors: string[] = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: StreamConfig) {
    this.config = config;
    this.status = {
      isStreaming: false,
      currentVideo: null,
      startTime: null,
      uptime: 0,
      retryCount: 0,
      errors: [],
    };
  }

  /**
   * Start health monitoring
   */
  start(): void {
    this.startTime = new Date();
    this.status.startTime = this.startTime;
    this.status.isStreaming = true;

    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckInterval);

      console.log(
        `[Monitor] Health checks enabled (interval: ${this.config.healthCheckInterval}ms)`
      );
    }
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.status.isStreaming = false;
  }

  /**
   * Record an error
   */
  recordError(error: Error | string): void {
    const errorMsg = error instanceof Error ? error.message : error;
    this.errors.push(errorMsg);

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }

    this.status.errors = this.errors;

    console.error(`[Monitor] Error recorded: ${errorMsg}`);
  }

  /**
   * Increment retry counter
   */
  incrementRetry(): void {
    this.retryCount++;
    this.status.retryCount = this.retryCount;
  }

  /**
   * Reset retry counter
   */
  resetRetry(): void {
    this.retryCount = 0;
    this.status.retryCount = 0;
  }

  /**
   * Check if should retry based on config
   */
  shouldRetry(): boolean {
    return this.retryCount < this.config.maxRetries;
  }

  /**
   * Calculate backoff delay with exponential backoff
   */
  getBackoffDelay(): number {
    const baseDelay = this.config.retryBackoffMs;
    const exponentialDelay = baseDelay * Math.pow(2, this.retryCount);
    const maxDelay = baseDelay * 60; // Cap at 60x base delay

    return Math.min(exponentialDelay, maxDelay);
  }

  /**
   * Update current video info
   */
  updateCurrentVideo(filename: string | null): void {
    if (filename) {
      this.status.currentVideo = {
        path: filename,
        filename: filename,
        addedAt: new Date(),
      };
    } else {
      this.status.currentVideo = null;
    }
  }

  /**
   * Get current status
   */
  getStatus(): StreamStatus {
    this.updateUptime();
    return { ...this.status };
  }

  /**
   * Get health check result
   */
  getHealthCheck(): HealthCheckResult {
    this.updateUptime();

    return {
      healthy: this.status.isStreaming && this.retryCount < this.config.maxRetries,
      uptime: this.status.uptime,
      currentVideo: this.status.currentVideo?.filename || null,
      errorCount: this.errors.length,
      lastError: this.errors[this.errors.length - 1],
    };
  }

  /**
   * Update uptime calculation
   */
  private updateUptime(): void {
    if (this.startTime) {
      this.status.uptime = Date.now() - this.startTime.getTime();
    }
  }

  /**
   * Perform periodic health check
   */
  private performHealthCheck(): void {
    const health = this.getHealthCheck();

    if (this.config.logLevel === 'debug') {
      console.log('[Monitor] Health check:', {
        healthy: health.healthy,
        uptime: this.formatUptime(health.uptime),
        currentVideo: health.currentVideo,
        errorCount: health.errorCount,
      });
    }
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

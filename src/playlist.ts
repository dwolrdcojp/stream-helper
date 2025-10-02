import { readdirSync, watch, FSWatcher, statSync } from 'fs';
import { join, extname } from 'path';
import type { VideoFile, StreamConfig } from './types.js';

const SUPPORTED_FORMATS = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.webm', '.m4v'];

export class PlaylistManager {
  private config: StreamConfig;
  private playlist: VideoFile[] = [];
  private currentIndex: number = 0;
  private watcher: FSWatcher | null = null;

  constructor(config: StreamConfig) {
    this.config = config;
  }

  /**
   * Initialize playlist by scanning video directory
   */
  async initialize(): Promise<void> {
    this.scanVideoDirectory();

    if (this.playlist.length === 0) {
      throw new Error(`No video files found in ${this.config.videoDir}`);
    }

    if (this.config.shufflePlaylist) {
      this.shuffle();
    }

    console.log(`[Playlist] Loaded ${this.playlist.length} video(s)`);
    this.playlist.forEach((video, idx) => {
      console.log(`  [${idx + 1}] ${video.filename}`);
    });
  }

  /**
   * Start watching video directory for changes
   */
  startWatching(): void {
    this.watcher = watch(this.config.videoDir, (eventType, filename) => {
      if (filename && this.isSupportedFormat(filename)) {
        console.log(`[Playlist] Directory change detected: ${eventType} - ${filename}`);
        this.scanVideoDirectory();

        if (this.config.shufflePlaylist) {
          this.shuffle();
        }
      }
    });

    console.log(`[Playlist] Watching directory: ${this.config.videoDir}`);
  }

  /**
   * Stop watching video directory
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[Playlist] Stopped watching directory');
    }
  }

  /**
   * Get next video in playlist
   */
  getNext(): VideoFile | null {
    if (this.playlist.length === 0) {
      return null;
    }

    const video = this.playlist[this.currentIndex];
    this.currentIndex++;

    // Handle end of playlist
    if (this.currentIndex >= this.playlist.length) {
      if (this.config.loopPlaylist) {
        this.currentIndex = 0;
        if (this.config.shufflePlaylist) {
          this.shuffle();
        }
        console.log('[Playlist] Reached end, looping playlist');
      } else {
        console.log('[Playlist] Reached end of playlist');
        return null;
      }
    }

    return video;
  }

  /**
   * Get current video
   */
  getCurrent(): VideoFile | null {
    if (this.playlist.length === 0) {
      return null;
    }

    const index = this.currentIndex > 0 ? this.currentIndex - 1 : 0;
    return this.playlist[index];
  }

  /**
   * Get playlist info
   */
  getInfo(): { total: number; current: number; remaining: number } {
    return {
      total: this.playlist.length,
      current: this.currentIndex,
      remaining: Math.max(0, this.playlist.length - this.currentIndex),
    };
  }

  /**
   * Reset playlist to beginning
   */
  reset(): void {
    this.currentIndex = 0;
    console.log('[Playlist] Reset to beginning');
  }

  /**
   * Scan video directory and update playlist
   */
  private scanVideoDirectory(): void {
    try {
      const files = readdirSync(this.config.videoDir);
      const videoFiles: VideoFile[] = [];

      for (const filename of files) {
        if (this.isSupportedFormat(filename)) {
          const path = join(this.config.videoDir, filename);
          try {
            const stats = statSync(path);
            videoFiles.push({
              path,
              filename,
              addedAt: stats.birthtime,
            });
          } catch (error) {
            console.warn(`[Playlist] Could not read file stats: ${filename}`);
          }
        }
      }

      // Sort by filename by default (unless shuffle is enabled)
      videoFiles.sort((a, b) => a.filename.localeCompare(b.filename));

      this.playlist = videoFiles;
    } catch (error) {
      console.error('[Playlist] Error scanning directory:', error);
      throw error;
    }
  }

  /**
   * Check if file has supported video format
   */
  private isSupportedFormat(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    return SUPPORTED_FORMATS.includes(ext);
  }

  /**
   * Shuffle playlist using Fisher-Yates algorithm
   */
  private shuffle(): void {
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }
    console.log('[Playlist] Shuffled playlist');
  }
}

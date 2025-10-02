import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { OverlayData } from './types.js';

export class OverlayManager {
  private overlayFilePath: string;

  constructor(overlayFilePath: string) {
    this.overlayFilePath = overlayFilePath;
    this.ensureOverlayFileExists();
  }

  /**
   * Update overlay with new data
   */
  update(data: OverlayData): void {
    const text = this.formatOverlayText(data);

    try {
      writeFileSync(this.overlayFilePath, text, 'utf-8');
    } catch (error) {
      console.error('[Overlay] Error writing overlay file:', error);
    }
  }

  /**
   * Clear overlay text
   */
  clear(): void {
    try {
      writeFileSync(this.overlayFilePath, '', 'utf-8');
    } catch (error) {
      console.error('[Overlay] Error clearing overlay file:', error);
    }
  }

  /**
   * Format overlay text from data
   */
  private formatOverlayText(data: OverlayData): string {
    const parts: string[] = [];

    if (data.videoName) {
      parts.push(`Now Playing: ${data.videoName}`);
    }

    if (data.customText) {
      parts.push(data.customText);
    }

    return parts.join(' | ');
  }

  /**
   * Ensure overlay file and directory exist
   */
  private ensureOverlayFileExists(): void {
    const dir = dirname(this.overlayFilePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.overlayFilePath)) {
      writeFileSync(this.overlayFilePath, '', 'utf-8');
    }
  }
}

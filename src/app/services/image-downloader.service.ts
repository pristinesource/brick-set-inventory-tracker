import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IndexedDBService } from './indexeddb.service';

interface DownloadQueueItem {
    url: string;
    resolve: (blob: Blob) => void;
    reject: (error: any) => void;
    retryCount: number;
}

@Injectable({
    providedIn: 'root'
})
export class ImageDownloaderService {
    private readonly MAX_CONCURRENT_DOWNLOADS = 5;
    private readonly RATE_LIMIT_PER_SECOND = 20;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    private downloadQueue: DownloadQueueItem[] = [];
    private activeDownloads = 0;
    private downloadsThisSecond = 0;
    private rateLimitResetTimer?: number;
    private isProcessing = false;

    constructor(
        private http: HttpClient,
        private indexedDBService: IndexedDBService
    ) {
        // DISABLED: CORS prevents downloading from Rebrickable CDN
        // Not starting the rate limit timer to prevent performance issues
        // this.startRateLimitTimer();
    }

    /**
     * Start the rate limit timer
     */
    private startRateLimitTimer(): void {
        this.rateLimitResetTimer = window.setInterval(() => {
            this.downloadsThisSecond = 0;
            if (this.downloadQueue.length > 0 && !this.isProcessing) {
                this.processQueue();
            }
        }, 1000);
    }

    /**
     * Queue an image for download
     */
    async downloadImage(url: string): Promise<Blob> {
        // Check if image is already cached
        const cached = await this.indexedDBService.getImageFromCache(url);
        if (cached) {
            return cached.blob;
        }

        // Add to download queue
        return new Promise<Blob>((resolve, reject) => {
            this.downloadQueue.push({
                url,
                resolve,
                reject,
                retryCount: 0
            });

            // Start processing if not already doing so
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    /**
     * Process the download queue
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.downloadQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.downloadQueue.length > 0) {
            // Check rate limit
            if (this.downloadsThisSecond >= this.RATE_LIMIT_PER_SECOND) {
                // Wait for next second
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            // Check concurrent download limit
            if (this.activeDownloads >= this.MAX_CONCURRENT_DOWNLOADS) {
                await new Promise(resolve => setTimeout(resolve, 50));
                continue;
            }

            // Get next item from queue
            const item = this.downloadQueue.shift();
            if (!item) continue;

            // Start download
            this.activeDownloads++;
            this.downloadsThisSecond++;

            this.performDownload(item).catch(error => {
                console.error(`Failed to download image ${item.url}:`, error);
            });

            // Small delay between starting downloads
            if (this.downloadQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        this.isProcessing = false;
    }

    /**
     * Perform the actual download
     */
    private async performDownload(item: DownloadQueueItem): Promise<void> {
        try {
            // Download the image as blob
            const blob = await firstValueFrom(
                this.http.get(item.url, {
                    responseType: 'blob',
                    headers: {
                        'Accept': 'image/*'
                    }
                })
            );

            // Get content type from blob
            const contentType = blob.type || 'image/jpeg';

            // Save to IndexedDB cache
            await this.indexedDBService.saveImageToCache(item.url, blob, contentType);

            // Resolve the promise
            item.resolve(blob);

        } catch (error) {
            // Retry logic
            if (item.retryCount < this.MAX_RETRIES) {
                item.retryCount++;
                console.warn(`Retrying download for ${item.url} (attempt ${item.retryCount}/${this.MAX_RETRIES})`);

                // Add back to queue with delay
                setTimeout(() => {
                    this.downloadQueue.push(item);
                    if (!this.isProcessing) {
                        this.processQueue();
                    }
                }, this.RETRY_DELAY * item.retryCount);
            } else {
                // Max retries reached, reject the promise
                item.reject(error);
            }
        } finally {
            this.activeDownloads--;
        }
    }

    /**
     * Download multiple images with progress callback
     */
    async downloadImages(
        urls: string[],
        progressCallback?: (downloaded: number, total: number) => void
    ): Promise<Map<string, Blob>> {
        const results = new Map<string, Blob>();
        const errors: string[] = [];
        let completed = 0;

        // Filter out already cached images
        const uncachedUrls = await this.indexedDBService.getUncachedImageUrls(urls);

        if (uncachedUrls.length === 0) {
            progressCallback?.(urls.length, urls.length);

            // Return cached images
            for (const url of urls) {
                const cached = await this.indexedDBService.getImageFromCache(url);
                if (cached) {
                    results.set(url, cached.blob);
                }
            }
            return results;
        }

        // Download uncached images
        const downloadPromises = uncachedUrls.map(async (url) => {
            try {
                const blob = await this.downloadImage(url);
                results.set(url, blob);
            } catch (error) {
                console.error(`Failed to download ${url}:`, error);
                errors.push(url);
            } finally {
                completed++;
                progressCallback?.(completed + (urls.length - uncachedUrls.length), urls.length);
            }
        });

        await Promise.all(downloadPromises);

        // Add cached images to results
        for (const url of urls) {
            if (!results.has(url) && !errors.includes(url)) {
                const cached = await this.indexedDBService.getImageFromCache(url);
                if (cached) {
                    results.set(url, cached.blob);
                }
            }
        }

        return results;
    }

    /**
     * Preload images for parts
     */
    async preloadPartImages(
        partUrls: Array<{ partNum: string; colorId: number; url: string }>,
        progressCallback?: (downloaded: number, total: number) => void
    ): Promise<void> {
        const urls = partUrls.map(item => item.url);
        await this.downloadImages(urls, progressCallback);
    }

    /**
     * Get queue status
     */
    getQueueStatus(): { queued: number; active: number; rateLimit: number } {
        return {
            queued: this.downloadQueue.length,
            active: this.activeDownloads,
            rateLimit: this.RATE_LIMIT_PER_SECOND - this.downloadsThisSecond
        };
    }

    /**
     * Clear the download queue
     */
    clearQueue(): void {
        // Reject all pending downloads
        this.downloadQueue.forEach(item => {
            item.reject(new Error('Download queue cleared'));
        });
        this.downloadQueue = [];
    }

    /**
     * Cleanup on destroy
     */
    ngOnDestroy(): void {
        if (this.rateLimitResetTimer) {
            clearInterval(this.rateLimitResetTimer);
        }
        this.clearQueue();
    }
}

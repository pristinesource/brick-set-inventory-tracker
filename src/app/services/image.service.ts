import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ImageService {
    private readonly DEFAULT_YELLOW_COLOR_ID = 14;
    private readonly PLACEHOLDER_URL = 'assets/images/placeholder.svg';
    private readonly RETRY_INTERVAL = 1000; // 1 second
    private retryQueue = new Map<string, { element: HTMLImageElement, partNum: string, attemptedColors: Set<number> }>();
    private retryTimer: any = null;

    constructor() {
        // Start the background retry process
        // DISABLED: Temporarily disabled due to performance issues
        // this.startRetryProcess();
    }

    /**
     * Get the image URL for a part with optional color
     * Simplified for performance - no caching, direct CDN URLs only
     */
    async getPartImageUrl(
        partNum: string,
        colorId: number | undefined,
        elementsMap: Map<string, string>,
        partColorsMap: Map<string, number[]>
    ): Promise<string> {
        // Use default yellow color if no specific color provided
        const requestedColorId = colorId || this.DEFAULT_YELLOW_COLOR_ID;

        // Try to get element-based URL
        let elementKey = `${partNum}_${requestedColorId}`;
        let elementId = elementsMap.get(elementKey);

        // If requested color not available, try first available color
        if (!elementId) {
            const availableColors = partColorsMap.get(partNum);
            if (availableColors && availableColors.length > 0) {
                const firstAvailableColorId = availableColors[0];
                elementKey = `${partNum}_${firstAvailableColorId}`;
                elementId = elementsMap.get(elementKey);
            }
        }

        if (elementId) {
            // Return direct CDN URL without timestamp or caching
            return `https://cdn.rebrickable.com/media/thumbs/parts/elements/${elementId}.jpg/800x800p.jpg`;
        } else {
            return this.PLACEHOLDER_URL;
        }
    }

    /**
     * Get the image URL for a part (synchronous version for backward compatibility)
     * Simplified for performance - no caching, direct CDN URLs only
     */
    getPartImageUrlSync(
        partNum: string,
        colorId: number | undefined,
        elementsMap: Map<string, string>,
        partColorsMap: Map<string, number[]>
    ): string {
        // Use default yellow color if no specific color provided
        const requestedColorId = colorId || this.DEFAULT_YELLOW_COLOR_ID;

        // Try to get element-based URL
        let elementKey = `${partNum}_${requestedColorId}`;
        let elementId = elementsMap.get(elementKey);

        // If requested color not available, try first available color
        if (!elementId) {
            const availableColors = partColorsMap.get(partNum);
            if (availableColors && availableColors.length > 0) {
                const firstAvailableColorId = availableColors[0];
                elementKey = `${partNum}_${firstAvailableColorId}`;
                elementId = elementsMap.get(elementKey);
            }
        }

        if (elementId) {
            // Return direct CDN URL without timestamp or caching
            return `https://cdn.rebrickable.com/media/thumbs/parts/elements/${elementId}.jpg/800x800p.jpg`;
        } else {
            return this.PLACEHOLDER_URL;
        }
    }

    /**
     * Schedule an image for background download
     * @deprecated CORS prevents downloading from Rebrickable CDN
     */
    private scheduleImageDownload(url: string, cacheKey: string): void {
        // CORS prevents downloading from Rebrickable CDN
        // This method is kept for backward compatibility but does nothing
    }

    /**
     * Get image URL specifically for color tracking modal
     * Simplified for performance - no caching, direct CDN URLs only
     */
    getPartImageUrlForColor(
        partNum: string,
        colorId: number,
        elementsMap: Map<string, string>,
        getFallbackUrl: (partNum: string, colorId: number) => string | null
    ): string {
        // Try element-based URL first
        const elementKey = `${partNum}_${colorId}`;
        const elementId = elementsMap.get(elementKey);

        if (elementId) {
            // Return direct CDN URL without timestamp or caching
            return `https://cdn.rebrickable.com/media/thumbs/parts/elements/${elementId}.jpg/800x800p.jpg`;
        } else {
            // Try fallback URL from inventory parts
            const fallbackUrl = getFallbackUrl(partNum, colorId);
            return fallbackUrl || this.PLACEHOLDER_URL;
        }
    }

    /**
     * Get large image URL for overlay display
     */
    getLargeImageUrl(imageUrl: string): string {
        if (!imageUrl || imageUrl.includes('placeholder.svg')) {
            return this.PLACEHOLDER_URL;
        }

        // For higher resolution, modify the URL structure
        if (imageUrl.includes('https://cdn.rebrickable.com/media/') && !imageUrl.includes('https://cdn.rebrickable.com/media/thumbs/')) {
            // Convert to thumbnail URL without timestamp
            return imageUrl.replace('https://cdn.rebrickable.com/media/', 'https://cdn.rebrickable.com/media/thumbs/') + '/800x800p.jpg';
        }

        return imageUrl;
    }

    /**
     * Handle image loading error with proper fallback
     * Made asynchronous to prevent UI blocking
     */
    async handleImageError(
        img: HTMLImageElement,
        partNum: string,
        colorId: number,
        getFallbackUrl: (partNum: string, colorId: number) => string | null
    ): Promise<void> {
        const currentSrc = img.src;

        // If already showing placeholder, don't try again
        if (currentSrc.includes('placeholder.svg')) {
            return;
        }

        // Check if this image has already been marked as failed
        if (img.getAttribute('data-image-failed') === 'true') {
            return;
        }

        // Set a temporary placeholder immediately to prevent UI jank
        const originalSrc = img.src;
        img.src = this.PLACEHOLDER_URL;

        // Try fallback URL asynchronously
        setTimeout(() => {
            const fallbackUrl = getFallbackUrl(partNum, colorId);
            if (fallbackUrl && fallbackUrl !== originalSrc) {
                // Create a new image to test if the fallback loads
                const testImg = new Image();
                testImg.onload = () => {
                    img.src = fallbackUrl;
                };
                testImg.onerror = () => {
                    // Keep placeholder and mark as failed
                    img.setAttribute('data-image-failed', 'true');
                };
                testImg.src = fallbackUrl;
            } else {
                // Mark as failed to prevent retries
                img.setAttribute('data-image-failed', 'true');
            }
        }, 0);
    }



    /**
     * Get Rebrickable URL for a part
     */
    getRebrickableUrl(partNum: string): string {
        return `https://rebrickable.com/parts/${partNum}/`;
    }

    /**
     * Get Rebrickable URL for a set
     */
    getRebrickableSetUrl(setNum: string): string {
        return `https://rebrickable.com/sets/${setNum}/`;
    }

    /**
     * Get image URL for a set
     */
    getSetImageUrl(imgUrl: string | undefined): string {
        if (!imgUrl) {
            return this.PLACEHOLDER_URL;
        }

        // Return direct URL without timestamp or caching
        return imgUrl;
    }

    /**
     * Handle general image errors (for sets, minifigs, etc.)
     */
    handleGeneralImageError(img: HTMLImageElement): void {
        const currentSrc = img.src;

        // If already showing placeholder, don't try again
        if (currentSrc.includes('placeholder.svg')) {
            return;
        }

        // Check if this image has already been marked as failed
        if (img.getAttribute('data-image-failed') === 'true') {
            return;
        }

        // Use placeholder and mark as failed to prevent retries
        img.src = this.PLACEHOLDER_URL;
        img.setAttribute('data-image-failed', 'true');
    }



    /**
     * Preload images for visible parts
     * @deprecated CORS prevents downloading from Rebrickable CDN
     */
    async preloadPartImages(
        parts: Array<{ partNum: string; colorId: number }>,
        elementsMap: Map<string, string>,
        progressCallback?: (downloaded: number, total: number) => void
    ): Promise<void> {
        // CORS prevents downloading from Rebrickable CDN
        // This method is kept for backward compatibility but does nothing

        // Call progress callback to indicate completion
        if (progressCallback) {
            progressCallback(parts.length, parts.length);
        }
    }

    /**
     * Start the background retry process
     */
    private startRetryProcess(): void {
        if (this.retryTimer) return;

        this.retryTimer = setInterval(() => {
            this.processRetryQueue();
        }, this.RETRY_INTERVAL);
    }

    /**
     * Process the retry queue
     */
    private processRetryQueue(): void {
        // Process up to 5 items per interval to avoid overwhelming the browser
        let processed = 0;
        const maxPerInterval = 5;

        for (const [key, item] of this.retryQueue.entries()) {
            if (processed >= maxPerInterval) break;

            // Skip if element is no longer in DOM or already has a valid image
            if (!item.element.isConnected ||
                (item.element.src && !item.element.src.includes('placeholder.svg') && item.element.complete && item.element.naturalHeight > 0)) {
                this.retryQueue.delete(key);
                continue;
            }

            // Get the data we need from the element's parent component
            const partColorsMap = (window as any).__partColorsMap;
            const elementsMap = (window as any).__elementsMap;

            if (partColorsMap && elementsMap) {
                this.tryNextColorForImage(item, partColorsMap, elementsMap);
            }

            processed++;
        }
    }

    /**
     * Schedule an image element for background retry with different colors
     */
    scheduleImageRetry(
        img: HTMLImageElement,
        partNum: string,
        initialColorId: number,
        partColorsMap: Map<string, number[]>,
        elementsMap: Map<string, string>
    ): void {
        const key = `${partNum}_${img.id || Math.random()}`;

        if (!this.retryQueue.has(key)) {
            this.retryQueue.set(key, {
                element: img,
                partNum: partNum,
                attemptedColors: new Set([initialColorId])
            });
        }

        // Store references in data attributes for the retry process
        img.setAttribute('data-part-num', partNum);
        img.setAttribute('data-retry-key', key);
    }

    /**
     * Try next available color for a part image
     */
    tryNextColorForImage(
        item: { element: HTMLImageElement, partNum: string, attemptedColors: Set<number> },
        partColorsMap: Map<string, number[]>,
        elementsMap: Map<string, string>
    ): void {
        const availableColors = partColorsMap.get(item.partNum);
        if (!availableColors) return;

        // Find a color we haven't tried yet
        const untried = availableColors.find(colorId => !item.attemptedColors.has(colorId));
        if (!untried) {
            // We've tried all colors, remove from queue
            const key = item.element.getAttribute('data-retry-key');
            if (key) this.retryQueue.delete(key);
            return;
        }

        // Try the new color
        const elementKey = `${item.partNum}_${untried}`;
        const elementId = elementsMap.get(elementKey);

        if (elementId) {
            const newUrl = `https://cdn.rebrickable.com/media/thumbs/parts/elements/${elementId}.jpg/800x800p.jpg`;

            // Test the image before applying
            const testImg = new Image();
            testImg.onload = () => {
                item.element.src = newUrl;
                item.element.removeAttribute('data-image-failed');
                // Remove from retry queue on success
                const key = item.element.getAttribute('data-retry-key');
                if (key) this.retryQueue.delete(key);
            };
            testImg.onerror = () => {
                // Add to attempted colors and let the retry process continue
                item.attemptedColors.add(untried);
            };
            testImg.src = newUrl;
        } else {
            item.attemptedColors.add(untried);
        }
    }

    /**
     * Enhanced image error handler that schedules retry
     */
    handleImageErrorWithRetry(
        img: HTMLImageElement,
        partNum: string,
        colorId: number,
        partColorsMap: Map<string, number[]>,
        elementsMap: Map<string, string>
    ): void {
        const currentSrc = img.src;

        // If already showing placeholder, don't retry
        if (currentSrc.includes('placeholder.svg')) {
            return;
        }

        // Set placeholder immediately
        img.src = this.PLACEHOLDER_URL;

        // DISABLED: Temporarily disabled due to performance issues
        // Schedule for background retry
        // this.scheduleImageRetry(img, partNum, colorId, partColorsMap, elementsMap);
    }

    /**
     * Clean up when service is destroyed
     */
    ngOnDestroy(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryQueue.clear();
    }

}

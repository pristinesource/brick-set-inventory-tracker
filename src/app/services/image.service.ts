import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ImageService {
    private readonly DEFAULT_YELLOW_COLOR_ID = 14;
    private readonly PLACEHOLDER_URL = 'assets/images/placeholder.svg';

    constructor() { }

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


}

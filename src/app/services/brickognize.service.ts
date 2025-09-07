import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PartMappingService } from './part-mapping.service';

export interface BrickognizeResult {
    listing_id?: string;
    bounding_box?: any;
    items: BrickognizeItem[];
    predictions_count?: number;
}

export interface BrickognizeItem {
    id: string; // This is the BrickLink part number
    img_url: string;
    score: number;
    type: 'part' | 'set' | 'minifig';
    name?: string;
    category?: string;
    external_sites?: Array<{
        name: string;
        url: string;
    }>;
}

@Injectable({
    providedIn: 'root'
})
export class BrickognizeService {
    private readonly API_URL = 'https://api.brickognize.com/predict/';

    constructor(
        private http: HttpClient,
        private partMappingService: PartMappingService
    ) { }

    /**
     * Send an image to Brickognize API for identification
     * @param imageBlob The image as a Blob
     * @returns Observable of the recognition results
     */
    recognizeImage(imageBlob: Blob): Observable<BrickognizeResult> {
        const formData = new FormData();
        formData.append('query_image', imageBlob, 'capture.jpg');

        console.log('Making request to Brickognize API:', this.API_URL);
        console.log('Image blob size:', imageBlob.size);

        return this.http.post<BrickognizeResult>(this.API_URL, formData)
            .pipe(
                catchError(error => {
                    console.error('Brickognize API error:', error);
                    console.error('Error status:', error.status);
                    console.error('Error message:', error.message);
                    if (error.status === 429) {
                        return throwError(() => new Error('Too many requests. Please wait a moment and try again.'));
                    } else if (error.status === 413) {
                        return throwError(() => new Error('Image too large. Please try a smaller image.'));
                    } else if (error.status === 401) {
                        return throwError(() => new Error('Authentication failed. Please check API configuration.'));
                    } else if (error.status === 0) {
                        return throwError(() => new Error('Network error. This might be a CORS issue. Check browser console for details.'));
                    }
                    return throwError(() => new Error(`Failed to identify parts. Error: ${error.status || 'Unknown'}`));
                })
            );
    }

    /**
     * Convert Brickognize results to Rebrickable part numbers
     * @param results The Brickognize results
     * @returns Array of Rebrickable part numbers
     */
    convertResultsToRebrickableNumbers(results: BrickognizeResult): string[] {
        const rebrickableNumbers = new Set<string>();

        console.log('Converting Brickognize results. Items:', results.items);

        for (const item of results.items) {
            console.log('Processing item:', item);

            // Only process parts (not sets or minifigs)
            if (item.type === 'part' && item.id) {
                // Try to convert BrickLink number to Rebrickable
                const rebrickableNum = this.partMappingService.toRebrickableNumber(item.id);

                if (rebrickableNum) {
                    rebrickableNumbers.add(rebrickableNum);
                    console.log(`Converted BrickLink ${item.id} to Rebrickable ${rebrickableNum}`);
                } else {
                    // If no mapping found, still include the BrickLink number
                    // The search will handle it through the PartMappingService
                    rebrickableNumbers.add(item.id);
                    console.log(`No mapping found for BrickLink ${item.id}, using as-is`);
                }
            }
        }

        console.log('Final Rebrickable numbers:', Array.from(rebrickableNumbers));
        return Array.from(rebrickableNumbers);
    }

    /**
     * Convert Brickognize results to a search query string
     * @param results The Brickognize results
     * @returns Search query string
     */
    convertResultsToSearchQuery(results: BrickognizeResult): string {
        const partNumbers = this.convertResultsToRebrickableNumbers(results);

        // Join with spaces to search for any of the parts
        return partNumbers.join(' ');
    }

    /**
     * Get a user-friendly description of the results
     * @param results The Brickognize results
     * @returns Description string
     */
    getResultsDescription(results: BrickognizeResult): string {
        const partCount = results.items.filter(item => item.type === 'part').length;
        const setCount = results.items.filter(item => item.type === 'set').length;
        const minifigCount = results.items.filter(item => item.type === 'minifig').length;

        const parts: string[] = [];
        if (partCount > 0) parts.push(`${partCount} part${partCount !== 1 ? 's' : ''}`);
        if (setCount > 0) parts.push(`${setCount} set${setCount !== 1 ? 's' : ''}`);
        if (minifigCount > 0) parts.push(`${minifigCount} minifig${minifigCount !== 1 ? 's' : ''}`);

        return parts.length > 0 ? `Found ${parts.join(', ')}` : 'No items identified';
    }
}

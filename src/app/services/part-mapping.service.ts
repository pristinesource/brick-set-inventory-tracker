import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

interface PartMappingData {
    metadata: {
        generated: string;
        totalParts: number;
        processedParts: number;
        mappedParts: number;
        source: string;
    };
    brickLinkToRebrickable: { [key: string]: string };
    rebrickableToBrickLink: { [key: string]: string[] };
}

@Injectable({
    providedIn: 'root'
})
export class PartMappingService {
    private mappingData$: Observable<PartMappingData | null>;
    private mappingCache: PartMappingData | null = null;

    constructor(private http: HttpClient) {
        // Load mapping data once and cache it
        this.mappingData$ = this.http.get<PartMappingData>('assets/data/bricklink-rebrickable-mapping.json')
            .pipe(
                map(data => {
                    this.mappingCache = data;
                    console.log('BrickLink mapping loaded successfully:', {
                        totalMappings: data.metadata?.mappedParts || 0,
                        exampleMapping: data.brickLinkToRebrickable?.['x1687'] || 'x1687 not found'
                    });
                    return data;
                }),
                catchError(error => {
                    console.warn('BrickLink mapping file not found. Part number conversion will be limited.', error);
                    return of(null);
                }),
                shareReplay(1) // Cache the result
            );
    }

    /**
     * Initialize the service by loading the mapping data
     */
    async initialize(): Promise<void> {
        await this.mappingData$.toPromise();
    }

    /**
     * Convert a BrickLink part number to Rebrickable part number
     */
    brickLinkToRebrickable(brickLinkPartNum: string): string | null {
        if (!this.mappingCache) return null;
        return this.mappingCache.brickLinkToRebrickable[brickLinkPartNum] || null;
    }

    /**
     * Convert a Rebrickable part number to BrickLink part numbers
     */
    rebrickableToBrickLink(rebrickablePartNum: string): string[] {
        if (!this.mappingCache) return [];
        return this.mappingCache.rebrickableToBrickLink[rebrickablePartNum] || [];
    }

    /**
     * Check if a part number is a BrickLink number
     */
    isBrickLinkNumber(partNum: string): boolean {
        if (!this.mappingCache) return false;
        return partNum in this.mappingCache.brickLinkToRebrickable;
    }

    /**
     * Check if a part number is a Rebrickable number
     */
    isRebrickableNumber(partNum: string): boolean {
        if (!this.mappingCache) return false;
        return partNum in this.mappingCache.rebrickableToBrickLink;
    }

    /**
     * Convert any part number to Rebrickable format
     * If already Rebrickable, returns as-is
     * If BrickLink, converts to Rebrickable
     * If unknown, returns null
     */
    toRebrickableNumber(partNum: string): string | null {
        if (!partNum) return null;

        // First check if it's already a Rebrickable number
        if (this.isRebrickableNumber(partNum)) {
            return partNum;
        }

        // Check if it's a BrickLink number and convert
        if (this.isBrickLinkNumber(partNum)) {
            return this.brickLinkToRebrickable(partNum);
        }

        // Unknown part number
        return null;
    }

    /**
     * Get all possible part numbers (Rebrickable and BrickLink) for a given part
     * Returns an array containing the input and any mapped alternatives
     */
    getAllPartNumbers(partNum: string): string[] {
        const numbers = new Set<string>();
        numbers.add(partNum);

        if (!this.mappingCache) return Array.from(numbers);

        // If it's a Rebrickable number, add BrickLink alternatives
        if (this.isRebrickableNumber(partNum)) {
            const brickLinkNums = this.rebrickableToBrickLink(partNum);
            brickLinkNums.forEach(num => numbers.add(num));
        }

        // If it's a BrickLink number, add the Rebrickable equivalent
        if (this.isBrickLinkNumber(partNum)) {
            const rebrickableNum = this.brickLinkToRebrickable(partNum);
            if (rebrickableNum) {
                numbers.add(rebrickableNum);
                // Also add any other BrickLink numbers for this part
                const otherBrickLinkNums = this.rebrickableToBrickLink(rebrickableNum);
                otherBrickLinkNums.forEach(num => numbers.add(num));
            }
        }

        return Array.from(numbers);
    }

    /**
     * Search for parts by any part number (Rebrickable or BrickLink)
     * Returns all matching Rebrickable part numbers
     */
    searchByAnyPartNumber(searchTerm: string, allPartNumbers: string[]): string[] {
        if (!searchTerm) return [];

        const searchLower = searchTerm.toLowerCase();
        const matchingRebrickableNumbers = new Set<string>();

        // Search through all part numbers
        for (const partNum of allPartNumbers) {
            // Get all variants of this part number
            const allNumbers = this.getAllPartNumbers(partNum);

            // Check if any variant matches the search term
            const hasMatch = allNumbers.some(num =>
                num.toLowerCase().includes(searchLower)
            );

            if (hasMatch) {
                // Always add the Rebrickable number
                const rebrickableNum = this.toRebrickableNumber(partNum) || partNum;
                matchingRebrickableNumbers.add(rebrickableNum);
            }
        }

        return Array.from(matchingRebrickableNumbers);
    }

    /**
     * Get mapping statistics
     */
    getMappingStats(): Observable<{ loaded: boolean; totalMappings: number; generated: string } | null> {
        return this.mappingData$.pipe(
            map(data => {
                if (!data) return null;
                return {
                    loaded: true,
                    totalMappings: data.metadata.mappedParts,
                    generated: data.metadata.generated
                };
            })
        );
    }
}

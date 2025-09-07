import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { GlobalSettings, Set, UserInventory } from '../../models/models';
import { ColorGroupingService } from '../../services/color-grouping.service';
import { DataService } from '../../services/data.service';
import { ImageService } from '../../services/image.service';
import { StorageService } from '../../services/storage.service';

@Component({
    selector: 'app-sets',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule],
    templateUrl: './sets.component.html',
    styleUrls: ['./sets.component.css']
})
export class SetsComponent implements OnInit {
    sets: Set[] = [];
    userInventories: UserInventory[] = [];
    filteredSets: Set[] = [];
    paginatedSets: Set[] = [];
    searchTerm: string = '';
    yearFilter: number | null = null;
    loading = true;
    selectedVersions: Record<string, number> = {};
    allInventoryProgress: Record<string, { totalOwned: number, totalNeeded: number, progress: number }> = {};
    allInventorySetImageUrls: Record<string, string> = {};

    // Global settings
    globalSettings: GlobalSettings = {
        imagePreviewSize: '1x',
        includeSparePartsInProgress: true,
        alwaysTrackLoosePartsByColor: false
    };

    // Pagination properties
    currentPage = 1;
    itemsPerPage = 24;
    totalPages = 0;
    totalCount = 0;
    hasNext = false;
    Math = Math; // Make Math available in template

    // Image overlay properties
    showImageOverlay = false;
    overlayImageUrl = '';
    overlayImageAlt = '';

    constructor(
        private dataService: DataService,
        private colorGroupingService: ColorGroupingService,
        private imageService: ImageService,
        private storageService: StorageService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        // Load user inventories and global settings
        this.storageService.getState().subscribe({
            next: (state) => {
                this.userInventories = state.userInventories;
                this.globalSettings = { ...state.globalSettings };
                this.getAllInventoryProgress();
                this.getAllInventorySetImageUrls();
            },
            error: (error) => {
                console.error('Error loading user inventories:', error);
            }
        });

        // Load first page of sets
        this.loadSetsPage();
    }

    loadSetsPage(): void {
        this.loading = true;

        let obs = this.dataService.getSetsPaginated(
            this.currentPage,
            this.itemsPerPage,
            this.searchTerm,
            this.yearFilter || undefined
        ).subscribe({
            next: (response) => {
                this.paginatedSets = response.sets;
                this.totalCount = response.totalCount;
                this.hasNext = response.hasNext;
                this.totalPages = Math.ceil(this.totalCount / this.itemsPerPage);

                // Initialize selected versions to the first version for each set
                this.paginatedSets.forEach(set => {
                    if (set.versions && set.versions.length > 0) {
                        this.selectedVersions[set.set_num] = set.versions[0];
                    }
                });

                this.loading = false;
            },
            error: (error) => {
                console.error('Sets component: Error loading sets page:', error);
                this.loading = false;
                // Set empty arrays so the component still works
                this.paginatedSets = [];
                this.totalCount = 0;
                this.hasNext = false;
                this.totalPages = 0;
            }
        });
    }

    filterSets(): void {
        this.currentPage = 1; // Reset to first page when filtering
        this.loadSetsPage();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.yearFilter = null;
        this.filterSets();
    }

    goToPage(page: number): void {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.loadSetsPage();
        }
    }

    nextPage(): void {
        this.goToPage(this.currentPage + 1);
    }

    previousPage(): void {
        this.goToPage(this.currentPage - 1);
    }

    getPageNumbers(): number[] {
        const pages: number[] = [];
        const maxPagesToShow = 5;
        const halfRange = Math.floor(maxPagesToShow / 2);

        let startPage = Math.max(1, this.currentPage - halfRange);
        let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

        // Adjust start page if we're near the end
        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return pages;
    }

    isSetTracked(setNum: string, version?: number): boolean {
        if (version) {
            return this.userInventories.some(inv => inv.set_num === setNum && inv.version === version);
        }
        return this.userInventories.some(inv => inv.set_num === setNum);
    }

    getInventoryLink(setNum: string): any[] {
        const inventory = this.userInventories.find(inv => inv.set_num === setNum);
        return inventory ? ['/inventory', inventory.id] : ['/sets'];
    }

    addToMyInventory(set: Set, version: number = 1): void {
        if (this.isSetTracked(set.set_num)) {
            return; // Already tracking this set
        }

        const newInventory: UserInventory = {
            id: uuidv4(),
            set_num: set.set_num,
            version: version,
            name: set.name,
            partsOwned: {},
            minifigsOwned: {},
            minifigPartsOwned: {},
            lastUpdated: Date.now()
        };

        this.storageService.addUserInventory(newInventory);
    }

    removeFromMyInventory(setNum: string, version: number = 1): void {
        const inventory = this.userInventories.find(inv => inv.set_num === setNum && inv.version === version);
        if (inventory) {
            this.storageService.deleteUserInventory(inventory.id);
        }
    }

    async getAllInventoryProgress(): Promise<void> {
        for (const inventory of this.userInventories) {
            // Use unique key that includes both set_num and version
            const uniqueKey = `${inventory.set_num}_v${inventory.version}`;
            this.allInventoryProgress[uniqueKey] = await this.getInventoryProgressAsync(inventory);
        }
    }

    async getInventoryProgressAsync(inventory: UserInventory): Promise<{ totalOwned: number, totalNeeded: number, progress: number }> {
        try {
            // Wait for data to be loaded
            const dataLoaded = await firstValueFrom(this.dataService.isDataLoaded());
            if (!dataLoaded) {
                return { totalOwned: 0, totalNeeded: 0, progress: 0 };
            }

            // Convert version to number to ensure type consistency (fix for string vs number issue)
            const versionAsNumber = Number(inventory.version);

            // Get both parts and minifigures for the user's specified version
            const [inventoryParts, inventoryMinifigs] = await Promise.all([
                firstValueFrom(this.dataService.getSetInventoryPartsBySetNum(inventory.set_num, versionAsNumber)),
                firstValueFrom(this.dataService.getSetInventoryMinifigsBySetNum(inventory.set_num, versionAsNumber))
            ]);

            let totalNeeded = 0;
            let totalOwned = 0;

            // Process regular parts and spare parts based on global setting
            if (inventoryParts) {
                for (const invPart of inventoryParts) {
                    // Skip spare parts if the setting is disabled
                    if (!this.globalSettings.includeSparePartsInProgress && invPart.is_spare) {
                        continue;
                    }

                    // Use the same key generation logic as the inventory detail component
                    const key = this.getPartStorageKey(invPart.part_num, invPart.color_id, invPart.is_spare);
                    const quantityOwned = inventory.partsOwned[key] || 0;
                    totalNeeded += invPart.quantity;
                    totalOwned += Math.min(quantityOwned, invPart.quantity); // Don't count excess
                }
            }

            // Process minifigures
            if (inventoryMinifigs) {
                for (const invMinifig of inventoryMinifigs) {
                    const quantityOwned = inventory.minifigsOwned[invMinifig.fig_num] || 0;
                    totalNeeded += invMinifig.quantity;
                    totalOwned += Math.min(quantityOwned, invMinifig.quantity); // Don't count excess
                }
            }

            const progress = totalNeeded > 0 ? (totalOwned / totalNeeded) * 100 : 0;
            return { totalOwned, totalNeeded, progress };
        } catch (error) {
            console.error('Error calculating inventory progress:', error);
            return { totalOwned: 0, totalNeeded: 0, progress: 0 };
        }
    }

    /**
     * Generate storage key for parts, with different keys for spare parts vs regular parts
     * This matches the logic used in the inventory detail component
     */
    private getPartStorageKey(partNum: string, colorId: number, isSpare: boolean): string {
        // Apply color aliasing if My Colors is enabled for sets
        const effectiveColorId = this.colorGroupingService.shouldApplyToSets()
            ? this.colorGroupingService.getEffectiveColorId(colorId)
            : colorId;

        const baseKey = `${partNum}_${effectiveColorId}`;
        return isSpare ? `spare_${baseKey}` : baseKey;
    }

    getInventoryProgress(inventory: UserInventory): { totalOwned: number, totalNeeded: number, progress: number } {
        // Use unique key that includes both set_num and version
        const uniqueKey = `${inventory.set_num}_v${inventory.version}`;
        return this.allInventoryProgress[uniqueKey] || { totalOwned: 0, totalNeeded: 0, progress: 0 };
    }

    getSetImageUrl(setNum: string): string {
        const set = this.paginatedSets.find(s => s.set_num === setNum);
        return this.imageService.getSetImageUrl(set?.img_url);
    }

    getAllInventorySetImageUrls(): void {
        for (const inventory of this.userInventories) {
            this.dataService.getSet(inventory.set_num).subscribe({
                next: (set) => {
                    this.allInventorySetImageUrls[inventory.set_num] = this.imageService.getSetImageUrl(set?.img_url);
                    // tell angular to update the template
                    this.cdr.detectChanges();
                },
                error: (error) => {
                    console.error('Error getting set image URL:', error);
                    this.allInventorySetImageUrls[inventory.set_num] = this.imageService.getSetImageUrl(undefined);
                }
            });
        }
    }

    onImageError(event: Event): void {
        const img = event.target as HTMLImageElement;
        const currentSrc = img.src;

        // If we're already showing the placeholder, don't try again
        if (currentSrc.includes('placeholder.svg')) {
            return;
        }

        // For sets component, we primarily deal with set images, but we can still try the inventory_parts fallback
        // Try to extract part_num and color from the image context if available
        let partNum: string | undefined;
        let colorId: number | undefined;

        // Try to find the part number and color from the image context
        // Look through parent elements to find part information
        let element = img.parentElement;
        while (element && (!partNum || colorId === undefined)) {
            // Look for part data in parent elements
            const partCard = element.closest('[data-part-num]');
            if (partCard) {
                partNum = partCard.getAttribute('data-part-num') || undefined;
                const colorAttr = partCard.getAttribute('data-color-id');
                colorId = colorAttr ? parseInt(colorAttr) : undefined;
                break;
            }
            element = element.parentElement;
        }

        // If we couldn't find part info from DOM, try to extract from the current src URL
        if (!partNum || colorId === undefined) {
            // Try to extract from rebrickable URL pattern
            const elementUrlMatch = currentSrc.match(/elements\/(\d+)\.jpg/);
            if (elementUrlMatch) {
                const elementId = elementUrlMatch[1];
                // Find the element in our elements data
                // We don't have direct access to elements data here, so this is a fallback for future enhancement
                // For now, skip to placeholder
            }
        }

        // For parts in sets, use part-specific error handling
        if (partNum && colorId !== undefined) {
            this.imageService.handleImageError(
                img,
                partNum,
                colorId,
                (pNum, cId) => this.dataService.getFallbackImageFromInventoryPartsFast(pNum, cId)
            );
        } else {
            // For set images, use general error handling
            this.imageService.handleGeneralImageError(img);
        }
    }

    openImageOverlay(imageUrl: string, altText: string): void {
        this.overlayImageUrl = imageUrl;
        this.overlayImageAlt = altText;
        this.showImageOverlay = true;
        // Prevent body scrolling when overlay is open
        document.body.style.overflow = 'hidden';
    }

    closeImageOverlay(): void {
        this.showImageOverlay = false;
        this.overlayImageUrl = '';
        this.overlayImageAlt = '';
        // Restore body scrolling
        document.body.style.overflow = 'auto';
    }

    onOverlayClick(event: Event): void {
        // Close overlay if clicking on the backdrop (not the image)
        if (event.target === event.currentTarget) {
            this.closeImageOverlay();
        }
    }

    getLargeImageUrl(imageUrl: string): string {
        return this.imageService.getLargeImageUrl(imageUrl);
    }

    /**
     * Handle image errors in the overlay (large image view)
     * This provides fallback logic for the large image display
     */
    onOverlayImageError(event: Event): void {
        const img = event.target as HTMLImageElement;
        this.imageService.handleGeneralImageError(img);
    }
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, combineLatest, map, takeUntil } from 'rxjs';

import {
    Color,
    Element,
    LoosePartEntry,
    LoosePartsInventory,
    Part,
    PartCategory,
    PartCategoryToSection,
    PartSection
} from '../../models/models';
import { DataService } from '../../services/data.service';
import { LoadingService } from '../../services/loading.service';
import { StorageService } from '../../services/storage.service';

interface PartWithDetails extends Part {
    category: PartCategory | null;
    section: PartSection | null;
    loosePartEntry: LoosePartEntry | null;
    totalOwnedQuantity: number;
    hasImageUrl: string;
}

@Component({
    selector: 'app-loose-parts',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './loose-parts.component.html',
    styleUrls: ['./loose-parts.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoosePartsComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    // Data
    loosePartsInventories: LoosePartsInventory[] = [];
    activeInventory: LoosePartsInventory | null = null;
    allParts: Part[] = [];
    allPartCategories: PartCategory[] = [];
    allPartSections: PartSection[] = [];
    allPartCategoryToSection: PartCategoryToSection[] = [];
    allColors: Color[] = [];
    allElements: Element[] = [];
    filteredParts: PartWithDetails[] = [];
    paginatedParts: PartWithDetails[] = [];
    categoryToSectionMap: Map<number, PartSection> = new Map();
    elementsMap: Map<string, string> = new Map(); // Maps "part_num_color_id" to element_id
    partColorsMap: Map<string, number[]> = new Map(); // Maps part_num to available color_ids

    // Computed properties for template optimization
    partsBySection: Array<{ section: PartSection | null; parts: PartWithDetails[] }> = [];
    categoriesForSelectedSection: PartCategory[] = [];
    selectedSection: PartSection | null = null;
    selectedCategory: PartCategory | null = null;
    pageNumbers: number[] = [];

    // UI State
    loading = true;
    showOnlyOwned = false;
    groupByCategory = true;
    searchTerm = '';
    viewMode: 'tiles' | 'list' = 'tiles';
    sortField: 'partName' | 'partNumber' | 'category' | 'quantity' | 'lastUpdated' | 'popularity' = 'popularity';
    sortDirection: 'asc' | 'desc' = 'desc';

    // Navigation State
    navigationStep: 'sections' | 'categories' | 'parts' = 'sections';
    selectedSectionId: number | null = null;
    selectedCategoryId: number | null = null;

    // Pagination
    currentPage = 1;
    itemsPerPage = 48;
    totalPages = 0;

    // Modal states
    showNewInventoryModal = false;
    showImageOverlay = false;
    overlayImageUrl = '';
    overlayImageAlt = '';
    newInventoryName = '';
    newInventoryDescription = '';

    // Color tracking modal
    showColorTrackingModal = false;
    colorTrackingPart: PartWithDetails | null = null;
    colorTrackingQuantities: Record<number, number> = {};

    // Constants
    private readonly DEFAULT_YELLOW_COLOR_ID = 14; // Yellow color for default part images

    constructor(
        private dataService: DataService,
        private storageService: StorageService,
        private loadingService: LoadingService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // TrackBy functions for optimization
    trackByInventoryId(index: number, inventory: LoosePartsInventory): string {
        return inventory.id;
    }

    trackBySectionId(index: number, section: PartSection): number {
        return section.id;
    }

    trackByCategoryId(index: number, category: PartCategory): number {
        return category.id;
    }

    trackByPartNumber(index: number, part: PartWithDetails): string {
        return part.part_num;
    }

    trackByColorId(index: number, color: Color): number {
        return color.id;
    }

    trackBySectionGroup(index: number, group: { section: PartSection | null; parts: PartWithDetails[] }): string {
        return group.section?.id?.toString() || 'uncategorized';
    }

    trackByPageNumber(index: number, page: number): number {
        return page;
    }

    private buildCategoryToSectionMap(): void {
        this.categoryToSectionMap.clear();

        // Create a map of section id to section object
        const sectionMap = new Map<number, PartSection>();
        this.allPartSections.forEach(section => {
            sectionMap.set(section.id, section);
        });

        // Map categories to their sections
        this.allPartCategoryToSection.forEach(mapping => {
            const section = sectionMap.get(mapping.section_id);
            if (section) {
                this.categoryToSectionMap.set(mapping.id, section);
            }
        });
    }

    private buildElementsMap(): void {
        this.elementsMap.clear();
        this.partColorsMap.clear();

        // Group elements by part number to track available colors
        const partColorGroups = new Map<string, number[]>();

        this.allElements.forEach(element => {
            // Create lookup key using part_num and color_id
            const key = `${element.part_num}_${element.color_id}`;
            this.elementsMap.set(key, element.element_id);

            // Track available colors for each part
            if (!partColorGroups.has(element.part_num)) {
                partColorGroups.set(element.part_num, []);
            }
            partColorGroups.get(element.part_num)!.push(element.color_id);
        });

        // Convert to final map with sorted color arrays
        partColorGroups.forEach((colorIds, partNum) => {
            // Sort colors to ensure consistent ordering (ascending)
            const sortedColors = [...new Set(colorIds)].sort((a, b) => a - b);
            this.partColorsMap.set(partNum, sortedColors);
        });
    }

    private getPartImageUrl(partNum: string, colorId?: number): string {
        // Use default yellow color if no specific color provided
        const requestedColorId = colorId || this.DEFAULT_YELLOW_COLOR_ID;
        let elementKey = `${partNum}_${requestedColorId}`;
        let elementId = this.elementsMap.get(elementKey);

        // If requested color not available, try to find first available color for this part
        if (!elementId) {
            const availableColors = this.partColorsMap.get(partNum);
            if (availableColors && availableColors.length > 0) {
                // Use the first available color (colors are sorted ascending)
                const firstAvailableColorId = availableColors[0];
                elementKey = `${partNum}_${firstAvailableColorId}`;
                elementId = this.elementsMap.get(elementKey);
            }
        }

        if (elementId) {
            return `https://cdn.rebrickable.com/media/thumbs/parts/elements/${elementId}.jpg/800x800p.jpg?` + (Date.now() % 1000000);
        }

        // For parts without elements data, return placeholder immediately to avoid blocking UI
        // The actual image will be resolved asynchronously after page load
        return 'assets/images/placeholder.svg';
    }

    /**
     * Asynchronously resolve actual image URLs for parts that don't have elements data
     * This runs after the page has loaded to avoid blocking the UI
     */
    private async resolvePartImages(): Promise<void> {
        // Small delay to ensure the page is fully rendered first
        await new Promise(resolve => setTimeout(resolve, 100));

        for (const part of this.filteredParts) {
            // Skip parts that already have element-based images
            if (part.hasImageUrl !== 'assets/images/placeholder.svg') {
                continue;
            }

            // Try to get actual image URL from inventory_parts data
            const requestedColorId = this.getDisplayColorForPart(part.part_num) || this.DEFAULT_YELLOW_COLOR_ID;
            const actualImageUrl = this.dataService.getFallbackImageFromInventoryPartsFast(part.part_num, requestedColorId);

            if (actualImageUrl) {
                // Update the part's image URL
                part.hasImageUrl = actualImageUrl;

                // Trigger change detection to update the UI
                this.cdr.markForCheck();

                // Small delay between updates to avoid blocking the UI
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    }

    private loadData(): void {
        combineLatest([
            this.dataService.isDataLoaded(),
            this.storageService.getState()
        ]).pipe(
            takeUntil(this.destroy$),
            map(([dataLoaded, appState]) => ({ dataLoaded, appState }))
        ).subscribe(({ dataLoaded, appState }) => {
            if (dataLoaded) {
                this.allParts = this.dataService.getCurrentParts();
                this.allPartCategories = this.dataService.getCurrentPartCategories();
                this.allPartSections = this.dataService.getCurrentPartSections();
                this.allPartCategoryToSection = this.dataService.getCurrentPartCategoryToSection();
                this.allColors = this.dataService.getCurrentColors();
                this.allElements = this.dataService.getCurrentElements();

                // Load popularity scores
                const popularityScores = this.dataService.getCurrentPartPopularityScores();

                // Build category to section mapping
                this.buildCategoryToSectionMap();

                // Build elements mapping for image URLs
                this.buildElementsMap();

                this.loosePartsInventories = appState.loosePartsInventories || [];
                this.setActiveInventory(appState.activeLoosePartsInventoryId);

                this.loading = false;
                this.updateComputedProperties();
                this.filterAndSortParts();
                this.cdr.markForCheck();
            }
        });
    }

    private setActiveInventory(inventoryId: string | null): void {
        if (inventoryId && this.loosePartsInventories.length > 0) {
            this.activeInventory = this.loosePartsInventories.find(inv => inv.id === inventoryId) || null;
        }

        if (!this.activeInventory && this.loosePartsInventories.length > 0) {
            this.activeInventory = this.loosePartsInventories[0];
            this.storageService.setActiveLoosePartsInventory(this.activeInventory.id);
        }

        if (this.activeInventory?.viewPreferences) {
            this.showOnlyOwned = this.activeInventory.viewPreferences.showOnlyOwned;
            this.viewMode = this.activeInventory.viewPreferences.viewMode;
            this.groupByCategory = this.activeInventory.viewPreferences.groupByCategory;
        }

        if (this.activeInventory?.sortPreferences) {
            this.sortField = this.activeInventory.sortPreferences.field;
            this.sortDirection = this.activeInventory.sortPreferences.direction;
        }
    }

    private updateComputedProperties(): void {
        // Update categories for selected section
        if (this.selectedSectionId) {
            this.categoriesForSelectedSection = this.allPartCategories.filter(category => {
                const section = this.categoryToSectionMap.get(category.id);
                return section && section.id === this.selectedSectionId;
            });
        } else {
            this.categoriesForSelectedSection = [];
        }

        // Update selected section
        this.selectedSection = this.selectedSectionId
            ? this.allPartSections.find(section => section.id === this.selectedSectionId) || null
            : null;

        // Update selected category
        this.selectedCategory = this.selectedCategoryId
            ? this.allPartCategories.find(category => category.id === this.selectedCategoryId) || null
            : null;

        // Update page numbers
        this.updatePageNumbers();

        // Update parts by section grouping
        this.updatePartsBySection();
    }

    private updatePageNumbers(): void {
        const pages: number[] = [];
        const maxPagesToShow = 5;
        const halfRange = Math.floor(maxPagesToShow / 2);

        let startPage = Math.max(1, this.currentPage - halfRange);
        const endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        this.pageNumbers = pages;
    }

    private updatePartsBySection(): void {
        const sectionGroups = new Map<number | null, { section: PartSection | null; parts: PartWithDetails[] }>();

        this.paginatedParts.forEach(part => {
            const sectionId = part.section?.id || null;

            if (!sectionGroups.has(sectionId)) {
                sectionGroups.set(sectionId, {
                    section: part.section,
                    parts: []
                });
            }

            sectionGroups.get(sectionId)!.parts.push(part);
        });

        // Convert to array and sort by section name
        const sectionsArray = Array.from(sectionGroups.values());
        sectionsArray.sort((a, b) => {
            if (!a.section && !b.section) return 0;
            if (!a.section) return 1; // Uncategorized sections at the end
            if (!b.section) return -1;
            return a.section.name.localeCompare(b.section.name);
        });

        this.partsBySection = sectionsArray;
    }

    // Inventory Management
    createNewInventory(): void {
        if (!this.newInventoryName.trim()) return;

        const newInventory: LoosePartsInventory = {
            id: `loose-parts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: this.newInventoryName.trim(),
            description: this.newInventoryDescription.trim() || undefined,
            parts: {},
            lastUpdated: Date.now(),
            sortPreferences: {
                field: 'partName',
                direction: 'asc'
            },
            viewPreferences: {
                showOnlyOwned: false,
                viewMode: 'tiles',
                groupByCategory: true
            }
        };

        this.storageService.addLoosePartsInventory(newInventory);
        this.closeNewInventoryModal();
    }

    switchInventory(inventoryId: string): void {
        this.storageService.setActiveLoosePartsInventory(inventoryId);
    }

    deleteInventory(inventoryId: string): void {
        if (confirm('Are you sure you want to delete this loose parts inventory? This action cannot be undone.')) {
            this.storageService.deleteLoosePartsInventory(inventoryId);
        }
    }

    // UI Modal Management
    openNewInventoryModal(): void {
        this.showNewInventoryModal = true;
        this.newInventoryName = '';
        this.newInventoryDescription = '';
        this.cdr.markForCheck();
    }

    closeNewInventoryModal(): void {
        this.showNewInventoryModal = false;
        this.cdr.markForCheck();
    }

    openImageOverlay(imageUrl: string, alt: string): void {
        this.overlayImageUrl = imageUrl;
        this.overlayImageAlt = alt;
        this.showImageOverlay = true;
        this.cdr.markForCheck();
    }

    closeImageOverlay(): void {
        this.showImageOverlay = false;
        this.cdr.markForCheck();
    }

    onOverlayClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.closeImageOverlay();
        }
    }

    onImageError(event: any): void {
        const img = event.target as HTMLImageElement;
        const currentSrc = img.src;

        // If we're already showing the placeholder, don't try again
        if (currentSrc.includes('placeholder.svg')) {
            return;
        }

        // Try to extract part_num and color from the image alt text or data attributes
        // We'll look for this info in the img element or its parent elements
        let partNum: string | undefined;
        let colorId: number | undefined;

        // Try to find the part number and color from the image context
        // Look through parent elements to find part information
        let element = img.parentElement;
        while (element && (!partNum || colorId === undefined)) {
            // Look for part data in parent elements
            const partCard = element.closest('.part-card, [data-part-num]');
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
                const element = this.allElements.find(e => e.element_id === elementId);
                if (element) {
                    partNum = element.part_num;
                    colorId = element.color_id;
                }
            }
        }

        // If we have part information, try the fast inventory_parts fallback
        if (partNum && colorId !== undefined) {
            const fallbackUrl = this.dataService.getFallbackImageFromInventoryPartsFast(partNum, colorId);
            if (fallbackUrl && fallbackUrl !== currentSrc) {
                img.src = fallbackUrl;
                return;
            }
        }

        // Final fallback to placeholder
        img.src = 'assets/images/placeholder.svg';
    }

    getPartImageUrlForColor(partNum: string, colorId: number): string {
        // First try element-based URL
        const elementBasedUrl = this.getPartImageUrl(partNum, colorId);

        // If we got an element-based URL (not placeholder), return it
        if (elementBasedUrl !== 'assets/images/placeholder.svg') {
            return elementBasedUrl;
        }

        // For color tracking modal, try immediate fast fallback since these are user-requested
        const fallbackUrl = this.dataService.getFallbackImageFromInventoryPartsFast(partNum, colorId);
        if (fallbackUrl) {
            return fallbackUrl;
        }

        // Return placeholder if no image found
        return 'assets/images/placeholder.svg';
    }

    /**
     * Get the actual color ID being used for display (useful for debugging)
     * Returns the color ID that would be used when displaying this part
     */
    getDisplayColorForPart(partNum: string, preferredColorId?: number): number | null {
        const requestedColorId = preferredColorId || this.DEFAULT_YELLOW_COLOR_ID;
        const elementKey = `${partNum}_${requestedColorId}`;

        // Check if requested color is available
        if (this.elementsMap.has(elementKey)) {
            return requestedColorId;
        }

        // If not, return the first available color
        const availableColors = this.partColorsMap.get(partNum);
        if (availableColors && availableColors.length > 0) {
            return availableColors[0];
        }

        // No colors available
        return null;
    }

    /**
     * Get the color name being displayed for a part
     */
    getDisplayColorNameForPart(partNum: string, preferredColorId?: number): string | null {
        const colorId = this.getDisplayColorForPart(partNum, preferredColorId);
        if (colorId === null) {
            return null;
        }

        const color = this.allColors.find(c => c.id === colorId);
        return color?.name || null;
    }

    /**
     * Check if the part is being displayed in the default yellow color
     */
    isDisplayingDefaultColor(partNum: string): boolean {
        const displayColorId = this.getDisplayColorForPart(partNum);
        return displayColorId === this.DEFAULT_YELLOW_COLOR_ID;
    }

    /**
     * Get the RGB color value for the color being displayed for a part (for template use)
     */
    getDisplayColorRgb(partNum: string): string {
        const colorId = this.getDisplayColorForPart(partNum);
        if (colorId === null) {
            return 'CCCCCC'; // Default gray if no color found
        }

        const color = this.allColors.find(c => c.id === colorId);
        return color?.rgb || 'CCCCCC';
    }

    getLargeImageUrl(imageUrl: string): string {
        if (!imageUrl || imageUrl.includes('placeholder.svg')) {
            return 'assets/images/placeholder.svg';
        }

        // For higher resolution, try to get a larger version of the image
        // This assumes the image URL can be modified to get a larger version
        if (imageUrl.includes('https://cdn.rebrickable.com/media/') && !imageUrl.includes('https://cdn.rebrickable.com/media/thumbs/')) {
            // replace https://cdn.rebrickable.com/media/ with https://cdn.rebrickable.com/media/thumbs/ and append a timestamp
            return imageUrl.replace('https://cdn.rebrickable.com/media/', 'https://cdn.rebrickable.com/media/thumbs/') + '/800x800p.jpg?' + Date.now();
        }

        return imageUrl;
    }

    /**
     * Handle image errors in the overlay (large image view)
     * This provides fallback logic for the large image display
     */
    onOverlayImageError(event: any): void {
        const img = event.target as HTMLImageElement;
        const currentSrc = img.src;

        // If we're already showing the placeholder, don't try again
        if (currentSrc.includes('placeholder.svg')) {
            return;
        }

        // Try to extract part information from the overlay image alt text
        // The alt text should contain the part name, and we can use the overlayImageUrl to get part info
        let partNum: string | undefined;
        let colorId: number | undefined;

        // Try to extract from the original overlay URL pattern if it's an element-based URL
        const originalUrl = this.overlayImageUrl;
        if (originalUrl.includes('elements/')) {
            const elementUrlMatch = originalUrl.match(/elements\/(\d+)\.jpg/);
            if (elementUrlMatch) {
                const elementId = elementUrlMatch[1];
                const element = this.allElements.find(e => e.element_id === elementId);
                if (element) {
                    partNum = element.part_num;
                    colorId = element.color_id;
                }
            }
        }

        // If we couldn't extract from URL, try to find the part from the currently displayed parts
        // that matches the overlay image URL or alt text
        if (!partNum && this.overlayImageAlt) {
            const matchingPart = this.filteredParts.find(part =>
                part.name === this.overlayImageAlt ||
                this.overlayImageUrl === part.hasImageUrl
            );
            if (matchingPart) {
                partNum = matchingPart.part_num;
                colorId = this.getDisplayColorForPart(matchingPart.part_num) || this.DEFAULT_YELLOW_COLOR_ID;
            }
        }

        // If we have part information, try the fast inventory_parts fallback
        if (partNum && colorId !== undefined) {
            const fallbackUrl = this.dataService.getFallbackImageFromInventoryPartsFast(partNum, colorId);
            if (fallbackUrl && fallbackUrl !== currentSrc) {
                // For large image, try to get a higher resolution version if possible
                let largeImageUrl = fallbackUrl;
                if (fallbackUrl.includes('https://cdn.rebrickable.com/media/') && !fallbackUrl.includes('/800x800p.jpg')) {
                    if (fallbackUrl.includes('https://cdn.rebrickable.com/media/thumbs/')) {
                        largeImageUrl = fallbackUrl.replace('.jpg', '/800x800p.jpg');
                    } else {
                        largeImageUrl = fallbackUrl.replace('https://cdn.rebrickable.com/media/', 'https://cdn.rebrickable.com/media/thumbs/') + '/800x800p.jpg';
                    }
                }

                img.src = largeImageUrl;
                return;
            }
        }

        // Final fallback to placeholder
        img.src = 'assets/images/placeholder.svg';
    }

    // Filtering and Sorting
    filterAndSortParts(): void {
        // Only filter and show parts when both section and category are selected
        if (this.navigationStep !== 'parts' || !this.selectedSectionId || !this.selectedCategoryId) {
            this.filteredParts = [];
            this.updatePagination();
            this.cdr.markForCheck();
            return;
        }

        if (!this.allParts || this.allParts.length === 0) {
            this.filteredParts = [];
            this.updatePagination();
            this.cdr.markForCheck();
            return;
        }

        // Start with all parts and filter by selected category
        let parts: PartWithDetails[] = this.allParts
            .filter(part => part.part_cat_id === this.selectedCategoryId)
            .map(part => {
                const category = this.allPartCategories.find(cat => cat.id === part.part_cat_id) || null;
                const section = category ? this.categoryToSectionMap.get(category.id) || null : null;
                const loosePartEntry = this.activeInventory?.parts[part.part_num] || null;

                let totalOwnedQuantity = 0;
                if (loosePartEntry) {
                    if (loosePartEntry.trackByColor && loosePartEntry.colorQuantities) {
                        totalOwnedQuantity = Object.values(loosePartEntry.colorQuantities).reduce((sum, qty) => sum + qty, 0);
                    } else {
                        totalOwnedQuantity = loosePartEntry.totalQuantity || 0;
                    }
                }

                // Generate image URL for the part (default yellow color)
                const hasImageUrl = this.getPartImageUrl(part.part_num);

                return {
                    ...part,
                    category,
                    section,
                    loosePartEntry,
                    totalOwnedQuantity,
                    hasImageUrl
                };
            });

        // Apply search filter if provided
        if (this.searchTerm.trim()) {
            const searchLower = this.searchTerm.toLowerCase();
            parts = parts.filter(part =>
                part.name.toLowerCase().includes(searchLower) ||
                part.part_num.toLowerCase().includes(searchLower)
            );
        }

        // Apply owned filter if enabled
        if (this.showOnlyOwned) {
            parts = parts.filter(part => part.totalOwnedQuantity > 0);
        }

        // Apply sorting
        parts.sort((a, b) => {
            let compareValue = 0;

            switch (this.sortField) {
                case 'partName':
                    compareValue = a.name.localeCompare(b.name);
                    break;
                case 'partNumber':
                    compareValue = String(a.part_num).localeCompare(String(b.part_num));
                    break;
                case 'category': {
                    const categoryA = a.category?.name || '';
                    const categoryB = b.category?.name || '';
                    compareValue = categoryA.localeCompare(categoryB);
                    break;
                }
                case 'quantity':
                    compareValue = a.totalOwnedQuantity - b.totalOwnedQuantity;
                    break;
                case 'lastUpdated': {
                    const timeA = a.loosePartEntry?.lastUpdated || 0;
                    const timeB = b.loosePartEntry?.lastUpdated || 0;
                    compareValue = timeA - timeB;
                    break;
                }
                case 'popularity': {
                    const popularityA = this.dataService.getPartPopularityScore(a.part_num);
                    const popularityB = this.dataService.getPartPopularityScore(b.part_num);
                    compareValue = popularityA - popularityB;

                    // Secondary sort by part number for ties
                    if (compareValue === 0) {
                        compareValue = String(a.part_num).localeCompare(String(b.part_num));
                    }
                    break;
                }
            }

            return this.sortDirection === 'asc' ? compareValue : -compareValue;
        });

        this.filteredParts = parts;
        this.updatePagination();
        this.cdr.markForCheck();

        // Trigger async image resolution after the page has rendered
        // This will replace placeholder images with actual images from inventory_parts
        setTimeout(() => {
            this.resolvePartImages();
        }, 0);
    }

    updatePagination(): void {
        this.totalPages = Math.ceil(this.filteredParts.length / this.itemsPerPage);
        this.currentPage = Math.min(this.currentPage, this.totalPages || 1);

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        this.paginatedParts = this.filteredParts.slice(startIndex, endIndex);

        // Update computed properties after pagination changes
        this.updatePageNumbers();
        this.updatePartsBySection();
    }

    clearFilters(): void {
        this.searchTerm = '';
        this.showOnlyOwned = false;
        this.currentPage = 1;
        this.filterAndSortParts();
    }

    onSearchChange(): void {
        this.currentPage = 1;
        this.filterAndSortParts();
    }

    toggleShowOnlyOwned(): void {
        this.showOnlyOwned = !this.showOnlyOwned;
        this.currentPage = 1;
        this.saveViewPreferences();
        this.filterAndSortParts();
    }

    toggleGroupByCategory(): void {
        this.groupByCategory = !this.groupByCategory;
        this.saveViewPreferences();
    }

    changeViewMode(mode: 'tiles' | 'list'): void {
        this.viewMode = mode;
        this.saveViewPreferences();
    }

    onSortSelectionChange(value: string): void {
        const [field, direction] = value.split('|');

        this.sortField = field as 'partName' | 'partNumber' | 'category' | 'quantity' | 'lastUpdated' | 'popularity';
        this.sortDirection = direction as 'asc' | 'desc';

        this.saveSortPreferences();
        this.filterAndSortParts();
    }

    changeSortField(field: 'partName' | 'partNumber' | 'category' | 'quantity' | 'lastUpdated' | 'popularity'): void {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            // For popularity, default to desc (most popular first)
            this.sortDirection = field === 'popularity' ? 'desc' : 'asc';
        }

        this.saveSortPreferences();
        this.filterAndSortParts();
    }

    // Pagination
    previousPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePagination();
        }
    }

    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePagination();
        }
    }

    goToPage(page: number): void {
        this.currentPage = page;
        this.updatePagination();
    }



    // Part Quantity Management
    updatePartQuantity(part: PartWithDetails, newQuantity: number): void {
        if (!this.activeInventory) return;

        newQuantity = Math.max(0, Math.floor(newQuantity));

        const existingEntry = this.activeInventory.parts[part.part_num];

        if (newQuantity === 0 && existingEntry) {
            // Remove the part entry if quantity is 0
            delete this.activeInventory.parts[part.part_num];
        } else if (newQuantity > 0) {
            const updatedEntry: LoosePartEntry = {
                part_num: part.part_num,
                trackByColor: existingEntry?.trackByColor || false,
                totalQuantity: existingEntry?.trackByColor ? undefined : newQuantity,
                colorQuantities: existingEntry?.trackByColor ? existingEntry.colorQuantities : undefined,
                lastUpdated: Date.now()
            };

            // If tracking by color, we need to handle this differently
            if (updatedEntry.trackByColor && updatedEntry.colorQuantities) {
                // Don't update if in color tracking mode - use color modal instead
                return;
            }

            this.activeInventory.parts[part.part_num] = updatedEntry;
        }

        this.activeInventory.lastUpdated = Date.now();
        this.storageService.updateLoosePartsInventory(this.activeInventory);
        this.filterAndSortParts();
        this.cdr.markForCheck();
    }

    toggleColorTracking(part: PartWithDetails): void {
        if (!this.activeInventory) return;

        const existingEntry = this.activeInventory.parts[part.part_num];
        const currentlyTrackingByColor = existingEntry?.trackByColor || false;

        if (currentlyTrackingByColor) {
            // Switch to tracking by total quantity only
            const totalQuantity = existingEntry?.colorQuantities ?
                Object.values(existingEntry.colorQuantities).reduce((sum, qty) => sum + qty, 0) : 0;

            this.activeInventory.parts[part.part_num] = {
                part_num: part.part_num,
                trackByColor: false,
                totalQuantity: totalQuantity,
                colorQuantities: undefined,
                lastUpdated: Date.now()
            };
        } else {
            // Switch to tracking by color - open color modal
            this.openColorTrackingModal(part);
            return;
        }

        this.activeInventory.lastUpdated = Date.now();
        this.storageService.updateLoosePartsInventory(this.activeInventory);
        this.filterAndSortParts();
    }

    openColorTrackingModal(part: PartWithDetails): void {
        this.colorTrackingPart = part;

        // Initialize color quantities
        this.colorTrackingQuantities = {};
        const existingEntry = this.activeInventory?.parts[part.part_num];

        if (existingEntry?.colorQuantities) {
            this.colorTrackingQuantities = { ...existingEntry.colorQuantities };
        } else if (existingEntry?.totalQuantity) {
            // Convert total quantity to yellow color (default)
            const yellowColorId = 3;
            this.colorTrackingQuantities[yellowColorId] = existingEntry.totalQuantity;
        }

        this.showColorTrackingModal = true;
        this.cdr.markForCheck();
    }

    closeColorTrackingModal(): void {
        this.showColorTrackingModal = false;
        this.colorTrackingPart = null;
        this.colorTrackingQuantities = {};
        this.cdr.markForCheck();
    }

    saveColorTracking(): void {
        if (!this.activeInventory || !this.colorTrackingPart) return;

        // Remove colors with 0 quantity
        const cleanedQuantities: Record<number, number> = {};
        Object.entries(this.colorTrackingQuantities).forEach(([colorId, quantity]) => {
            const qty = Math.max(0, Math.floor(quantity));
            if (qty > 0) {
                cleanedQuantities[parseInt(colorId)] = qty;
            }
        });

        const hasAnyQuantity = Object.keys(cleanedQuantities).length > 0;

        if (hasAnyQuantity) {
            this.activeInventory.parts[this.colorTrackingPart.part_num] = {
                part_num: this.colorTrackingPart.part_num,
                trackByColor: true,
                totalQuantity: undefined,
                colorQuantities: cleanedQuantities,
                lastUpdated: Date.now()
            };
        } else {
            // Remove entry if no colors have quantity
            delete this.activeInventory.parts[this.colorTrackingPart.part_num];
        }

        this.activeInventory.lastUpdated = Date.now();
        this.storageService.updateLoosePartsInventory(this.activeInventory);
        this.closeColorTrackingModal();
        this.filterAndSortParts();
    }

    updateColorQuantity(colorId: number, quantity: number): void {
        quantity = Math.max(0, Math.floor(quantity));
        if (quantity > 0) {
            this.colorTrackingQuantities[colorId] = quantity;
        } else {
            delete this.colorTrackingQuantities[colorId];
        }
    }

    getTotalColorQuantity(): number {
        return Object.values(this.colorTrackingQuantities).reduce((sum, qty) => sum + qty, 0);
    }

    /**
     * Get only the colors that are available for the part currently being tracked
     */
    getAvailableColorsForTrackingPart(): Color[] {
        if (!this.colorTrackingPart) {
            return [];
        }

        const availableColorIds = this.partColorsMap.get(this.colorTrackingPart.part_num);
        if (!availableColorIds || availableColorIds.length === 0) {
            return [];
        }

        // Filter allColors to only include available colors for this part
        return this.allColors.filter(color => availableColorIds.includes(color.id));
    }

    /**
     * Get the number of available colors for a specific part
     */
    getAvailableColorCount(partNum: string): number {
        const availableColorIds = this.partColorsMap.get(partNum);
        return availableColorIds ? availableColorIds.length : 0;
    }

    /**
     * Get pre-calculated popularity score for a part
     */
    getPopularityScore(partNum: string): number {
        return this.dataService.getPartPopularityScore(partNum);
    }

    /**
     * Format popularity score for display
     */
    formatPopularityScore(score: number): string {
        if (score >= 1000000) {
            return (score / 1000000).toFixed(1) + 'M';
        } else if (score >= 1000) {
            return (score / 1000).toFixed(1) + 'K';
        } else {
            return score.toString();
        }
    }

    // Preferences Management
    private saveViewPreferences(): void {
        if (!this.activeInventory) return;

        this.activeInventory.viewPreferences = {
            showOnlyOwned: this.showOnlyOwned,
            viewMode: this.viewMode,
            groupByCategory: this.groupByCategory
        };
        this.activeInventory.lastUpdated = Date.now();
        this.storageService.updateLoosePartsInventory(this.activeInventory);
    }

    private saveSortPreferences(): void {
        if (!this.activeInventory) return;

        this.activeInventory.sortPreferences = {
            field: this.sortField,
            direction: this.sortDirection
        };
        this.activeInventory.lastUpdated = Date.now();
        this.storageService.updateLoosePartsInventory(this.activeInventory);
    }

    // Navigation Methods
    selectSection(sectionId: number): void {
        this.selectedSectionId = sectionId;
        this.selectedCategoryId = null;
        this.navigationStep = 'categories';
        this.currentPage = 1;
        this.updateComputedProperties();
        this.cdr.markForCheck();
    }

    selectCategory(categoryId: number): void {
        this.selectedCategoryId = categoryId;
        this.navigationStep = 'parts';
        this.currentPage = 1;
        this.updateComputedProperties();
        this.filterAndSortParts();
    }

    goBackToSections(): void {
        this.navigationStep = 'sections';
        this.selectedSectionId = null;
        this.selectedCategoryId = null;
        this.filteredParts = [];
        this.paginatedParts = [];
        this.currentPage = 1;
        this.updatePagination();
        this.updateComputedProperties();
        this.cdr.markForCheck();
    }

    goBackToCategories(): void {
        this.navigationStep = 'categories';
        this.selectedCategoryId = null;
        this.filteredParts = [];
        this.paginatedParts = [];
        this.currentPage = 1;
        this.updatePagination();
        this.updateComputedProperties();
        this.cdr.markForCheck();
    }

    getCategoriesForSection(sectionId: number): PartCategory[] {
        return this.allPartCategories.filter(category => {
            const section = this.categoryToSectionMap.get(category.id);
            return section && section.id === sectionId;
        });
    }

    getPartsCountForCategory(categoryId: number): number {
        return this.allParts.filter(part => part.part_cat_id === categoryId).length;
    }

    /**
     * Get the Rebrickable URL for a part
     */
    getRebrickableUrl(partNum: string): string {
        return `https://rebrickable.com/parts/${partNum}/`;
    }

    // Utility
    Math = Math;

    // Helper method for event target value extraction
    getInputValue(event: Event): number {
        return parseFloat((event.target as HTMLInputElement).value) || 0;
    }


}

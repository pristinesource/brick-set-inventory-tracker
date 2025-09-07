import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, combineLatest, takeUntil } from 'rxjs';

import {
    Color,
    Element,
    LoosePartEntry,
    LoosePartsInventory,
    Part,
    PartCategory
} from '../../models/models';
import { ColorGroupingService } from '../../services/color-grouping.service';
import { DataService } from '../../services/data.service';
import { ImageService } from '../../services/image.service';
import { LoadingService } from '../../services/loading.service';
import { StorageService } from '../../services/storage.service';

interface CollectionPartDetails {
    part: Part;
    entry: LoosePartEntry;
    category: PartCategory | null;
    imageUrl: string;
    availableColors: { colorId: number; colorName: string; rgb: string }[];
    displayColorId: number;
    displayColorRgb: string;
    displayColorName: string;
    totalQuantity: number;
    originalQuantity: number; // Store original quantity for soft delete
}

@Component({
    selector: 'app-collection-inventory',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './collection-inventory.component.html',
    styleUrls: ['./collection-inventory.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionInventoryComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    // Data
    collection: LoosePartsInventory | null = null;
    collectionId: string = '';
    partsDetails: CollectionPartDetails[] = [];
    filteredParts: CollectionPartDetails[] = [];
    paginatedParts: CollectionPartDetails[] = [];

    // Reference data
    allParts: Map<string, Part> = new Map();
    allColors: Map<number, Color> = new Map();
    allCategories: Map<number, PartCategory> = new Map();
    allElements: Element[] = [];
    elementsMap: Map<string, string> = new Map();

    // UI State
    loading = true;
    searchTerm = '';
    sortField: 'partName' | 'partNumber' | 'category' | 'quantity' = 'partName';
    sortDirection: 'asc' | 'desc' = 'asc';
    viewMode: 'tiles' | 'list' = 'tiles';
    showZeroQuantity = true; // Show parts with 0 quantity for soft delete

    // Pagination
    currentPage = 1;
    itemsPerPage = 48;
    totalPages = 0;
    pageNumbers: number[] = [];

    // Tracking changes
    hasUnsavedChanges = false;

    // Computed properties for template
    get totalPartsCount(): number {
        return this.partsDetails.length;
    }

    get totalQuantity(): number {
        return this.partsDetails.reduce((sum, item) => sum + item.totalQuantity, 0);
    }

    get zeroQuantityCount(): number {
        return this.partsDetails.filter(item => item.totalQuantity === 0).length;
    }

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private dataService: DataService,
        private storageService: StorageService,
        private imageService: ImageService,
        private loadingService: LoadingService,
        private colorGroupingService: ColorGroupingService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadingService.showLoading('Loading collection inventory');

        // Get collection ID from route
        this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
            this.collectionId = params['id'];
            this.loadData();
        });
    }

    ngOnDestroy(): void {
        // Save changes if any
        if (this.hasUnsavedChanges) {
            this.saveChanges();
        }
        this.destroy$.next();
        this.destroy$.complete();
    }

    private async loadData(): Promise<void> {
        // Wait for data to be loaded and get app state
        combineLatest([
            this.dataService.isDataLoaded(),
            this.storageService.getState()
        ]).pipe(
            takeUntil(this.destroy$)
        ).subscribe(async ([dataLoaded, appState]) => {
            if (dataLoaded) {
                // Get reference data from DataService
                const parts = this.dataService.getCurrentParts();
                const colors = this.dataService.getCurrentColors();
                const categories = this.dataService.getCurrentPartCategories();
                const elements = this.dataService.getCurrentElements();

                // Store reference data
                parts.forEach(part => this.allParts.set(part.part_num, part));
                colors.forEach(color => this.allColors.set(color.id, color));
                categories.forEach(cat => this.allCategories.set(cat.id, cat));
                this.allElements = elements;

                // Build elements map
                elements.forEach(element => {
                    const key = `${element.part_num}_${element.color_id}`;
                    this.elementsMap.set(key, element.element_id);
                });

                // Find the collection
                const inventories = appState.loosePartsInventories || [];
                this.collection = inventories.find(inv => inv.id === this.collectionId) || null;

                if (this.collection) {
                    await this.buildPartsDetails();
                } else {
                    // Collection not found, navigate back
                    this.router.navigate(['/loose-parts']);
                }

                this.loading = false;
                this.loadingService.hideLoading();
                this.cdr.markForCheck();
            }
        });
    }

    private async buildPartsDetails(): Promise<void> {
        if (!this.collection) return;

        this.partsDetails = [];

        const partsPromises = Object.entries(this.collection.parts).map(async ([partNum, entry]): Promise<CollectionPartDetails | null> => {
            const part = this.allParts.get(partNum);
            if (!part) return null;

            const category = part.part_cat_id ? this.allCategories.get(part.part_cat_id) || null : null;

            // Calculate total quantity
            let totalQuantity = 0;
            if (entry.trackByColor && entry.colorQuantities) {
                totalQuantity = Object.values(entry.colorQuantities).reduce((sum, qty) => sum + qty, 0);
            } else if (entry.totalQuantity !== undefined) {
                totalQuantity = entry.totalQuantity;
            }

            // Get available colors for this part
            const availableColors: { colorId: number; colorName: string; rgb: string }[] = [];
            const colorIds = new Set<number>();

            this.allElements.forEach(element => {
                if (element.part_num === partNum) {
                    colorIds.add(element.color_id);
                }
            });

            colorIds.forEach(colorId => {
                const color = this.allColors.get(colorId);
                if (color) {
                    availableColors.push({
                        colorId: color.id,
                        colorName: color.name,
                        rgb: color.rgb
                    });
                }
            });

            // Determine display color
            let displayColorId = -1;
            let displayColorRgb = 'CCCCCC';
            let displayColorName = 'Unknown';

            if (entry.trackByColor && entry.colorQuantities) {
                // Use the color with highest quantity
                let maxQty = 0;
                Object.entries(entry.colorQuantities).forEach(([colorIdStr, qty]) => {
                    if (qty > maxQty) {
                        maxQty = qty;
                        displayColorId = parseInt(colorIdStr, 10);
                    }
                });
            } else if (availableColors.length > 0) {
                // Use first available color
                displayColorId = availableColors[0].colorId;
            }

            if (displayColorId !== -1) {
                const color = this.allColors.get(displayColorId);
                if (color) {
                    displayColorRgb = color.rgb;
                    displayColorName = color.name;
                }
            }

            // Build part colors map for the image service
            const partColorsMap = new Map<string, number[]>();
            partColorsMap.set(partNum, availableColors.map(c => c.colorId));

            // Get image URL
            const imageUrl = await this.imageService.getPartImageUrl(
                partNum,
                displayColorId === -1 ? undefined : displayColorId,
                this.elementsMap,
                partColorsMap
            );

            return {
                part,
                entry,
                category,
                imageUrl,
                availableColors,
                displayColorId,
                displayColorRgb,
                displayColorName,
                totalQuantity,
                originalQuantity: totalQuantity
            };
        });

        const results = await Promise.all(partsPromises);
        this.partsDetails = results.filter((item): item is CollectionPartDetails => item !== null);
        this.filterAndSort();
    }

    // Search and filter
    onSearchChange(): void {
        this.currentPage = 1;
        this.filterAndSort();
    }

    toggleShowZeroQuantity(): void {
        this.showZeroQuantity = !this.showZeroQuantity;
        this.currentPage = 1;
        this.filterAndSort();
    }

    private filterAndSort(): void {
        // Filter
        this.filteredParts = this.partsDetails.filter(item => {
            // Filter out zero quantity if needed
            if (!this.showZeroQuantity && item.totalQuantity === 0) {
                return false;
            }

            // Search filter
            if (this.searchTerm) {
                const search = this.searchTerm.toLowerCase();
                return (
                    item.part.part_num.toLowerCase().includes(search) ||
                    item.part.name.toLowerCase().includes(search) ||
                    (item.category?.name.toLowerCase().includes(search) || false)
                );
            }

            return true;
        });

        // Sort
        this.filteredParts.sort((a, b) => {
            let comparison = 0;

            switch (this.sortField) {
                case 'partNumber':
                    comparison = a.part.part_num.localeCompare(b.part.part_num);
                    break;
                case 'partName':
                    comparison = a.part.name.localeCompare(b.part.name);
                    break;
                case 'category':
                    const catA = a.category?.name || '';
                    const catB = b.category?.name || '';
                    comparison = catA.localeCompare(catB);
                    break;
                case 'quantity':
                    comparison = a.totalQuantity - b.totalQuantity;
                    break;
            }

            return this.sortDirection === 'asc' ? comparison : -comparison;
        });

        this.updatePagination();
    }

    changeSort(field: 'partName' | 'partNumber' | 'category' | 'quantity'): void {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }
        this.filterAndSort();
    }

    changeViewMode(mode: 'tiles' | 'list'): void {
        this.viewMode = mode;
    }

    // Pagination
    private updatePagination(): void {
        this.totalPages = Math.ceil(this.filteredParts.length / this.itemsPerPage);

        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        this.paginatedParts = this.filteredParts.slice(startIndex, endIndex);

        // Generate page numbers
        const maxVisiblePages = 7;
        this.pageNumbers = [];

        if (this.totalPages <= maxVisiblePages) {
            for (let i = 1; i <= this.totalPages; i++) {
                this.pageNumbers.push(i);
            }
        } else {
            this.pageNumbers.push(1);

            let startPage = Math.max(2, this.currentPage - 2);
            let endPage = Math.min(this.totalPages - 1, this.currentPage + 2);

            if (startPage > 2) {
                this.pageNumbers.push(-1); // Ellipsis
            }

            for (let i = startPage; i <= endPage; i++) {
                this.pageNumbers.push(i);
            }

            if (endPage < this.totalPages - 1) {
                this.pageNumbers.push(-1); // Ellipsis
            }

            this.pageNumbers.push(this.totalPages);
        }

        this.cdr.markForCheck();
    }

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
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.updatePagination();
        }
    }

    // Quantity management
    updateQuantity(item: CollectionPartDetails, newQuantity: number | string | null): void {
        if (!this.collection) return;

        // Convert to number and validate
        let qty: number;
        if (typeof newQuantity === 'string') {
            qty = parseInt(newQuantity, 10);
        } else if (typeof newQuantity === 'number') {
            qty = newQuantity;
        } else {
            return; // null or invalid input
        }

        if (isNaN(qty) || qty < 0) return;

        // Update the display quantity
        item.totalQuantity = qty;

        // Update the entry
        if (item.entry.trackByColor) {
            // If tracking by color, distribute quantity proportionally
            if (item.entry.colorQuantities) {
                const totalOriginal = Object.values(item.entry.colorQuantities).reduce((sum, q) => sum + q, 0);
                if (totalOriginal > 0) {
                    const ratio = qty / totalOriginal;
                    Object.keys(item.entry.colorQuantities).forEach(colorId => {
                        item.entry.colorQuantities![parseInt(colorId, 10)] =
                            Math.round(item.entry.colorQuantities![parseInt(colorId, 10)] * ratio);
                    });
                }
            }
        } else {
            item.entry.totalQuantity = qty;
        }

        item.entry.lastUpdated = Date.now();

        // Don't remove from collection even if quantity is 0 (soft delete)
        // The part will be removed when the user navigates away or refreshes

        this.hasUnsavedChanges = true;
        this.cdr.markForCheck();
    }

    incrementQuantity(item: CollectionPartDetails): void {
        this.updateQuantity(item, item.totalQuantity + 1);
    }

    decrementQuantity(item: CollectionPartDetails): void {
        if (item.totalQuantity > 0) {
            this.updateQuantity(item, item.totalQuantity - 1);
        }
    }

    onQuantityChange(item: CollectionPartDetails, event: Event): void {
        const target = event.target as HTMLInputElement;
        this.updateQuantity(item, target.value);
    }

    // Save changes
    saveChanges(): void {
        if (!this.collection || !this.hasUnsavedChanges) return;

        // Remove parts with 0 quantity before saving
        const updatedParts: Record<string, LoosePartEntry> = {};

        this.partsDetails.forEach(item => {
            if (item.totalQuantity > 0) {
                updatedParts[item.part.part_num] = item.entry;
            }
        });

        this.collection.parts = updatedParts;
        this.collection.lastUpdated = Date.now();

        // Save to storage
        this.storageService.updateLoosePartsInventory(this.collection);
        this.hasUnsavedChanges = false;
    }

    // Navigation
    navigateBack(): void {
        if (this.hasUnsavedChanges) {
            this.saveChanges();
        }
        this.router.navigate(['/loose-parts']);
    }

    // Track by functions for performance
    trackByPartNum(index: number, item: CollectionPartDetails): string {
        return item.part.part_num;
    }

    trackByPageNumber(index: number, page: number): number {
        return page;
    }
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, combineLatest, map, takeUntil } from 'rxjs';

import {
  Color,
  Element,
  InventoryPart,
  LoosePartEntry,
  LoosePartsInventory,
  Part,
  PartCategory,
  PartCategoryToSection,
  PartSection
} from '../../models/models';
import { ColorGroupingService } from '../../services/color-grouping.service';
import { DataService } from '../../services/data.service';
import { ImageService } from '../../services/image.service';
import { LoadingService } from '../../services/loading.service';
import { StorageService } from '../../services/storage.service';

interface PartWithDetails extends Part {
  category: PartCategory | null;
  section: PartSection | null;
  loosePartEntry: LoosePartEntry | null;
  totalOwnedQuantity: number;
  hasImageUrl: string;
  displayColorId: number;
  isDefaultColor: boolean;
  displayColorRgb: string;
  displayColorName: string;
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

  // Performance optimization caches
  sectionCategoryCache = new Map<number, PartCategory[]>();
  categoryPartsCountCache = new Map<number, number>();
  partColorPopularityCache = new Map<string, number>(); // Cache for part-color popularity scores

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
  colorTrackingModalLoading = false;
  colorTrackingPart: PartWithDetails | null = null;
  colorTrackingQuantities: Record<number, number> = {};
  cachedColorGroups: { groupName: string; colors: Color[] }[] = [];
  cachedColorImageUrls: Map<number, string> = new Map();
  showHiddenColors = false; // Track whether to show colors not in My Colors

  // Constants
  private readonly DEFAULT_YELLOW_COLOR_ID = 14; // Yellow color for default part images

  constructor(
    private dataService: DataService,
    private colorGroupingService: ColorGroupingService,
    private imageService: ImageService,
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

  trackByColorGroup(index: number, group: { groupName: string; colors: Color[] }): string {
    return group.groupName;
  }

  private clearCaches(): void {
    this.sectionCategoryCache.clear();
    this.categoryPartsCountCache.clear();
    this.partColorPopularityCache.clear();
    this.cachedColorGroups = [];
  }

  private buildCategoryToSectionMap(): void {
    this.categoryToSectionMap.clear();
    // Clear caches when rebuilding maps
    this.clearCaches();

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
    return this.imageService.getPartImageUrlSync(partNum, colorId, this.elementsMap, this.partColorsMap);
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
    // Immediately set placeholder - no complex logic or DOM traversal
    if (!img.src.includes('placeholder.svg')) {
      img.src = 'assets/images/placeholder.svg';
    }
  }

  /**
   * Specific image error handler for the color modal to prevent image disappearing
   */
  onColorModalImageError(event: any, partNum: string, colorId: number): void {
    const img = event.target as HTMLImageElement;
    this.imageService.handleImageError(
      img,
      partNum,
      colorId,
      (pNum, cId) => this.dataService.getFallbackImageFromInventoryPartsFast(pNum, cId)
    );
  }

  getPartImageUrlForColor(partNum: string, colorId: number): string {
    // Use pre-computed URL from cache to avoid repeated computation
    const cachedUrl = this.cachedColorImageUrls.get(colorId);
    if (cachedUrl) {
      return cachedUrl;
    }

    // Fallback if not in cache (shouldn't happen if cache is properly populated)
    return this.imageService.getPartImageUrlForColor(
      partNum,
      colorId,
      this.elementsMap,
      (pNum, cId) => this.dataService.getFallbackImageFromInventoryPartsFast(pNum, cId)
    );
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
    return this.imageService.getLargeImageUrl(imageUrl);
  }

  /**
   * Handle image errors in the overlay (large image view)
   * This provides fallback logic for the large image display
   */
  onOverlayImageError(event: any): void {
    const img = event.target as HTMLImageElement;
    // Immediately set placeholder - no complex logic
    if (!img.src.includes('placeholder.svg')) {
      img.src = 'assets/images/placeholder.svg';
    }
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

        // Pre-compute display values to avoid repeated calculations in templates
        const displayColorId = this.getDisplayColorForPart(part.part_num) || this.DEFAULT_YELLOW_COLOR_ID;
        const isDefaultColor = displayColorId === this.DEFAULT_YELLOW_COLOR_ID;

        // Pre-compute color properties
        const displayColor = this.allColors.find(c => c.id === displayColorId);
        const displayColorRgb = displayColor?.rgb || 'CCCCCC';
        const displayColorName = displayColor?.name || 'Unknown';

        // Generate image URL for the part
        const hasImageUrl = this.getPartImageUrl(part.part_num);

        return {
          ...part,
          category,
          section,
          loosePartEntry,
          totalOwnedQuantity,
          hasImageUrl,
          displayColorId,
          isDefaultColor,
          displayColorRgb,
          displayColorName
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

    // DISABLED: Image resolution disabled due to CORS restrictions
    // Images will load directly from CDN without optimization
    // setTimeout(() => {
    //     this.resolvePartImages();
    // }, 0);
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

  async openColorTrackingModal(part: PartWithDetails): Promise<void> {
    this.colorTrackingPart = part;
    this.colorTrackingModalLoading = true;
    this.showColorTrackingModal = true;
    this.cdr.markForCheck();

    // Small delay to let the modal appear with loading state
    await new Promise(resolve => setTimeout(resolve, 10));

    // Initialize color quantities
    this.colorTrackingQuantities = {};
    const existingEntry = this.activeInventory?.parts[part.part_num];

    if (existingEntry?.colorQuantities) {
      // Apply color aliasing when loading existing quantities
      this.colorTrackingQuantities = this.colorGroupingService.combineAliasedQuantities(existingEntry.colorQuantities);
    } else if (existingEntry?.totalQuantity) {
      // Convert total quantity to yellow color (default)
      const yellowColorId = 3;
      const effectiveYellowId = this.colorGroupingService.getEffectiveColorId(yellowColorId);
      this.colorTrackingQuantities[effectiveYellowId] = existingEntry.totalQuantity;
    }

    // Pre-compute color groups to avoid recalculation on every change detection
    this.cachedColorGroups = this.getAvailableColorsGroupedForTrackingPart();

    // Pre-compute all color image URLs to avoid repeated method calls in template
    this.cachedColorImageUrls.clear();
    const allColors = this.cachedColorGroups.flatMap(group => group.colors);
    for (const color of allColors) {
      const url = this.imageService.getPartImageUrlForColor(
        part.part_num,
        color.id,
        this.elementsMap,
        (pNum, cId) => this.dataService.getFallbackImageFromInventoryPartsFast(pNum, cId)
      );
      this.cachedColorImageUrls.set(color.id, url);
    }

    this.colorTrackingModalLoading = false;
    this.cdr.markForCheck();
  }

  closeColorTrackingModal(): void {
    this.showColorTrackingModal = false;
    this.colorTrackingModalLoading = false;
    this.colorTrackingPart = null;
    this.colorTrackingQuantities = {};
    this.cachedColorGroups = [];
    this.cachedColorImageUrls.clear();
    this.showHiddenColors = false; // Reset hidden colors state
    this.cdr.markForCheck();
  }

  saveColorTracking(): void {
    if (!this.activeInventory || !this.colorTrackingPart) return;

    // Apply color aliasing - combine quantities for aliased colors
    const combinedQuantities = this.colorGroupingService.combineAliasedQuantities(this.colorTrackingQuantities);

    // Remove colors with 0 quantity
    const cleanedQuantities: Record<number, number> = {};
    Object.entries(combinedQuantities).forEach(([colorId, quantity]) => {
      const qty = Math.max(0, Math.floor(Number(quantity)));
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
    // Apply color aliasing - convert to primary color if part of an alias
    const effectiveColorId = this.colorGroupingService.getEffectiveColorId(colorId);

    quantity = Math.max(0, Math.floor(quantity));
    if (quantity > 0) {
      this.colorTrackingQuantities[effectiveColorId] = quantity;
    } else {
      delete this.colorTrackingQuantities[effectiveColorId];
    }
  }

  /**
   * Toggle showing hidden colors in the color tracking modal
   */
  toggleHiddenColors(): void {
    this.showHiddenColors = !this.showHiddenColors;
    // Recompute color groups with new filter setting
    this.cachedColorGroups = this.getAvailableColorsGroupedForTrackingPart();
    this.cdr.markForCheck();
  }

  /**
   * Get the number of hidden colors for the current part
   */
  getHiddenColorsCount(): number {
    if (!this.colorTrackingPart) {
      return 0;
    }

    const availableColorIds = this.partColorsMap.get(this.colorTrackingPart.part_num);
    if (!availableColorIds || availableColorIds.length === 0) {
      return 0;
    }

    const availableColors = this.allColors.filter(color => availableColorIds.includes(color.id));
    const myColorsSettings = this.storageService.getMyColorsSettings();

    // If no colors are enabled in My Colors, nothing is hidden
    if (myColorsSettings.enabledColorIds.length === 0) {
      return 0;
    }

    // Count how many colors would be hidden (not in My Colors and not part of an alias)
    let hiddenCount = 0;
    const seenPrimaryColors = new Set<number>();

    availableColors.forEach(color => {
      const alias = this.storageService.isColorInAlias(color.id);

      if (alias) {
        // This is an aliased color - count it as hidden only if we haven't seen the primary color yet
        if (!seenPrimaryColors.has(alias.primaryColorId)) {
          seenPrimaryColors.add(alias.primaryColorId);
          // Aliased colors are always shown, so don't count as hidden
        }
      } else {
        // Not aliased - check if it's in My Colors
        if (!myColorsSettings.enabledColorIds.includes(color.id)) {
          hiddenCount++;
        }
      }
    });

    return hiddenCount;
  }

  /**
   * Check if My Colors filtering is active
   */
  hasMyColorsEnabled(): boolean {
    const myColorsSettings = this.storageService.getMyColorsSettings();
    return myColorsSettings.enabledColorIds.length > 0;
  }

  /**
   * Get the display name for a color, considering aliases
   */
  getColorDisplayName(color: Color): string {
    const alias = this.storageService.isColorInAlias(color.id);
    return alias ? alias.name : color.name;
  }

  /**
   * Check if a color is in My Colors (either directly or as part of an alias)
   */
  isColorInMyColors(color: Color): boolean {
    const myColorsSettings = this.storageService.getMyColorsSettings();

    // Check if it's part of an alias (aliases are always in My Colors)
    const alias = this.storageService.isColorInAlias(color.id);
    if (alias) {
      return true;
    }

    // Check if it's directly in My Colors
    return myColorsSettings.enabledColorIds.includes(color.id);
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
    const availableColors = this.allColors.filter(color => availableColorIds.includes(color.id));

    // Sort colors by group, then by part-color popularity within each group
    return this.sortColorsByGroup(availableColors, this.colorTrackingPart.part_num);
  }

  /**
   * Get colors grouped by their color group for section display
   */
  getAvailableColorsGroupedForTrackingPart(): Array<{ groupName: string; colors: Color[] }> {
    if (!this.colorTrackingPart) {
      return [];
    }

    const availableColorIds = this.partColorsMap.get(this.colorTrackingPart.part_num);
    if (!availableColorIds || availableColorIds.length === 0) {
      return [];
    }

    // Filter allColors to only include available colors for this part
    let availableColors = this.allColors.filter(color => availableColorIds.includes(color.id));

    // Process color aliases - replace aliased colors with their primary colors
    const processedColors = new Map<number, Color>();
    const myColorsSettings = this.storageService.getMyColorsSettings();

    availableColors.forEach(color => {
      const alias = this.storageService.isColorInAlias(color.id);

      if (alias) {
        // This color is part of an alias - use the primary color instead
        const primaryColor = this.allColors.find(c => c.id === alias.primaryColorId);
        if (primaryColor && !processedColors.has(alias.primaryColorId)) {
          processedColors.set(alias.primaryColorId, primaryColor);
        }
      } else {
        // Not an aliased color - check if it should be shown based on My Colors filter
        if (this.showHiddenColors || myColorsSettings.enabledColorIds.length === 0 ||
          myColorsSettings.enabledColorIds.includes(color.id)) {
          processedColors.set(color.id, color);
        }
      }
    });

    // Convert map back to array
    const colorsToDisplay = Array.from(processedColors.values());

    // Group colors by their group number
    const colorGroups = new Map<number, Color[]>();

    colorsToDisplay.forEach(color => {
      const groupNumber = this.colorGroupingService.getColorGroup(color.id);
      if (!colorGroups.has(groupNumber)) {
        colorGroups.set(groupNumber, []);
      }
      colorGroups.get(groupNumber)!.push(color);
    });

    // Sort colors within each group by part-color popularity (most popular first)
    colorGroups.forEach(colors => {
      colors.sort((a, b) => {
        const popularityA = this.getPartColorPopularityScore(this.colorTrackingPart!.part_num, a.id);
        const popularityB = this.getPartColorPopularityScore(this.colorTrackingPart!.part_num, b.id);

        if (popularityA !== popularityB) {
          return popularityB - popularityA; // Descending order (most popular first)
        }

        // If popularity is the same, fall back to alphabetical order
        return a.name.localeCompare(b.name);
      });
    });

    // Convert to array and sort by group number
    const groupArray = Array.from(colorGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupNumber, colors]) => ({
        groupName: this.colorGroupingService.getColorGroupName(groupNumber),
        colors: colors
      }));

    return groupArray;
  }

  /**
   * Calculate popularity score for a specific part-color combination
   * Based on how many times this part+color appears across all sets (weighted by quantity)
   */
  private getPartColorPopularityScore(partNum: string, colorId: number): number {
    // Check cache first
    const cacheKey = `${partNum}_${colorId}`;
    if (this.partColorPopularityCache.has(cacheKey)) {
      return this.partColorPopularityCache.get(cacheKey)!;
    }

    const allInventoryParts = this.dataService.getAllInventoryParts();

    if (!allInventoryParts || allInventoryParts.length === 0) {
      this.partColorPopularityCache.set(cacheKey, 0);
      return 0;
    }

    let totalScore = 0;

    // Find all inventory entries for this specific part+color combination
    const matchingEntries = allInventoryParts.filter(
      (invPart: InventoryPart) => invPart.part_num === partNum && invPart.color_id === colorId
    );

    // Sum up all quantities across all sets that contain this part+color
    for (const entry of matchingEntries) {
      totalScore += entry.quantity;
    }

    // Cache the result
    this.partColorPopularityCache.set(cacheKey, totalScore);
    return totalScore;
  }

  /**
* Sort colors by group (1-6), then by popularity within each group for a specific part
*/
  private sortColorsByGroup(colors: Color[], partNum?: string): Color[] {
    return colors.sort((a, b) => {
      const groupA = this.colorGroupingService.getColorGroup(a.id);
      const groupB = this.colorGroupingService.getColorGroup(b.id);

      // First sort by group number
      if (groupA !== groupB) {
        return groupA - groupB;
      }

      // Then sort by part-color popularity within the same group (most popular first)
      if (partNum) {
        const popularityA = this.getPartColorPopularityScore(partNum, a.id);
        const popularityB = this.getPartColorPopularityScore(partNum, b.id);

        if (popularityA !== popularityB) {
          return popularityB - popularityA; // Descending order (most popular first)
        }
      }

      // If popularity is the same or no part specified, fall back to alphabetical order
      return a.name.localeCompare(b.name);
    });
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
    // Use cached value if available
    if (this.sectionCategoryCache.has(sectionId)) {
      return this.sectionCategoryCache.get(sectionId)!;
    }

    // Compute and cache
    const categories = this.allPartCategories.filter(category => {
      const section = this.categoryToSectionMap.get(category.id);
      return section && section.id === sectionId;
    });
    this.sectionCategoryCache.set(sectionId, categories);
    return categories;
  }

  getPartsCountForCategory(categoryId: number): number {
    // Use cached value if available
    if (this.categoryPartsCountCache.has(categoryId)) {
      return this.categoryPartsCountCache.get(categoryId)!;
    }

    // Compute and cache
    const count = this.allParts.filter(part => part.part_cat_id === categoryId).length;
    this.categoryPartsCountCache.set(categoryId, count);
    return count;
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

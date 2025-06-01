import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { StorageService } from '../../services/storage.service';
import {
  UserInventory, Inventory, InventoryPart,
  Part, Color, InventoryMinifig, Minifig, SortOption, Element, GlobalSettings, PartialSet, UndoAction, Theme
} from '../../models/models';
import type { Set } from '../../models/models';
import { switchMap, map, forkJoin, of, catchError, filter } from 'rxjs';

interface PartDetail {
  inventoryPart: InventoryPart;
  part: Part;
  color: Color;
  imageUrl: string;
  quantityNeeded: number;
  quantityOwned: number;
  elementId?: string; // Element ID for this part/color combination
  // Set information for missing parts mode
  setName?: string;
  setNum?: string;
  inventoryId?: string;
}

interface MinifigDetail {
  inventoryMinifig: InventoryMinifig;
  minifig: Minifig;
  imageUrl: string;
  quantityNeeded: number;
  quantityOwned: number;
  // Set information for missing parts mode
  setName?: string;
  setNum?: string;
  inventoryId?: string;
}

@Component({
  selector: 'app-inventory-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './inventory-detail.component.html',
  styleUrls: ['./inventory-detail.component.css']
})
export class InventoryDetailComponent implements OnInit, OnDestroy {
  userInventory: UserInventory | null = null;
  inventory: Inventory | null = null;
  set: PartialSet | null = null;
  parts: PartDetail[] = [];
  minifigs: MinifigDetail[] = [];
  spareParts: PartDetail[] = [];
  loading = true;
  searchTerm = '';
  filteredParts: PartDetail[] = [];
  activeTab: 'parts' | 'minifigs' | 'spare-parts' = 'parts';
  missingPartsCount = 0;
  missingMinifigsCount = 0;
  missingSparePartsCount = 0;

  // Missing parts mode
  isMissingPartsMode = false;
  userInventories: UserInventory[] = [];

  // Set details
  theme: Theme | null = null;
  uniqueColorsCount = 0;

  // Total quantity tracking
  totalPartsNeeded = 0;
  totalPartsOwned = 0;
  totalMinifigsNeeded = 0;
  totalMinifigsOwned = 0;
  totalSparePartsNeeded = 0;
  totalSparePartsOwned = 0;
  overallProgress = 0;

  // Sorting properties
  showSortOptions = false;
  partsSortOptions: SortOption[] = [];
  minifigsSortOptions: SortOption[] = [];
  sparePartsSortOptions: SortOption[] = [];

  // Direct boolean properties for sort panel visibility to prevent expression changed errors
  showPartsSortOptions = false;
  showSparePartsSortOptions = false;
  showMinifigsSortOptions = false;

  // View preferences
  partsViewType: 'tiles' | 'list' = 'tiles';
  minifigsViewType: 'tiles' | 'list' = 'tiles';
  sparePartsViewType: 'tiles' | 'list' = 'tiles';

  // Image overlay properties
  showImageOverlay = false;
  overlayImageUrl = '';
  overlayImageAlt = '';

  // Undo functionality
  private maxUndoHistory = 100;
  canUndo = false;
  showUndoNotification = false;
  undoNotificationMessage = '';

  // Available sort fields
  partSortFields = [
    { value: 'completion', label: 'Completion Status' },
    { value: 'color', label: 'Color' },
    { value: 'partNumber', label: 'Part Number' },
    { value: 'partName', label: 'Part Name' },
    { value: 'elementId', label: 'Element ID' },
    { value: 'quantityMissing', label: 'Quantity Missing' },
    { value: 'quantityNeeded', label: 'Quantity Needed' }
  ];

  minifigSortFields = [
    { value: 'completion', label: 'Completion Status' },
    { value: 'figNumber', label: 'Figure Number' },
    { value: 'figName', label: 'Figure Name' },
    { value: 'quantityMissing', label: 'Quantity Missing' },
    { value: 'quantityNeeded', label: 'Quantity Needed' }
  ];

  // Global settings
  globalSettings: GlobalSettings = {
    imagePreviewSize: '1x',
    includeSparePartsInProgress: true // Default to including spare parts in progress
  };

  // Minifigure parts expansion tracking - now tracks collapsed instead of expanded
  collapsedMinifigParts: string[] = [];

  // Store actual minifigure parts data keyed by figNum
  minifigPartsCache: Map<string, PartDetail[]> = new Map();

  // Cached progress values
  private _totalMinifigPartsProgress = { owned: 0, total: 0, missing: 0, percentage: 0 };

  constructor(
    private route: ActivatedRoute,
    public dataService: DataService,
    private storageService: StorageService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    // Initialize default sort options
    this.initializeDefaultSorting();
  }

  /**
   * Generate storage key for parts, with different keys for spare parts vs regular parts
   */
  private getPartStorageKey(partNum: string, colorId: number, isSpare: boolean): string {
    const baseKey = `${partNum}_${colorId}`;
    return isSpare ? `spare_${baseKey}` : baseKey;
  }

  /**
   * Generate storage key for minifigure parts, including set context for uniqueness
   */
  private getMinifigPartStorageKey(setNum: string, figNum: string, partNum: string, colorId: number): string {
    return `${setNum}_${figNum}_${partNum}_${colorId}`;
  }

  /**
   * Toggle the expansion state of minifigure parts
   */
  toggleMinifigParts(figNum: string): void {
    const index = this.collapsedMinifigParts.indexOf(figNum);
    if (index > -1) {
      // Currently collapsed, expand it (remove from collapsed list)
      this.collapsedMinifigParts.splice(index, 1);
    } else {
      // Currently expanded, collapse it (add to collapsed list)
      this.collapsedMinifigParts.push(figNum);
    }

    // Save the state to user inventory
    this.saveMinifigPartsState();
  }

  /**
   * Check if minifigure parts are expanded (expanded by default, unless in collapsed list)
   */
  isMinifigPartsExpanded(figNum: string): boolean {
    return !this.collapsedMinifigParts.includes(figNum);
  }

  /**
   * Save minifigure parts expanded/collapsed state to user inventory
   */
  private saveMinifigPartsState(): void {
    // Don't save state in missing parts mode since there's no specific user inventory
    if (this.isMissingPartsMode || !this.userInventory) return;

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      collapsedMinifigParts: [...this.collapsedMinifigParts],
      lastUpdated: Date.now()
    };

    this.userInventory = updatedInventory;
    this.storageService.updateUserInventory(updatedInventory);
  }

  /**
   * Load minifigure parts expanded/collapsed state from user inventory
   */
  private loadMinifigPartsState(): void {
    if (this.isMissingPartsMode) {
      // In missing parts mode, default to all expanded (no persistent state needed)
      this.collapsedMinifigParts = [];
    } else if (this.userInventory?.collapsedMinifigParts) {
      // In standard mode, load from user inventory
      this.collapsedMinifigParts = [...this.userInventory.collapsedMinifigParts];
    } else {
      // Default to all expanded (empty collapsed list)
      this.collapsedMinifigParts = [];
    }
  }

  /**
   * Get real minifigure parts data from CSV files
   */
  getMinifigParts(figNum: string): PartDetail[] {
    // Check cache first
    if (this.minifigPartsCache.has(figNum)) {
      const cachedParts = this.minifigPartsCache.get(figNum)!;
      // Always return sorted parts
      return this.sortMinifigParts([...cachedParts]);
    }

    // Get all inventories and find the one for this minifigure
    const allInventories = this.dataService.getCurrentInventories();
    const minifigInventory = allInventories.find(inv => inv.set_num === figNum);

    if (!minifigInventory) {
      // No inventory found for this minifigure, return empty array
      this.minifigPartsCache.set(figNum, []);
      return [];
    }

    // For now, return empty array and load async in the background
    // This prevents blocking the UI while parts are being loaded
    this.loadMinifigPartsAsync(figNum, minifigInventory.id);
    return [];
  }

  /**
   * Load minifigure parts asynchronously and update cache
   */
  private loadMinifigPartsAsync(figNum: string, inventoryId: number): void {
    // Get cached reference data
    const allParts = this.dataService.getCurrentParts();
    const allColors = this.dataService.getCurrentColors();
    const allElements = this.dataService.getCurrentElements();

    // Create quick lookup maps
    const partsMap = new Map(allParts.map(p => [p.part_num, p]));
    const colorsMap = new Map(allColors.map(c => [c.id, c]));
    const elementsMap = new Map(allElements.map(e => [`${e.part_num}_${e.color_id}`, e.element_id]));

    // Load inventory parts for this minifigure
    this.dataService.getInventoryPartsFromCache(inventoryId).subscribe(inventoryParts => {
      const partDetails: PartDetail[] = [];

      for (const invPart of inventoryParts) {
        const part = partsMap.get(invPart.part_num);
        const color = colorsMap.get(invPart.color_id);

        if (part && color) {
          const elementId = elementsMap.get(`${invPart.part_num}_${invPart.color_id}`);
          const storageKey = this.getMinifigPartStorageKey(
            this.userInventory?.set_num || '',
            figNum,
            invPart.part_num,
            invPart.color_id
          );

          const quantityOwned = this.userInventory?.minifigPartsOwned?.[storageKey] || 0;

          const partDetail: PartDetail = {
            inventoryPart: invPart,
            part: part,
            color: color,
            imageUrl: invPart.img_url,
            quantityNeeded: invPart.quantity,
            quantityOwned: quantityOwned,
            elementId: elementId
          };

          partDetails.push(partDetail);
        }
      }

      // Sort the parts before caching
      const sortedParts = this.sortMinifigParts(partDetails);

      // Cache the sorted result
      this.minifigPartsCache.set(figNum, sortedParts);

      // Update total minifigure parts progress after loading parts
      this.updateTotalMinifigPartsProgress();
    });
  }

  /**
   * Sort minifigure parts using a consistent sorting strategy
   * Default sorting: 1. Completion (missing first), 2. Color, 3. Part Number
   */
  private sortMinifigParts(parts: PartDetail[]): PartDetail[] {
    try {
      return parts.sort((a, b) => {
        // 1. Sort by completion status (missing parts first)
        const aComplete = a.quantityOwned >= a.quantityNeeded;
        const bComplete = b.quantityOwned >= b.quantityNeeded;
        if (aComplete !== bComplete) {
          return aComplete ? 1 : -1; // incomplete (missing) first
        }

        // 2. Sort by color name
        const aColorName = String(a.color?.name || '');
        const bColorName = String(b.color?.name || '');
        const colorComparison = aColorName.localeCompare(bColorName);
        if (colorComparison !== 0) {
          return colorComparison;
        }

        // 3. Sort by part number
        const aPartNum = String(a.part?.part_num || '');
        const bPartNum = String(b.part?.part_num || '');
        return aPartNum.localeCompare(bPartNum);
      });
    } catch (error) {
      console.error('Error sorting minifigure parts:', error);
      return parts; // Return unsorted if there's an error
    }
  }

  /**
   * Get progress data for a specific minifigure's parts
   */
  getMinifigPartsProgress(figNum: string): { owned: number, total: number, percentage: number } {
    const parts = this.getMinifigParts(figNum);
    const owned = parts.reduce((sum, part) => sum + part.quantityOwned, 0);
    const total = parts.reduce((sum, part) => sum + part.quantityNeeded, 0);
    const percentage = total > 0 ? Math.round((owned / total) * 100) : 0;
    return { owned, total, percentage };
  }

  /**
   * Get progress data for all minifigures' parts combined
   */
  getTotalMinifigPartsProgress(): { owned: number, total: number, missing: number, percentage: number } {
    return this._totalMinifigPartsProgress;
  }

  private updateTotalMinifigPartsProgress(): void {
    let totalOwned = 0;
    let totalNeeded = 0;

    // Only calculate for minifigures that have loaded parts
    this.minifigs.forEach(minifig => {
      const figNum = minifig.minifig.fig_num;
      const cachedParts = this.minifigPartsCache.get(figNum);

      if (cachedParts && cachedParts.length > 0) {
        // Use cached parts for accurate calculation
        const owned = cachedParts.reduce((sum, part) => sum + part.quantityOwned, 0);
        const needed = cachedParts.reduce((sum, part) => sum + part.quantityNeeded, 0);
        totalOwned += owned;
        totalNeeded += needed;
      }
    });

    const missing = totalNeeded - totalOwned;
    const percentage = totalNeeded > 0 ? Math.round((totalOwned / totalNeeded) * 100) : 0;

    this._totalMinifigPartsProgress = { owned: totalOwned, total: totalNeeded, missing, percentage };
  }

  private updateCounts(): void {
    // Calculate total missing pieces (not unique parts)
    this.missingPartsCount = this.parts.reduce((total, p) => total + Math.max(0, p.quantityNeeded - p.quantityOwned), 0);
    this.missingMinifigsCount = this.minifigs.reduce((total, m) => total + Math.max(0, m.quantityNeeded - m.quantityOwned), 0);
    this.missingSparePartsCount = this.spareParts.reduce((total, p) => total + Math.max(0, p.quantityNeeded - p.quantityOwned), 0);

    // Total quantity tracking
    this.totalPartsNeeded = this.parts.reduce((total, part) => total + part.quantityNeeded, 0);
    this.totalPartsOwned = this.parts.reduce((total, part) => total + part.quantityOwned, 0);
    this.totalMinifigsNeeded = this.minifigs.reduce((total, minifig) => total + minifig.quantityNeeded, 0);
    this.totalMinifigsOwned = this.minifigs.reduce((total, minifig) => total + minifig.quantityOwned, 0);
    this.totalSparePartsNeeded = this.spareParts.reduce((total, part) => total + part.quantityNeeded, 0);
    this.totalSparePartsOwned = this.spareParts.reduce((total, part) => total + part.quantityOwned, 0);

    // Overall progress calculation based on global setting
    let totalNeeded: number;
    let totalOwned: number;

    if (this.globalSettings.includeSparePartsInProgress) {
      // Include all parts, minifigs, and spare parts
      totalNeeded = this.totalPartsNeeded + this.totalMinifigsNeeded + this.totalSparePartsNeeded;
      totalOwned = this.totalPartsOwned + this.totalMinifigsOwned + this.totalSparePartsOwned;
    } else {
      // Only include parts and minifigs, exclude spare parts
      totalNeeded = this.totalPartsNeeded + this.totalMinifigsNeeded;
      totalOwned = this.totalPartsOwned + this.totalMinifigsOwned;
    }

    this.overallProgress = totalNeeded > 0 ? (totalOwned / totalNeeded) * 100 : 0;

    // Update cached minifig parts progress
    this.updateTotalMinifigPartsProgress();
  }

  filterParts(): void {
    if (!this.searchTerm) {
      this.filteredParts = [...this.parts];
      return;
    }

    const term = this.searchTerm.toLowerCase();
    const filtered = this.parts.filter(part =>
      part.part.name.toLowerCase().includes(term) ||
      part.part.part_num.toLowerCase().includes(term) ||
      part.color.name.toLowerCase().includes(term)
    );

    // Apply sorting to filtered results
    this.filteredParts = this.sortParts(filtered);
  }

  updatePartQuantity(part: PartDetail, quantity: number): void {
    if (!this.userInventory) return;

    // Capture previous state for undo
    const key = this.getPartStorageKey(part.inventoryPart.part_num, part.inventoryPart.color_id, part.inventoryPart.is_spare);
    const previousQuantity = part.quantityOwned;

    // Ensure quantity is not negative and not more than needed
    const clampedQuantity = Math.max(0, Math.min(quantity, part.quantityNeeded));

    // If no change, don't create undo action
    if (clampedQuantity === previousQuantity) {
      return;
    }

    part.quantityOwned = clampedQuantity;

    // Ensure all values are numbers
    const partsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.partsOwned)) {
      partsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }
    partsOwned[key] = clampedQuantity;

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      partsOwned: partsOwned,
      lastUpdated: Date.now()
    };

    this.userInventory = updatedInventory;
    this.storageService.updateUserInventory(updatedInventory);
    this.updateCounts();

    // Create undo action
    const undoAction: UndoAction = {
      type: 'part',
      key: key,
      previousQuantity: previousQuantity,
      newQuantity: clampedQuantity,
      timestamp: Date.now(),
      description: `Changed ${part.part.name} quantity from ${previousQuantity} to ${clampedQuantity}`
    };
    this.addUndoAction(undoAction);
  }

  updateMinifigQuantity(minifig: MinifigDetail, quantity: number): void {
    if (!this.userInventory) return;

    // Capture previous state for undo
    const figNum = minifig.inventoryMinifig.fig_num;
    const previousQuantity = minifig.quantityOwned;

    // Ensure quantity is not negative and not more than needed
    const clampedQuantity = Math.max(0, Math.min(quantity, minifig.quantityNeeded));

    // If no change, don't create undo action
    if (clampedQuantity === previousQuantity) {
      return;
    }

    minifig.quantityOwned = clampedQuantity;

    // Ensure all values are numbers
    const minifigsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.minifigsOwned)) {
      minifigsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }
    minifigsOwned[minifig.inventoryMinifig.fig_num] = clampedQuantity;

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      minifigsOwned,
      lastUpdated: Date.now()
    };

    this.userInventory = updatedInventory;
    this.storageService.updateUserInventory(updatedInventory);
    this.updateCounts();

    // Create undo action
    const undoAction: UndoAction = {
      type: 'minifig',
      key: figNum,
      previousQuantity: previousQuantity,
      newQuantity: clampedQuantity,
      timestamp: Date.now(),
      description: `Changed ${minifig.minifig.name} quantity from ${previousQuantity} to ${clampedQuantity}`
    };
    this.addUndoAction(undoAction);
  }

  /**
   * Update quantity for a specific minifigure part
   */
  updateMinifigPartQuantity(setNum: string, figNum: string, part: PartDetail, quantity: number): void {
    if (!this.userInventory) return;

    // Generate the storage key
    const storageKey = this.getMinifigPartStorageKey(setNum, figNum, part.inventoryPart.part_num, part.inventoryPart.color_id);
    const previousQuantity = part.quantityOwned;

    // Ensure quantity is not negative and not more than needed
    const clampedQuantity = Math.max(0, Math.min(quantity, part.quantityNeeded));

    // If no change, don't create undo action
    if (clampedQuantity === previousQuantity) {
      return;
    }

    part.quantityOwned = clampedQuantity;

    // Initialize minifigPartsOwned if it doesn't exist
    if (!this.userInventory.minifigPartsOwned) {
      this.userInventory.minifigPartsOwned = {};
    }

    // Update storage
    this.userInventory.minifigPartsOwned[storageKey] = clampedQuantity;

    // Update the cached data
    const cachedParts = this.minifigPartsCache.get(figNum);
    if (cachedParts) {
      const cachedPart = cachedParts.find(p =>
        p.inventoryPart.part_num === part.inventoryPart.part_num &&
        p.inventoryPart.color_id === part.inventoryPart.color_id
      );
      if (cachedPart) {
        cachedPart.quantityOwned = clampedQuantity;
      }
    }

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      lastUpdated: Date.now()
    };

    this.userInventory = updatedInventory;
    this.storageService.updateUserInventory(updatedInventory);
    this.updateCounts();

    // Create undo action
    const undoAction: UndoAction = {
      type: 'minifig-part',
      key: storageKey,
      previousQuantity: previousQuantity,
      newQuantity: clampedQuantity,
      timestamp: Date.now(),
      description: `Changed ${part.part.name} (${figNum}) quantity from ${previousQuantity} to ${clampedQuantity}`
    };
    this.addUndoAction(undoAction);
  }

  getPartImageUrl(partNum: string, colorId: number, elementId: string): string {
    // This would be replaced with actual image paths in a real implementation
    // return `assets/images/placeholder.svg?part=${partNum}&color=${colorId}`;
    return `https://cdn.rebrickable.com/media/thumbs/parts/elements/${elementId}.jpg/800x800p.jpg?` + (Date.now() % 1000000);
  }

  getMinifigImageUrl(figNum: string): string {
    // This would be replaced with actual image paths in a real implementation
    return `assets/images/placeholder.svg?fig=${figNum}`;
  }

  markAllPartsOwned(owned: boolean): void {
    if (!this.userInventory) return;

    const action = owned ? 'mark all parts as complete' : 'mark all parts as missing';
    const message = `Are you sure you want to ${action}? This will update the quantities for all ${this.parts.length} parts in this set.`;

    if (!confirm(message)) {
      return;
    }

    // Ensure all values are numbers
    const partsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.partsOwned)) {
      partsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }

    // Update all parts
    for (const part of this.parts) {
      const key = this.getPartStorageKey(part.inventoryPart.part_num, part.inventoryPart.color_id, part.inventoryPart.is_spare);
      partsOwned[key] = owned ? part.quantityNeeded : 0;
      part.quantityOwned = partsOwned[key];
    }

    // Ensure minifigsOwned are also numbers
    const minifigsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.minifigsOwned)) {
      minifigsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      partsOwned,
      minifigsOwned,
      lastUpdated: Date.now()
    };

    this.storageService.updateUserInventory(updatedInventory);
    this.userInventory = updatedInventory;
    this.updateCounts();
  }

  markAllMinifigsOwned(owned: boolean): void {
    if (!this.userInventory) return;

    const action = owned ? 'mark all minifigures as complete' : 'mark all minifigures as missing';
    const message = `Are you sure you want to ${action}? This will update the quantities for all ${this.minifigs.length} minifigures in this set.`;

    if (!confirm(message)) {
      return;
    }

    // Ensure all values are numbers
    const partsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.partsOwned)) {
      partsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }

    // Ensure minifigsOwned are also numbers
    const minifigsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.minifigsOwned)) {
      minifigsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }

    // Update all minifigs
    for (const minifig of this.minifigs) {
      minifigsOwned[minifig.inventoryMinifig.fig_num] = owned ? minifig.quantityNeeded : 0;
      minifig.quantityOwned = minifigsOwned[minifig.inventoryMinifig.fig_num];
    }

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      partsOwned,
      minifigsOwned,
      lastUpdated: Date.now()
    };

    this.storageService.updateUserInventory(updatedInventory);
    this.userInventory = updatedInventory;
    this.updateCounts();
  }

  markAllSparePartsOwned(owned: boolean): void {
    if (!this.userInventory) return;

    const action = owned ? 'mark all spare parts as complete' : 'mark all spare parts as missing';
    const message = `Are you sure you want to ${action}? This will update the quantities for all ${this.spareParts.length} spare parts in this set.`;

    if (!confirm(message)) {
      return;
    }

    // Ensure all values are numbers
    const partsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.partsOwned)) {
      partsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }

    // Update all spare parts
    for (const part of this.spareParts) {
      const key = this.getPartStorageKey(part.inventoryPart.part_num, part.inventoryPart.color_id, part.inventoryPart.is_spare);
      partsOwned[key] = owned ? part.quantityNeeded : 0;
      part.quantityOwned = partsOwned[key];
    }

    // Ensure minifigsOwned are also numbers
    const minifigsOwned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.userInventory.minifigsOwned)) {
      minifigsOwned[k] = typeof v === 'number' ? v : (v ? 1 : 0);
    }

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      partsOwned,
      minifigsOwned,
      lastUpdated: Date.now()
    };

    this.storageService.updateUserInventory(updatedInventory);
    this.userInventory = updatedInventory;
    this.updateCounts();
  }

  initializeDefaultSorting(): void {
    // Default sorting: 1. Completion (missing first), 2. Color, 3. Part Number
    this.partsSortOptions = [
      { field: 'completion', direction: 'asc' }, // missing first
      { field: 'color', direction: 'asc' },
      { field: 'partNumber', direction: 'asc' }
    ];

    this.minifigsSortOptions = [
      { field: 'completion', direction: 'asc' }, // missing first
      { field: 'figNumber', direction: 'asc' },
      { field: 'figName', direction: 'asc' }
    ];

    this.sparePartsSortOptions = [
      { field: 'completion', direction: 'asc' }, // missing first
      { field: 'color', direction: 'asc' },
      { field: 'partNumber', direction: 'asc' }
    ];
  }

  loadSortPreferences(): void {
    if (this.userInventory?.sortPreferences) {
      if (this.userInventory.sortPreferences.parts.length > 0) {
        this.partsSortOptions = [...this.userInventory.sortPreferences.parts];
      }
      if (this.userInventory.sortPreferences.minifigs.length > 0) {
        this.minifigsSortOptions = [...this.userInventory.sortPreferences.minifigs];
      }
      if (this.userInventory.sortPreferences.spareParts && this.userInventory.sortPreferences.spareParts.length > 0) {
        this.sparePartsSortOptions = [...this.userInventory.sortPreferences.spareParts];
      }
    }
  }

  loadViewPreferences(): void {
    if (this.userInventory?.viewPreferences) {
      this.partsViewType = this.userInventory.viewPreferences.parts || 'tiles';
      this.minifigsViewType = this.userInventory.viewPreferences.minifigs || 'tiles';
      this.sparePartsViewType = this.userInventory.viewPreferences.spareParts || 'tiles';
    }
  }

  saveSortPreferences(): void {
    if (!this.userInventory) return;

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      sortPreferences: {
        parts: [...this.partsSortOptions],
        minifigs: [...this.minifigsSortOptions],
        spareParts: [...this.sparePartsSortOptions]
      },
      lastUpdated: Date.now()
    };

    this.userInventory = updatedInventory;
    this.storageService.updateUserInventory(updatedInventory);
  }

  saveViewPreferences(): void {
    if (!this.userInventory) return;

    const updatedInventory: UserInventory = {
      ...this.userInventory,
      viewPreferences: {
        parts: this.partsViewType,
        minifigs: this.minifigsViewType,
        spareParts: this.sparePartsViewType
      },
      lastUpdated: Date.now()
    };

    this.userInventory = updatedInventory;
    this.storageService.updateUserInventory(updatedInventory);
  }

  applySorting(): void {
    this.parts = this.sortParts([...this.parts]);
    this.minifigs = this.sortMinifigs([...this.minifigs]);
    this.spareParts = this.sortSpareParts([...this.spareParts]);
    this.filterParts(); // Re-apply filtering with new sort order
  }

  sortParts(parts: PartDetail[]): PartDetail[] {
    try {
      return parts.sort((a, b) => {
        for (const sortOption of this.partsSortOptions) {
          const comparison = this.comparePartsByField(a, b, sortOption.field);
          if (comparison !== 0) {
            return sortOption.direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    } catch (error) {
      console.error('Error sorting parts:', error);
      return parts; // Return unsorted if there's an error
    }
  }

  sortMinifigs(minifigs: MinifigDetail[]): MinifigDetail[] {
    try {
      return minifigs.sort((a, b) => {
        for (const sortOption of this.minifigsSortOptions) {
          const comparison = this.compareMinifigsByField(a, b, sortOption.field);
          if (comparison !== 0) {
            return sortOption.direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    } catch (error) {
      console.error('Error sorting minifigs:', error);
      return minifigs; // Return unsorted if there's an error
    }
  }

  sortSpareParts(spareParts: PartDetail[]): PartDetail[] {
    try {
      return spareParts.sort((a, b) => {
        for (const sortOption of this.sparePartsSortOptions) {
          const comparison = this.compareSparePartsByField(a, b, sortOption.field);
          if (comparison !== 0) {
            return sortOption.direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    } catch (error) {
      console.error('Error sorting spare parts:', error);
      return spareParts; // Return unsorted if there's an error
    }
  }

  comparePartsByField(a: PartDetail, b: PartDetail, field: SortOption['field']): number {
    switch (field) {
      case 'completion':
        const aComplete = a.quantityOwned >= a.quantityNeeded;
        const bComplete = b.quantityOwned >= b.quantityNeeded;
        if (aComplete === bComplete) return 0;
        return aComplete ? 1 : -1; // incomplete (missing) first

      case 'color':
        const aColorName = String(a.color?.name || '');
        const bColorName = String(b.color?.name || '');
        return aColorName.localeCompare(bColorName);

      case 'partNumber':
        const aPartNum = String(a.part?.part_num || '');
        const bPartNum = String(b.part?.part_num || '');
        return aPartNum.localeCompare(bPartNum);

      case 'partName':
        const aPartName = String(a.part?.name || '');
        const bPartName = String(b.part?.name || '');
        return aPartName.localeCompare(bPartName);

      case 'elementId':
        const aElementId = String(a.elementId || '');
        const bElementId = String(b.elementId || '');
        return aElementId.localeCompare(bElementId);

      case 'quantityMissing':
        const aMissing = Math.max(0, a.quantityNeeded - a.quantityOwned);
        const bMissing = Math.max(0, b.quantityNeeded - b.quantityOwned);
        return aMissing - bMissing;

      case 'quantityNeeded':
        return a.quantityNeeded - b.quantityNeeded;

      case 'setNumber':
        const aSetNum = String(a.setNum || '');
        const bSetNum = String(b.setNum || '');
        return aSetNum.localeCompare(bSetNum);

      case 'setName':
        const aSetName = String(a.setName || '');
        const bSetName = String(b.setName || '');
        return aSetName.localeCompare(bSetName);

      default:
        return 0;
    }
  }

  compareMinifigsByField(a: MinifigDetail, b: MinifigDetail, field: SortOption['field']): number {
    switch (field) {
      case 'completion':
        const aComplete = a.quantityOwned >= a.quantityNeeded;
        const bComplete = b.quantityOwned >= b.quantityNeeded;
        if (aComplete === bComplete) return 0;
        return aComplete ? 1 : -1; // incomplete (missing) first

      case 'figNumber':
        const aFigNum = String(a.minifig?.fig_num || '');
        const bFigNum = String(b.minifig?.fig_num || '');
        return aFigNum.localeCompare(bFigNum);

      case 'figName':
        const aFigName = String(a.minifig?.name || '');
        const bFigName = String(b.minifig?.name || '');
        return aFigName.localeCompare(bFigName);

      case 'quantityMissing':
        const aMissing = Math.max(0, a.quantityNeeded - a.quantityOwned);
        const bMissing = Math.max(0, b.quantityNeeded - b.quantityOwned);
        return aMissing - bMissing;

      case 'quantityNeeded':
        return a.quantityNeeded - b.quantityNeeded;

      case 'setNumber':
        const aSetNum = String(a.setNum || '');
        const bSetNum = String(b.setNum || '');
        return aSetNum.localeCompare(bSetNum);

      case 'setName':
        const aSetName = String(a.setName || '');
        const bSetName = String(b.setName || '');
        return aSetName.localeCompare(bSetName);

      default:
        return 0;
    }
  }

  compareSparePartsByField(a: PartDetail, b: PartDetail, field: SortOption['field']): number {
    switch (field) {
      case 'completion':
        const aComplete = a.quantityOwned >= a.quantityNeeded;
        const bComplete = b.quantityOwned >= b.quantityNeeded;
        if (aComplete === bComplete) return 0;
        return aComplete ? 1 : -1; // incomplete (missing) first

      case 'color':
        const aColorName = String(a.color?.name || '');
        const bColorName = String(b.color?.name || '');
        return aColorName.localeCompare(bColorName);

      case 'partNumber':
        const aPartNum = String(a.part?.part_num || '');
        const bPartNum = String(b.part?.part_num || '');
        return aPartNum.localeCompare(bPartNum);

      case 'partName':
        const aPartName = String(a.part?.name || '');
        const bPartName = String(b.part?.name || '');
        return aPartName.localeCompare(bPartName);

      case 'elementId':
        const aElementId = String(a.elementId || '');
        const bElementId = String(b.elementId || '');
        return aElementId.localeCompare(bElementId);

      case 'quantityMissing':
        const aMissing = Math.max(0, a.quantityNeeded - a.quantityOwned);
        const bMissing = Math.max(0, b.quantityNeeded - b.quantityOwned);
        return aMissing - bMissing;

      case 'quantityNeeded':
        return a.quantityNeeded - b.quantityNeeded;

      case 'setNumber':
        const aSetNum = String(a.setNum || '');
        const bSetNum = String(b.setNum || '');
        return aSetNum.localeCompare(bSetNum);

      case 'setName':
        const aSetName = String(a.setName || '');
        const bSetName = String(b.setName || '');
        return aSetName.localeCompare(bSetName);

      default:
        return 0;
    }
  }

  addSortOption(type: 'parts' | 'minifigs' | 'spare-parts'): void {
    const sortOptions = type === 'parts' ? this.partsSortOptions : type === 'minifigs' ? this.minifigsSortOptions : this.sparePartsSortOptions;

    if (sortOptions.length < 3) {
      const availableFields = type === 'parts' ? this.partSortFields : type === 'minifigs' ? this.minifigSortFields : this.partSortFields; // spare parts use same fields as parts
      const usedFields = sortOptions.map(opt => opt.field);
      const firstAvailable = availableFields.find(field => !usedFields.includes((field as any).value as any));

      if (firstAvailable) {
        const newOption: SortOption = {
          field: (firstAvailable as any).value as SortOption['field'],
          direction: 'asc'
        };

        if (type === 'parts') {
          this.partsSortOptions.push(newOption);
        } else if (type === 'minifigs') {
          this.minifigsSortOptions.push(newOption);
        } else {
          this.sparePartsSortOptions.push(newOption);
        }
      }
    }
  }

  removeSortOption(type: 'parts' | 'minifigs' | 'spare-parts', index: number): void {
    if (type === 'parts') {
      this.partsSortOptions.splice(index, 1);
    } else if (type === 'minifigs') {
      this.minifigsSortOptions.splice(index, 1);
    } else {
      this.sparePartsSortOptions.splice(index, 1);
    }
  }

  updateSortOption(type: 'parts' | 'minifigs' | 'spare-parts', index: number, field: string, direction: 'asc' | 'desc'): void {
    const sortOptions = type === 'parts' ? this.partsSortOptions : type === 'minifigs' ? this.minifigsSortOptions : this.sparePartsSortOptions;

    if (sortOptions[index]) {
      sortOptions[index] = {
        field: field as SortOption['field'],
        direction: direction
      };
    }
  }

  applySortChanges(): void {
    this.applySorting();
    this.saveSortPreferences();
    this.closeSortOptions();
  }

  resetToDefaultSort(): void {
    this.initializeDefaultSorting();
    this.applySorting();
    this.saveSortPreferences();
  }

  getAvailableFields(type: 'parts' | 'minifigs' | 'spare-parts', currentIndex: number): any[] {
    let allFields = type === 'parts' ? this.partSortFields : type === 'minifigs' ? this.minifigSortFields : this.partSortFields; // spare parts use same fields as parts

    // Add set-specific fields only when in missing parts mode
    if (this.isMissingPartsMode) {
      const setFields = [
        { value: 'setNumber', label: 'Set Number' },
        { value: 'setName', label: 'Set Name' }
      ];
      allFields = [...allFields, ...setFields];
    }

    const sortOptions = type === 'parts' ? this.partsSortOptions : type === 'minifigs' ? this.minifigsSortOptions : this.sparePartsSortOptions;

    // Get the currently selected field for this dropdown
    const currentField = sortOptions[currentIndex]?.field;

    // Get all used fields except the current one
    const usedFields = sortOptions
      .map((opt, index) => index !== currentIndex ? opt.field : null)
      .filter(field => field !== null);

    // Return all fields that are either not used, or are the current field
    return allFields.filter(field => {
      const fieldValue = field.value;
      return !usedFields.includes(fieldValue as SortOption['field']) || fieldValue === currentField;
    });
  }

  getAllFieldsForDropdown(type: 'parts' | 'minifigs' | 'spare-parts'): any[] {
    let allFields = type === 'parts' ? this.partSortFields : type === 'minifigs' ? this.minifigSortFields : this.partSortFields; // spare parts use same fields as parts

    // Add set-specific fields only when in missing parts mode
    if (this.isMissingPartsMode) {
      const setFields = [
        { value: 'setNumber', label: 'Set Number' },
        { value: 'setName', label: 'Set Name' }
      ];
      allFields = [...allFields, ...setFields];
    }

    return allFields;
  }

  isFieldDisabled(type: 'parts' | 'minifigs' | 'spare-parts', fieldValue: string, currentIndex: number): boolean {
    const sortOptions = type === 'parts' ? this.partsSortOptions : type === 'minifigs' ? this.minifigsSortOptions : this.sparePartsSortOptions;
    return sortOptions.some((opt, index) => index !== currentIndex && opt.field === fieldValue);
  }

  getFieldLabel(type: 'parts' | 'minifigs' | 'spare-parts', fieldValue: string): string {
    let allFields = type === 'parts' ? this.partSortFields : type === 'minifigs' ? this.minifigSortFields : this.partSortFields; // spare parts use same fields as parts

    // Add set-specific fields only when in missing parts mode
    if (this.isMissingPartsMode) {
      const setFields = [
        { value: 'setNumber', label: 'Set Number' },
        { value: 'setName', label: 'Set Name' }
      ];
      allFields = [...allFields, ...setFields];
    }

    const field = allFields.find(f => f.value === fieldValue);
    return field ? field.label : fieldValue;
  }

  togglePartsView(): void {
    this.partsViewType = this.partsViewType === 'tiles' ? 'list' : 'tiles';
    this.saveViewPreferences();
  }

  toggleMinifigsView(): void {
    this.minifigsViewType = this.minifigsViewType === 'tiles' ? 'list' : 'tiles';
    this.saveViewPreferences();
  }

  toggleSparePartsView(): void {
    this.sparePartsViewType = this.sparePartsViewType === 'tiles' ? 'list' : 'tiles';
    this.saveViewPreferences();
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

  getImageSizeClasses(): string {
    switch (this.globalSettings.imagePreviewSize) {
      case '2x':
        return 'w-32 h-32'; // 2x size (128px)
      case '4x':
        return 'w-64 h-64'; // 4x size (256px)
      default:
        return 'w-16 h-16'; // 1x size (64px)
    }
  }

  getListImageSizeClasses(): string {
    switch (this.globalSettings.imagePreviewSize) {
      case '2x':
        return 'w-16 h-16'; // 2x size for list view
      case '4x':
        return 'w-32 h-32'; // 4x size for list view
      default:
        return 'w-8 h-8'; // 1x size for list view
    }
  }

  shouldUseVerticalLayout(): boolean {
    return this.globalSettings.imagePreviewSize === '4x';
  }

  getLargeImageUrl(imageUrl: string): string {
    // For higher resolution, try to get a larger version of the image
    // This assumes the image URL can be modified to get a larger version
    if (imageUrl.includes('https://cdn.rebrickable.com/media/') && !imageUrl.includes('https://cdn.rebrickable.com/media/thumbs/')) {
      // replace https://cdn.rebrickable.com/media/ with https://cdn.rebrickable.com/media/thumbs/ and append a timestamp
      return imageUrl.replace('https://cdn.rebrickable.com/media/', 'https://cdn.rebrickable.com/media/thumbs/')  + '/800x800p.jpg?' + Date.now();
    }
    return imageUrl;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    // Set a placeholder or hide the image on error
    img.style.display = 'none';
  }

  // TrackBy functions to prevent unnecessary re-rendering and scroll jumping
  trackByPartId(index: number, part: PartDetail): string {
    return `${part.part.part_num}_${part.color.id}_${part.inventoryId || 'default'}`;
  }

  trackByMinifigId(index: number, minifig: MinifigDetail): string {
    return `${minifig.minifig.fig_num}_${minifig.inventoryId || 'default'}`;
  }

  trackBySparePartId(index: number, part: PartDetail): string {
    return `${part.inventoryPart.part_num}_${part.inventoryPart.color_id}`;
  }

  // Scroll utility methods
  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToBottom(): void {
    window.scrollTo(0, document.body.scrollHeight);
  }

  /**
   * Switch to a specific tab and reset sort options visibility
   */
  switchToTab(tab: 'parts' | 'minifigs' | 'spare-parts'): void {
    this.activeTab = tab;
    this.showSortOptions = false;
    // Defer visibility update to next tick to prevent expression changed error
    setTimeout(() => {
      this.updateSortPanelVisibility();
    }, 0);
  }

  /**
   * Safely toggle sort options to prevent expression changed errors
   */
  toggleSortOptions(): void {
    this.showSortOptions = !this.showSortOptions;
    // Defer visibility update to next tick to prevent expression changed error
    setTimeout(() => {
      this.updateSortPanelVisibility();
    }, 0);
  }

  /**
   * Safely close sort options to prevent expression changed errors
   */
  closeSortOptions(): void {
    this.showSortOptions = false;
    // Defer visibility update to next tick to prevent expression changed error
    setTimeout(() => {
      this.updateSortPanelVisibility();
    }, 0);
  }

  /**
   * Update cached sort panel visibility
   */
  private updateSortPanelVisibility(): void {
    this.showPartsSortOptions = this.showSortOptions && this.activeTab === 'parts';
    this.showSparePartsSortOptions = this.showSortOptions && this.activeTab === 'spare-parts';
    this.showMinifigsSortOptions = this.showSortOptions && this.activeTab === 'minifigs';
  }

  /**
   * Migrate existing parts data to separate spare parts from regular parts
   * This is needed for users who have data from before the spare parts separation
   */
  private migrateSparePartsData(userInventory: UserInventory, inventoryParts: InventoryPart[]): UserInventory {
    if (!userInventory.partsOwned) return userInventory;

    let needsMigration = false;
    const newPartsOwned = { ...userInventory.partsOwned };

    // Check each inventory part to see if it's a spare part that needs migration
    inventoryParts.forEach(invPart => {
      if (invPart.is_spare) {
        const oldKey = `${invPart.part_num}_${invPart.color_id}`;
        const newKey = this.getPartStorageKey(invPart.part_num, invPart.color_id, true);

        // If we have data under the old key but not the new key, migrate it
        if (oldKey in newPartsOwned && !(newKey in newPartsOwned)) {
          newPartsOwned[newKey] = newPartsOwned[oldKey];
          needsMigration = true;
        }
      }
    });

    if (needsMigration) {
      const migratedInventory = {
        ...userInventory,
        partsOwned: newPartsOwned,
        lastUpdated: Date.now()
      };

      // Save the migrated data
      this.storageService.updateUserInventory(migratedInventory);
      return migratedInventory;
    }

    return userInventory;
  }

  /**
   * Preload all minifigure parts to ensure accurate totals
   */
  private preloadAllMinifigParts(): void {
    if (!this.minifigs || this.minifigs.length === 0) return;

    // Get all inventories to find minifigure inventories
    const allInventories = this.dataService.getCurrentInventories();

    this.minifigs.forEach(minifig => {
      const figNum = minifig.minifig.fig_num;

      // Skip if already cached
      if (this.minifigPartsCache.has(figNum)) return;

      // Find the inventory for this minifigure
      const minifigInventory = allInventories.find(inv => inv.set_num === figNum);
      if (minifigInventory) {
        this.loadMinifigPartsAsync(figNum, minifigInventory.id);
      }
    });
  }

  private loadStandardInventoryData(): void {
    this.route.paramMap.pipe(
      switchMap(params => {
        const inventoryId = params.get('id');
        if (!inventoryId) {
          return of(null);
        }

        return this.storageService.getState().pipe(
          map(state => {
            // Load global settings
            this.globalSettings = { ...state.globalSettings };

            const userInventory = state.userInventories.find(inv => inv.id === inventoryId);
            return userInventory || null;
          })
        );
      }),
      switchMap(userInventory => {
        if (!userInventory) {
          this.loading = false;
          return of(null);
        }

        this.userInventory = userInventory;
        this.updateCounts();
        this.applySorting();
        this.filterParts();
        this.updateCanUndo();

        // Initialize minifigPartsOwned if it doesn't exist (for backward compatibility)
        if (!this.userInventory.minifigPartsOwned) {
          this.userInventory.minifigPartsOwned = {};
        }

        // Load minifigure parts expanded/collapsed state
        this.loadMinifigPartsState();

        // Wait for data to be loaded before proceeding
        return this.dataService.isDataLoaded().pipe(
          filter((loaded: boolean) => loaded === true),
          switchMap(() => {
            // Load inventory data using fast cached methods
            return this.loadInventoryData(userInventory);
          })
        );
      })
    ).subscribe({
      next: (result) => {
        if (result) {
          this.parts = result.parts;
          this.spareParts = result.spareParts;
          this.minifigs = result.minifigs;
          this.filteredParts = this.parts;
          this.set = result.set;

          // Load preferences and apply sorting
          this.loadSortPreferences();
          this.loadViewPreferences();
          this.applySorting();
          this.updateCounts();

          // Preload minifigure parts for accurate totals
          this.preloadAllMinifigParts();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading inventory details:', err);
        this.loading = false;
      }
    });
  }

  private loadMissingPartsData(): void {
    this.storageService.getState().pipe(
      switchMap(state => {
        // Load global settings
        this.globalSettings = { ...state.globalSettings };
        this.userInventories = state.userInventories;

        if (this.userInventories.length === 0) {
          this.loading = false;
          return of(null);
        }

        // Wait for data to be loaded before proceeding
        return this.dataService.isDataLoaded().pipe(
          filter((loaded: boolean) => loaded === true),
          switchMap(() => {
            // Load missing items from all inventories
            return this.loadAllMissingItemsData();
          })
        );
      })
    ).subscribe({
      next: (result) => {
        if (result) {
          this.parts = result.parts;
          this.spareParts = result.spareParts;
          this.minifigs = result.minifigs;
          this.filteredParts = this.parts;

          // Load default preferences for missing parts mode
          this.loadDefaultPreferencesForMissingMode();
          this.applySorting();
          this.updateCounts();

          // Load minifigure parts expanded/collapsed state
          this.loadMinifigPartsState();

          // Preload minifigure parts for accurate totals
          this.preloadAllMinifigParts();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading missing parts data:', err);
        this.loading = false;
      }
    });
  }

  private loadInventoryData(userInventory: UserInventory) {
    // Get the inventory first
    const allInventories = this.dataService.getCurrentInventories();

    // Also try trimmed comparison
    const trimmedMatches = allInventories.filter(inv =>
      inv.set_num && inv.set_num.trim() === userInventory.set_num.trim()
    );

    const inventory = this.dataService.getCurrentInventories().find(inv =>
      inv.set_num && inv.set_num.trim() === userInventory.set_num.trim() && Number(inv.version) === Number(userInventory.version)
    );

    if (!inventory) {
      console.error('InventoryDetailComponent: No inventory found for', userInventory.set_num, 'version', userInventory.version);
      return of(null);
    }

    this.inventory = inventory;

    // Get the set info
    const set = this.dataService.getCurrentSets().find(s =>
      s.set_num && s.set_num.trim() === userInventory.set_num.trim()
    );

    // Get inventory parts and minifigs
    const allInventoryParts = this.dataService.getCurrentInventoryParts();

    // Let's also check if there are multiple inventories for this set
    const inventoriesForThisSet = allInventories.filter(inv =>
      inv.set_num && inv.set_num.trim() === userInventory.set_num.trim()
    );

    // Find the inventory with the most parts (prefer the user's version if it has parts)
    let bestInventory = inventory; // Start with the exact match
    let maxParts = allInventoryParts.filter((part: any) => part.inventory_id === inventory.id).length;

    // If the user's version has no parts, find the version with the most parts
    if (maxParts === 0) {
      inventoriesForThisSet.forEach(inv => {
        const partsCount = allInventoryParts.filter((part: any) => part.inventory_id === inv.id).length;
        if (partsCount > maxParts) {
          maxParts = partsCount;
          bestInventory = inv;
        }
      });

      if (bestInventory.id !== inventory.id) {
        console.log(`Switching from version ${inventory.version} (${inventory.id}) to version ${bestInventory.version} (${bestInventory.id}) which has ${maxParts} parts`);
        this.inventory = bestInventory;
      }
    }

    return forkJoin({
      inventoryParts: this.dataService.getInventoryPartsFromCache(bestInventory.id),
      inventoryMinifigs: this.dataService.getInventoryMinifigsFromCache(bestInventory.id)
    }).pipe(
      map((data: { inventoryParts: InventoryPart[], inventoryMinifigs: InventoryMinifig[] }) => {
        const { inventoryParts, inventoryMinifigs } = data;

        // Migrate existing spare parts data if needed
        userInventory = this.migrateSparePartsData(userInventory, inventoryParts);

        // Get cached reference data
        const allParts = this.dataService.getCurrentParts();
        const allColors = this.dataService.getCurrentColors();
        const allElements = this.dataService.getCurrentElements();
        const allMinifigs = this.dataService.getCurrentMinifigs();

        // Create quick lookup maps (these are small and fast)
        const partsMap = new Map(allParts.map(p => [p.part_num, p]));
        const colorsMap = new Map(allColors.map(c => [c.id, c]));
        const elementsMap = new Map(allElements.map(e => [`${e.part_num}_${e.color_id}`, e.element_id]));
        const minifigsMap = new Map(allMinifigs.map(m => [m.fig_num, m]));

        // Process parts (simple and fast)
        const partDetails: PartDetail[] = [];
        const sparePartDetails: PartDetail[] = [];

        for (const invPart of inventoryParts) {
          const part = partsMap.get(invPart.part_num);
          const color = colorsMap.get(invPart.color_id);

          if (part && color) {
            const key = this.getPartStorageKey(invPart.part_num, invPart.color_id, invPart.is_spare);
            const quantityOwned = userInventory.partsOwned[key] || 0;
            const elementId = elementsMap.get(`${invPart.part_num}_${invPart.color_id}`);

            const partDetail: PartDetail = {
              inventoryPart: invPart,
              part: part,
              color: color,
              imageUrl: invPart.img_url,
              quantityNeeded: invPart.quantity,
              quantityOwned: quantityOwned,
              elementId: elementId,
              // Set information for missing parts mode
              setName: set?.name,
              setNum: set?.set_num,
              inventoryId: inventory.id.toString()
            };

            if (invPart.is_spare === true) {
              sparePartDetails.push(partDetail);
            } else {
              partDetails.push(partDetail);
            }
          }
        }

        // Process minifigs (simple and fast)
        const minifigDetails: MinifigDetail[] = [];
        for (const invMinifig of inventoryMinifigs) {
          const minifig = minifigsMap.get(invMinifig.fig_num);

          if (minifig) {
            const quantityOwned = userInventory.minifigsOwned[invMinifig.fig_num] || 0;

            minifigDetails.push({
              inventoryMinifig: invMinifig,
              minifig: minifig,
              imageUrl: minifig.img_url,
              quantityNeeded: invMinifig.quantity,
              quantityOwned: quantityOwned,
              // Set information for missing parts mode
              setName: set?.name,
              setNum: set?.set_num,
              inventoryId: inventory.id.toString()
            });
          }
        }

        // Calculate unique colors count
        const uniqueColorIds = new Set();
        [...partDetails, ...sparePartDetails].forEach(part => {
          uniqueColorIds.add(part.color.id);
        });

        // Load theme information if set exists
        if (set) {
          const allThemes = this.dataService.getCurrentThemes();
          this.theme = allThemes.find((t: Theme) => t.id === set.theme_id) || null;
        }

        this.uniqueColorsCount = uniqueColorIds.size;

        return {
          parts: partDetails,
          spareParts: sparePartDetails,
          minifigs: minifigDetails,
          set: set || null
        };
      })
    );
  }

  private loadAllMissingItemsData() {
    // Get cached reference data
    const allInventories = this.dataService.getCurrentInventories();
    const allParts = this.dataService.getCurrentParts();
    const allColors = this.dataService.getCurrentColors();
    const allElements = this.dataService.getCurrentElements();
    const allMinifigs = this.dataService.getCurrentMinifigs();

    // Create quick lookup maps
    const partsMap = new Map(allParts.map(p => [p.part_num, p]));
    const colorsMap = new Map(allColors.map(c => [c.id, c]));
    const elementsMap = new Map(allElements.map(e => [`${e.part_num}_${e.color_id}`, e.element_id]));
    const minifigsMap = new Map(allMinifigs.map(m => [m.fig_num, m]));

    // Process each user inventory
    const inventoryObservables = this.userInventories.map(userInventory => {
      // Get the inventory from cached data
      const inventory = allInventories.find(inv =>
        inv.set_num === userInventory.set_num && Number(inv.version) === Number(userInventory.version)
      );

      if (!inventory) {
        return of({ parts: [], spareParts: [], minifigs: [] });
      }

      // Get inventory parts and minifigs
      return forkJoin({
        inventoryParts: this.dataService.getInventoryPartsFromCache(inventory.id),
        inventoryMinifigs: this.dataService.getInventoryMinifigsFromCache(inventory.id)
      }).pipe(
        map((data: { inventoryParts: InventoryPart[], inventoryMinifigs: InventoryMinifig[] }) => {
          const { inventoryParts, inventoryMinifigs } = data;

          const partDetails: PartDetail[] = [];
          const sparePartDetails: PartDetail[] = [];

          // Process parts - only include missing ones
          for (const invPart of inventoryParts) {
            const key = this.getPartStorageKey(invPart.part_num, invPart.color_id, invPart.is_spare);
            const quantityOwned = userInventory.partsOwned[key] || 0;

            // Only include if missing
            if (quantityOwned < invPart.quantity) {
              const part = partsMap.get(invPart.part_num);
              const color = colorsMap.get(invPart.color_id);

              if (part && color) {
                const elementId = elementsMap.get(`${invPart.part_num}_${invPart.color_id}`);

                const partDetail: PartDetail = {
                  inventoryPart: invPart,
                  part: part,
                  color: color,
                  imageUrl: invPart.img_url,
                  quantityNeeded: invPart.quantity,
                  quantityOwned: quantityOwned,
                  elementId: elementId,
                  // Set information for missing parts mode
                  setName: userInventory.name,
                  setNum: userInventory.set_num,
                  inventoryId: userInventory.id
                };

                if (invPart.is_spare === true) {
                  sparePartDetails.push(partDetail);
                } else {
                  partDetails.push(partDetail);
                }
              }
            }
          }

          // Process minifigs - only include missing ones
          const minifigDetails: MinifigDetail[] = [];
          for (const invMinifig of inventoryMinifigs) {
            const quantityOwned = userInventory.minifigsOwned[invMinifig.fig_num] || 0;

            // Only include if missing
            if (quantityOwned < invMinifig.quantity) {
              const minifig = minifigsMap.get(invMinifig.fig_num);

              if (minifig) {
                minifigDetails.push({
                  inventoryMinifig: invMinifig,
                  minifig: minifig,
                  imageUrl: minifig.img_url,
                  quantityNeeded: invMinifig.quantity,
                  quantityOwned: quantityOwned,
                  // Set information for missing parts mode
                  setName: userInventory.name,
                  setNum: userInventory.set_num,
                  inventoryId: userInventory.id
                });
              }
            }
          }

          return {
            parts: partDetails,
            spareParts: sparePartDetails,
            minifigs: minifigDetails
          };
        })
      );
    });

    return forkJoin(inventoryObservables).pipe(
      map(results => {
        // Flatten all missing parts and minifigs from all inventories
        const allParts: PartDetail[] = [];
        const allSpareParts: PartDetail[] = [];
        const allMinifigs: MinifigDetail[] = [];

        results.forEach(({ parts, spareParts, minifigs }) => {
          allParts.push(...parts);
          allSpareParts.push(...spareParts);
          allMinifigs.push(...minifigs);
        });

        return {
          parts: allParts,
          spareParts: allSpareParts,
          minifigs: allMinifigs,
          set: null // No specific set in missing parts mode
        };
      })
    );
  }

  private loadDefaultPreferencesForMissingMode(): void {
    // Use default sorting for missing parts mode
    this.initializeDefaultSorting();

    // Use default view types
    this.partsViewType = 'tiles';
    this.minifigsViewType = 'tiles';
    this.sparePartsViewType = 'tiles';
  }

  async ngOnInit(): Promise<void> {
    try {
      const route = this.route.snapshot;
      const inventoryId = route.paramMap.get('id');

      // Check if this is missing parts mode
      this.isMissingPartsMode = route.url.some(segment => segment.path === 'missing-parts');

      // Initialize sort panel visibility after component is stable
      setTimeout(() => {
        this.updateSortPanelVisibility();
      }, 0);

      if (this.isMissingPartsMode) {
        await this.loadMissingPartsData();
      } else if (inventoryId) {
        await this.loadStandardInventoryData();
      }

      // Setup keyboard event listener for undo
      this.setupKeyboardListeners();
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    } finally {
      this.loading = false;
    }
  }

  private setupKeyboardListeners(): void {
    // Listen for keyboard events on the document
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  ngOnDestroy(): void {
    // Clean up keyboard event listener
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Check for CMD+Z (Mac) or CTRL+Z (Windows/Linux)
    if (event.key === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      event.preventDefault();
      this.performUndo();
    }
  }

  private addUndoAction(action: UndoAction): void {
    if (!this.userInventory) return;

    if (!this.userInventory.undoHistory) {
      this.userInventory.undoHistory = [];
    }

    // Add the action to the beginning of the array
    this.userInventory.undoHistory.unshift(action);

    // Limit to maxUndoHistory actions
    if (this.userInventory.undoHistory.length > this.maxUndoHistory) {
      this.userInventory.undoHistory = this.userInventory.undoHistory.slice(0, this.maxUndoHistory);
    }

    this.updateCanUndo();
    this.saveUserInventory();
  }

  private updateCanUndo(): void {
    this.canUndo = this.userInventory?.undoHistory && this.userInventory.undoHistory.length > 0 || false;
  }

  performUndo(): void {
    if (!this.userInventory?.undoHistory || this.userInventory.undoHistory.length === 0) {
      return;
    }

    const lastAction = this.userInventory.undoHistory.shift();
    if (!lastAction) return;

    // Apply the undo without creating a new undo action
    if (lastAction.type === 'part') {
      this.updatePartQuantityInternal(lastAction.key, lastAction.previousQuantity);
    } else if (lastAction.type === 'minifig') {
      this.updateMinifigQuantityInternal(lastAction.key, lastAction.previousQuantity);
    } else if (lastAction.type === 'minifig-part') {
      this.updateMinifigPartQuantityInternal(lastAction.key, lastAction.previousQuantity);
    }

    this.updateCanUndo();
    this.saveUserInventory();

    // Show undo notification
    this.showUndoNotificationMessage(`Undone: ${lastAction.description}`);
  }

  private showUndoNotificationMessage(message: string): void {
    this.undoNotificationMessage = message;
    this.showUndoNotification = true;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.showUndoNotification = false;
    }, 3000);
  }

  private saveUserInventory(): void {
    if (this.userInventory) {
      this.storageService.updateUserInventory(this.userInventory);
    }
  }

  private updatePartQuantityInternal(key: string, quantity: number): void {
    if (!this.userInventory) return;

    // Update storage without creating undo action
    this.userInventory.partsOwned[key] = quantity;

    // Update the part in the current parts list
    const part = this.parts.find(p => this.getPartStorageKey(p.inventoryPart.part_num, p.inventoryPart.color_id, p.inventoryPart.is_spare) === key);
    if (part) {
      part.quantityOwned = quantity;
    }

    // Update the part in spare parts list
    const sparePart = this.spareParts.find(p => this.getPartStorageKey(p.inventoryPart.part_num, p.inventoryPart.color_id, p.inventoryPart.is_spare) === key);
    if (sparePart) {
      sparePart.quantityOwned = quantity;
    }

    // Update counts and refresh filtered results
    this.updateCounts();
    this.filterParts();
  }

  private updateMinifigQuantityInternal(figNum: string, quantity: number): void {
    if (!this.userInventory) return;

    // Update storage without creating undo action
    this.userInventory.minifigsOwned[figNum] = quantity;

    // Update the minifig in the current list
    const minifig = this.minifigs.find(m => m.inventoryMinifig.fig_num === figNum);
    if (minifig) {
      minifig.quantityOwned = quantity;
    }

    // Update counts
    this.updateCounts();
  }

  private updateMinifigPartQuantityInternal(key: string, quantity: number): void {
    if (!this.userInventory) return;

    // Update storage without creating undo action
    this.userInventory.minifigPartsOwned[key] = quantity;

    // Parse the key: setNum_figNum_partNum_colorId
    const keyParts = key.split('_');
    if (keyParts.length >= 4) {
      const figNum = keyParts[1];
      const partNum = keyParts[2];
      const colorId = Number(keyParts[3]);

      // Update the cached data and re-sort
      const cachedParts = this.minifigPartsCache.get(figNum);
      if (cachedParts) {
        const cachedPart = cachedParts.find(p =>
          p.inventoryPart.part_num === partNum &&
          p.inventoryPart.color_id === colorId
        );
        if (cachedPart) {
          cachedPart.quantityOwned = quantity;
          // Re-sort the cached parts after update
          this.minifigPartsCache.set(figNum, this.sortMinifigParts([...cachedParts]));
        }
      }
    }

    // Update counts
    this.updateCounts();
  }
}

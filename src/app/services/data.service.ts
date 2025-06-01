import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, switchMap, of, throwError } from 'rxjs';
import { map, tap, catchError, take, timeout } from 'rxjs/operators';
import {
  Inventory, InventoryPart, InventoryMinifig, InventorySet,
  Part, Color, PartCategory, PartRelationship, Element,
  Minifig, Set, Theme,
  PartialSet, AppState, CSVManifest
} from '../models/models';
import { StorageService } from './storage.service';
import { IndexedDBService } from './indexeddb.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private dataLoaded = new BehaviorSubject<boolean>(false);
  private dataLoading = false;

  // In-memory caches for improved performance
  private partsCache = new Map<string, Part>();
  private colorsCache = new Map<number, Color>();
  private elementsCache = new Map<string, Element>();
  private minifigsCache = new Map<string, Minifig>();
  private inventoryPartsCache = new Map<number, InventoryPart[]>(); // Cache by inventory_id
  private inventoryMinifigsCache = new Map<number, InventoryMinifig[]>(); // Cache by inventory_id
  private cacheInitialized = false;

  // Data stores
  private inventories: Inventory[] = [];
  private inventoryParts: InventoryPart[] = [];
  private inventoryMinifigs: InventoryMinifig[] = [];
  private inventorySets: InventorySet[] = [];
  private parts: Part[] = [];
  private colors: Color[] = [];
  private partCategories: PartCategory[] = [];
  private partRelationships: PartRelationship[] = [];
  private elements: Element[] = [];
  private minifigs: Minifig[] = [];
  private sets: PartialSet[] = [];
  private themes: Theme[] = [];

  private readonly CSV_VERSION = '1.0.3'; // Increment this to force cache refresh with improved header cleaning

  constructor(
    private http: HttpClient,
    private storageService: StorageService,
    private indexedDBService: IndexedDBService
  ) {
    this.loadData();
  }

  /**
   * Load data from IndexedDB cache or CSV files if cache is invalid
   */
  private async loadData(): Promise<void> {
    if (this.dataLoading) {
      return;
    }

    this.dataLoading = true;

    try {
      let csvData: any = null;

      // Only try to use CSV cache if IndexedDB is supported
      if (IndexedDBService.isSupported()) {
        // Check if CSV cache is valid
        const isCacheValid = await this.indexedDBService.isCSVCacheValid();

        if (isCacheValid) {
          csvData = await this.indexedDBService.loadCSVDataCache();
        }

        if (!csvData) {
          csvData = await this.loadFromCSVFiles();

          // Save to IndexedDB cache
          try {
            await this.indexedDBService.saveCSVDataCache({
              ...csvData,
              timestamp: Date.now(),
              version: this.CSV_VERSION
            });
          } catch (error) {
            console.warn('Failed to cache CSV data to IndexedDB, will continue with memory-only storage:', error);
          }
        }
      } else {
        // IndexedDB not supported - load CSV data fresh and keep in memory only
        csvData = await this.loadFromCSVFiles();
      }

      // Load data into memory
      this.loadDataIntoMemory(csvData);
      this.initializeCache();
      this.dataLoaded.next(true);
      this.dataLoading = false;

    } catch (error) {
      console.error('DataService: Error loading data:', error);
      this.dataLoaded.next(true); // Still set to true to prevent infinite loading
      this.dataLoading = false;
    }
  }

  /**
   * Load all CSV files and return the data
   */
  private async loadFromCSVFiles(): Promise<any> {
    // First, load the manifest to see which files are split
    let manifest: CSVManifest;
    try {
      const manifestText = await this.http.get('assets/data/manifest.json', { responseType: 'text' }).toPromise();
      manifest = JSON.parse(manifestText || '{}');
    } catch (error) {
      console.warn('No manifest file found, assuming single files for all CSVs');
      // Default manifest if file doesn't exist
      manifest = {
        inventories: 1,
        inventory_parts: 1,
        inventory_minifigs: 1,
        inventory_sets: 1,
        parts: 1,
        colors: 1,
        part_categories: 1,
        part_relationships: 1,
        elements: 1,
        minifigs: 1,
        sets: 1,
        themes: 1
      };
    }

    const fileConfigs = [
      { key: 'inventories', baseName: 'inventories' },
      { key: 'inventoryParts', baseName: 'inventory_parts' },
      { key: 'inventoryMinifigs', baseName: 'inventory_minifigs' },
      { key: 'inventorySets', baseName: 'inventory_sets' },
      { key: 'parts', baseName: 'parts' },
      { key: 'colors', baseName: 'colors' },
      { key: 'partCategories', baseName: 'part_categories' },
      { key: 'partRelationships', baseName: 'part_relationships' },
      { key: 'elements', baseName: 'elements' },
      { key: 'minifigs', baseName: 'minifigs' },
      { key: 'sets', baseName: 'sets' },
      { key: 'themes', baseName: 'themes' }
    ];

    // Create requests for all file parts
    const requests: Promise<any>[] = [];

    fileConfigs.forEach(({ key, baseName }) => {
      const partCount = manifest[baseName] || 1;

      if (partCount === 1) {
        // Single file
        const url = `assets/data/${baseName}.csv`;
        const request = this.http.get(url, { responseType: 'text' }).pipe(
          timeout(key === 'inventoryParts' ? 120000 : 60000), // Longer timeout for large files
          map(csv => ({ key, csv, part: 1, totalParts: 1 }))
        ).toPromise();
        requests.push(request);
      } else {
        // Multiple parts
        for (let partNum = 1; partNum <= partCount; partNum++) {
          const url = `assets/data/${baseName}_part_${partNum}.csv`;
          const request = this.http.get(url, { responseType: 'text' }).pipe(
            timeout(60000),
            map(csv => ({ key, csv, part: partNum, totalParts: partCount }))
          ).toPromise();
          requests.push(request);
        }
      }
    });

    // Load all parts in parallel
    const results = await Promise.all(requests);

    const csvData: any = {};

    // Initialize arrays for each key
    fileConfigs.forEach(({ key }) => {
      csvData[key] = [];
    });

    // Group results by key and combine multiple parts
    const groupedResults = new Map<string, any[]>();

    results.forEach(result => {
      if (result) {
        if (!groupedResults.has(result.key)) {
          groupedResults.set(result.key, []);
        }
        groupedResults.get(result.key)!.push(result);
      }
    });

    // Parse and combine CSV data
    groupedResults.forEach((parts, key) => {
      try {
        if (parts.length === 1) {
          // Single file
          csvData[key] = this.parseCSV(parts[0].csv);
        } else {
          // Multiple parts - combine them
          console.log(`Combining ${parts.length} parts for ${key}`);

          // Sort parts by part number to ensure correct order
          parts.sort((a, b) => a.part - b.part);

          let combinedData: any[] = [];
          let headerProcessed = false;

          parts.forEach(part => {
            const partData = this.parseCSV(part.csv);
            if (!headerProcessed) {
              // First part, include all data
              combinedData = partData;
              headerProcessed = true;
            } else {
              // Subsequent parts, append data (skip header)
              combinedData.push(...partData);
            }
          });

          csvData[key] = combinedData;
          console.log(`Combined ${key}: ${combinedData.length} total records`);
        }
      } catch (error) {
        console.error(`Error parsing ${key}:`, error);
        csvData[key] = [];
      }
    });

    return csvData;
  }

  /**
   * Load parsed CSV data into memory stores
   */
  private loadDataIntoMemory(csvData: any): void {
    this.inventories = csvData.inventories || [];
    this.inventoryParts = csvData.inventoryParts || [];
    this.inventoryMinifigs = csvData.inventoryMinifigs || [];
    this.inventorySets = csvData.inventorySets || [];
    this.parts = csvData.parts || [];
    this.colors = csvData.colors || [];
    this.partCategories = csvData.partCategories || [];
    this.partRelationships = csvData.partRelationships || [];
    this.elements = csvData.elements || [];
    this.minifigs = csvData.minifigs || [];
    this.sets = csvData.sets || [];
    this.themes = csvData.themes || [];
  }

  /**
   * Initialize in-memory caches for fast lookups
   */
  private initializeCache(): void {
    if (this.cacheInitialized) return;

    // Cache parts
    this.parts.forEach(part => {
      this.partsCache.set(part.part_num, part);
    });

    // Cache colors
    this.colors.forEach(color => {
      this.colorsCache.set(color.id, color);
    });

    // Cache elements
    this.elements.forEach(element => {
      this.elementsCache.set(element.element_id, element);
      // Also cache by part_num + color_id combination
      this.elementsCache.set(`${element.part_num}_${element.color_id}`, element);
    });

    // Cache minifigs
    this.minifigs.forEach(minifig => {
      this.minifigsCache.set(minifig.fig_num, minifig);
    });

    // Cache inventory parts by inventory_id for O(1) lookups
    this.inventoryParts.forEach(part => {
      if (!this.inventoryPartsCache.has(part.inventory_id)) {
        this.inventoryPartsCache.set(part.inventory_id, []);
      }
      this.inventoryPartsCache.get(part.inventory_id)!.push(part);
    });

    // Cache inventory minifigs by inventory_id for O(1) lookups
    this.inventoryMinifigs.forEach(minifig => {
      if (!this.inventoryMinifigsCache.has(minifig.inventory_id)) {
        this.inventoryMinifigsCache.set(minifig.inventory_id, []);
      }
      this.inventoryMinifigsCache.get(minifig.inventory_id)!.push(minifig);
    });

    this.cacheInitialized = true;
  }

  /**
   * Force refresh CSV data from files and update cache
   */
  async refreshCSVData(): Promise<boolean> {
    try {
      // Clear existing cache only if IndexedDB is supported
      if (IndexedDBService.isSupported()) {
        await this.indexedDBService.clearCSVCache();
      }

      // Reset data loaded state
      this.dataLoaded.next(false);
      this.cacheInitialized = false;
      this.dataLoading = false;

      // Clear in-memory caches
      this.partsCache.clear();
      this.colorsCache.clear();
      this.elementsCache.clear();
      this.minifigsCache.clear();
      this.inventoryPartsCache.clear();
      this.inventoryMinifigsCache.clear();

      // Load fresh data
      await this.loadData();

      return true;
    } catch (error) {
      console.error('Error refreshing CSV data:', error);
      return false;
    }
  }

  /**
   * Parse CSV string into typed objects
   */
  private parseCSV<T>(csv: string): T[] {
    // Normalize line endings - convert \r\n and \r to \n
    const normalizedCsv = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedCsv.split('\n');
    if (lines.length < 2) return [];

    // More aggressive header cleaning - remove all types of whitespace and control characters
    const headers = this.parseCSVLine(lines[0]).map(h =>
      h.trim()
       .replace(/\r/g, '')
       .replace(/\n/g, '')
       .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove all control characters
    );

    const result: T[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = this.parseCSVLine(line);
        const obj: any = {};

        headers.forEach((header, j) => {
          const value = values[j]?.trim().replace(/\r/g, '').replace(/\n/g, '');
          if (value === undefined || value === null || value === '') return;

          if (value === 'true' || value === 'false' || value === 'True' || value === 'False') {
            obj[header] = value.toLowerCase() === 'true';
          } else if (!isNaN(Number(value)) && value !== '') {
            obj[header] = Number(value);
          } else {
            obj[header] = value;
          }
        });

        if (Object.keys(obj).length > 0) {
          result.push(obj as T);
        }
      } catch (e) {
        console.warn('Error parsing CSV line:', line, e);
      }
    }

    return result;
  }

  /**
   * Parse a single CSV line handling quoted values and commas
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else if (char === '"') {
        // Toggle quote mode
        inQuotes = !inQuotes;
        i++;
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim().replace(/\r/g, '')); // Trim each field value and remove \r
        current = '';
        i++;
      } else {
        // Regular character
        current += char;
        i++;
      }
    }

    // Add final field (also trimmed and \r removed)
    result.push(current.trim().replace(/\r/g, ''));
    return result;
  }

  // === Public API Methods ===

  /**
   * Check if data is loaded and ready
   */
  isDataLoaded(): Observable<boolean> {
    return this.dataLoaded.asObservable();
  }

  /**
   * Get a specific set by set number and version
   */
  getSet(setNum: string, version: number = 1): Observable<Set | undefined> {
    const set = this.sets.find(s => s.set_num === setNum);
    if (set) {
      const versionsForSet = this.inventories
        .filter(inv => inv.set_num === setNum)
        .map(inv => inv.version)
        .sort((a, b) => a - b);

      return of({
        ...set,
        versions: versionsForSet.length > 0 ? versionsForSet : [1]
      });
    }
    return of(undefined);
  }

  /**
   * Get inventory metadata for a set
   */
  getSetInventory(setNum: string, version: number = 1): Observable<Inventory | undefined> {
    const inventory = this.inventories.find(inv =>
      inv.set_num === setNum && inv.version === version
    );
    return of(inventory);
  }

  /**
   * Get inventory parts by set number and version
   */
  getSetInventoryPartsBySetNum(setNum: string, version: number = 1): Observable<InventoryPart[]> {
    return this.getSetInventory(setNum, version).pipe(
      switchMap(inventory => {
        if (!inventory) {
          return of([]);
        }
        return this.getInventoryPartsFromCache(inventory.id);
      })
    );
  }

  /**
   * Get inventory minifigs by set number and version
   */
  getSetInventoryMinifigsBySetNum(setNum: string, version: number = 1): Observable<InventoryMinifig[]> {
    return this.getSetInventory(setNum, version).pipe(
      switchMap(inventory => {
        if (!inventory) {
          return of([]);
        }
        return this.getInventoryMinifigsFromCache(inventory.id);
      })
    );
  }

  /**
   * Get inventory parts from cache (O(1) lookup)
   */
  getInventoryPartsFromCache(inventoryId: number): Observable<InventoryPart[]> {
    if (!this.cacheInitialized) {
      // Wait for cache to be initialized
      return this.dataLoaded.pipe(
        take(1), // Only take the first emission
        switchMap(() => {
          // Double-check cache is initialized after data loaded
          if (!this.cacheInitialized) {
            this.initializeCache();
          }
          const parts = this.inventoryPartsCache.get(inventoryId) || [];
          return of(parts);
        })
      );
    }

    const parts = this.inventoryPartsCache.get(inventoryId) || [];
    return of(parts);
  }

  /**
   * Get inventory minifigs from cache (O(1) lookup)
   */
  getInventoryMinifigsFromCache(inventoryId: number): Observable<InventoryMinifig[]> {
    if (!this.cacheInitialized) {
      // Wait for cache to be initialized
      return this.dataLoaded.pipe(
        take(1), // Only take the first emission
        switchMap(() => {
          // Double-check cache is initialized after data loaded
          if (!this.cacheInitialized) {
            this.initializeCache();
          }
          const minifigs = this.inventoryMinifigsCache.get(inventoryId) || [];
          return of(minifigs);
        })
      );
    }

    const minifigs = this.inventoryMinifigsCache.get(inventoryId) || [];
    return of(minifigs);
  }

  /**
   * Get sets with pagination
   */
  getSetsPaginated(page: number = 1, pageSize: number = 24, searchTerm?: string, yearFilter?: number): Observable<{sets: Set[], totalCount: number, hasNext: boolean}> {
    if (!this.cacheInitialized) {
      return this.dataLoaded.pipe(
        switchMap(() => this.getSetsPaginatedInternal(page, pageSize, searchTerm, yearFilter))
      );
    }

    return this.getSetsPaginatedInternal(page, pageSize, searchTerm, yearFilter);
  }

  private getSetsPaginatedInternal(page: number, pageSize: number, searchTerm?: string, yearFilter?: number): Observable<{sets: Set[], totalCount: number, hasNext: boolean}> {
    // Create a map of set_num to versions for efficient lookup
    const setVersionsMap = new Map<string, number[]>();

    this.inventories.forEach(inv => {
      if (!setVersionsMap.has(inv.set_num)) {
        setVersionsMap.set(inv.set_num, []);
      }
      setVersionsMap.get(inv.set_num)!.push(inv.version);
    });

    // Sort versions for each set
    setVersionsMap.forEach((versions, setNum) => {
      setVersionsMap.set(setNum, versions.sort((a, b) => a - b));
    });

    // Map partial sets to full sets with versions
    let setsWithVersions = this.sets.map(partialSet => ({
      ...partialSet,
      versions: setVersionsMap.get(partialSet.set_num) || [1]
    }));

    // Apply filters
    if (searchTerm && searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      setsWithVersions = setsWithVersions.filter(set =>
        set.name.toLowerCase().includes(search) ||
        set.set_num.toLowerCase().includes(search)
      );
    }

    if (yearFilter) {
      setsWithVersions = setsWithVersions.filter(set => set.year === yearFilter);
    }

    // Apply pagination
    const totalCount = setsWithVersions.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedSets = setsWithVersions.slice(startIndex, endIndex);
    const hasNext = endIndex < totalCount;

    return of({
      sets: paginatedSets,
      totalCount,
      hasNext
    });
  }

  // === Getter methods for current data ===

  getCurrentParts(): Part[] {
    return this.parts;
  }

  getCurrentColors(): Color[] {
    return this.colors;
  }

  getCurrentMinifigs(): Minifig[] {
    return this.minifigs;
  }

  getCurrentElements(): Element[] {
    return this.elements;
  }

  getCurrentSets(): PartialSet[] {
    return this.sets;
  }

  getCurrentInventories(): Inventory[] {
    return this.inventories;
  }

  getCurrentInventoryParts(): InventoryPart[] {
    return this.inventoryParts;
  }

  getCurrentThemes(): Theme[] {
    return this.themes;
  }

  // === Legacy methods for compatibility ===

  getPartsByNumbers(partNumbers: string[]): Observable<Part[]> {
    const parts = partNumbers
      .map(partNum => this.partsCache.get(partNum))
      .filter(part => part !== undefined) as Part[];
    return of(parts);
  }

  getColorsByIds(colorIds: number[]): Observable<Color[]> {
    const colors = colorIds
      .map(colorId => this.colorsCache.get(colorId))
      .filter(color => color !== undefined) as Color[];
    return of(colors);
  }

  getElementsByIds(elementIds: string[]): Observable<Element[]> {
    const elements = elementIds
      .map(elementId => this.elementsCache.get(elementId))
      .filter(element => element !== undefined) as Element[];
    return of(elements);
  }

  getMinifigsByNumbers(figNumbers: string[]): Observable<Minifig[]> {
    const minifigs = figNumbers
      .map(figNum => this.minifigsCache.get(figNum))
      .filter(minifig => minifig !== undefined) as Minifig[];
    return of(minifigs);
  }

  getSetsFromCSV(): Observable<Set[]> {
    return this.getSetsPaginated(1, 999999).pipe(
      map(result => result.sets)
    );
  }

  getSetInventoryPartsFromCSV(inventoryId: number): Observable<InventoryPart[]> {
    return this.getInventoryPartsFromCache(inventoryId);
  }

  getSetInventoryMinifigsFromCSV(inventoryId: number): Observable<InventoryMinifig[]> {
    return this.getInventoryMinifigsFromCache(inventoryId);
  }

  getPartCategoriesByIds(categoryIds: number[]): Observable<PartCategory[]> {
    const categories = this.partCategories.filter(category => categoryIds.includes(category.id));
    return of(categories);
  }

  getThemesByIds(themeIds: number[]): Observable<Theme[]> {
    const themes = this.themes.filter(theme => themeIds.includes(theme.id));
    return of(themes);
  }

  /**
   * Get CSV cache information
   */
  async getCSVCacheInfo(): Promise<{ exists: boolean; timestamp?: number; age?: number; isValid?: boolean }> {
    if (!IndexedDBService.isSupported()) {
      return {
        exists: false,
        timestamp: undefined,
        age: undefined,
        isValid: false
      };
    }

    return await this.indexedDBService.getCSVCacheInfo();
  }
}

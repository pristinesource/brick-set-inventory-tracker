import { Injectable } from '@angular/core';
import { AppState, Inventory, InventoryPart, InventoryMinifig, InventorySet, Part, Color, PartCategory, PartRelationship, Element, Minifig, PartialSet, Theme } from '../models/models';

interface CSVDataCache {
  inventories: Inventory[];
  inventoryParts: InventoryPart[];
  inventoryMinifigs: InventoryMinifig[];
  inventorySets: InventorySet[];
  parts: Part[];
  colors: Color[];
  partCategories: PartCategory[];
  partRelationships: PartRelationship[];
  elements: Element[];
  minifigs: Minifig[];
  sets: PartialSet[];
  themes: Theme[];
  timestamp: number;
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDBService {
  private readonly DB_NAME = 'BrickInventoryDB';
  private readonly DB_VERSION = 3; // Increment version to add new CSV object stores
  private readonly USER_STORE_NAME = 'appState';
  private readonly CSV_STORE_NAME = 'csvDataCache'; // Legacy store - will be removed
  private readonly STATE_KEY = 'brickInventoryAppState';
  private readonly CSV_DATA_KEY = 'csvDataCache';
  private readonly CSV_CACHE_EXPIRY_HOURS = 12;

  // New CSV object store names
  private readonly CSV_STORES = {
    inventories: 'csv_inventories',
    inventoryParts: 'csv_inventory_parts',
    inventoryMinifigs: 'csv_inventory_minifigs',
    inventorySets: 'csv_inventory_sets',
    parts: 'csv_parts',
    colors: 'csv_colors',
    partCategories: 'csv_part_categories',
    partRelationships: 'csv_part_relationships',
    elements: 'csv_elements',
    minifigs: 'csv_minifigs',
    sets: 'csv_sets',
    themes: 'csv_themes',
    metadata: 'csv_metadata'
  };

  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  /**
   * Ensure database is ready
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initDB();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  /**
   * Initialize IndexedDB with both user data and individual CSV object stores
   */
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB initialization failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create user data store if it doesn't exist
        if (!db.objectStoreNames.contains(this.USER_STORE_NAME)) {
          const userStore = db.createObjectStore(this.USER_STORE_NAME, { keyPath: 'id' });
          userStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Remove legacy CSV cache store if it exists
        if (db.objectStoreNames.contains(this.CSV_STORE_NAME)) {
          db.deleteObjectStore(this.CSV_STORE_NAME);
        }

        // Create individual CSV object stores
        this.createCSVObjectStores(db);
      };
    });
  }

  /**
   * Create individual object stores for each CSV data type
   */
  private createCSVObjectStores(db: IDBDatabase): void {
    // Inventories store - keyed by set_num + version
    if (!db.objectStoreNames.contains(this.CSV_STORES.inventories)) {
      const inventoriesStore = db.createObjectStore(this.CSV_STORES.inventories, { keyPath: 'id' });
      inventoriesStore.createIndex('set_num', 'set_num', { unique: false });
      inventoriesStore.createIndex('version', 'version', { unique: false });
      inventoriesStore.createIndex('set_version', ['set_num', 'version'], { unique: true });
    }

    // Inventory Parts store - keyed by inventory_id + part_num + color_id + is_spare
    if (!db.objectStoreNames.contains(this.CSV_STORES.inventoryParts)) {
      const inventoryPartsStore = db.createObjectStore(this.CSV_STORES.inventoryParts);
      inventoryPartsStore.createIndex('inventory_id', 'inventory_id', { unique: false });
      inventoryPartsStore.createIndex('part_num', 'part_num', { unique: false });
      inventoryPartsStore.createIndex('color_id', 'color_id', { unique: false });
    }

    // Inventory Minifigs store - keyed by inventory_id + fig_num
    if (!db.objectStoreNames.contains(this.CSV_STORES.inventoryMinifigs)) {
      const inventoryMinifigsStore = db.createObjectStore(this.CSV_STORES.inventoryMinifigs);
      inventoryMinifigsStore.createIndex('inventory_id', 'inventory_id', { unique: false });
      inventoryMinifigsStore.createIndex('fig_num', 'fig_num', { unique: false });
    }

    // Inventory Sets store - keyed by inventory_id + set_num
    if (!db.objectStoreNames.contains(this.CSV_STORES.inventorySets)) {
      const inventorySetsStore = db.createObjectStore(this.CSV_STORES.inventorySets);
      inventorySetsStore.createIndex('inventory_id', 'inventory_id', { unique: false });
      inventorySetsStore.createIndex('set_num', 'set_num', { unique: false });
    }

    // Parts store - keyed by part_num
    if (!db.objectStoreNames.contains(this.CSV_STORES.parts)) {
      const partsStore = db.createObjectStore(this.CSV_STORES.parts, { keyPath: 'part_num' });
      partsStore.createIndex('name', 'name', { unique: false });
      partsStore.createIndex('part_cat_id', 'part_cat_id', { unique: false });
    }

    // Colors store - keyed by id
    if (!db.objectStoreNames.contains(this.CSV_STORES.colors)) {
      const colorsStore = db.createObjectStore(this.CSV_STORES.colors, { keyPath: 'id' });
      colorsStore.createIndex('name', 'name', { unique: false });
    }

    // Part Categories store - keyed by id
    if (!db.objectStoreNames.contains(this.CSV_STORES.partCategories)) {
      const partCategoriesStore = db.createObjectStore(this.CSV_STORES.partCategories, { keyPath: 'id' });
      partCategoriesStore.createIndex('name', 'name', { unique: false });
    }

    // Part Relationships store - keyed by child_part_num + parent_part_num
    if (!db.objectStoreNames.contains(this.CSV_STORES.partRelationships)) {
      const partRelationshipsStore = db.createObjectStore(this.CSV_STORES.partRelationships);
      partRelationshipsStore.createIndex('child_part_num', 'child_part_num', { unique: false });
      partRelationshipsStore.createIndex('parent_part_num', 'parent_part_num', { unique: false });
    }

    // Elements store - keyed by element_id
    if (!db.objectStoreNames.contains(this.CSV_STORES.elements)) {
      const elementsStore = db.createObjectStore(this.CSV_STORES.elements, { keyPath: 'element_id' });
      elementsStore.createIndex('part_num', 'part_num', { unique: false });
      elementsStore.createIndex('color_id', 'color_id', { unique: false });
      elementsStore.createIndex('part_color', ['part_num', 'color_id'], { unique: false });
    }

    // Minifigs store - keyed by fig_num
    if (!db.objectStoreNames.contains(this.CSV_STORES.minifigs)) {
      const minifigsStore = db.createObjectStore(this.CSV_STORES.minifigs, { keyPath: 'fig_num' });
      minifigsStore.createIndex('name', 'name', { unique: false });
    }

    // Sets store - keyed by set_num
    if (!db.objectStoreNames.contains(this.CSV_STORES.sets)) {
      const setsStore = db.createObjectStore(this.CSV_STORES.sets, { keyPath: 'set_num' });
      setsStore.createIndex('name', 'name', { unique: false });
      setsStore.createIndex('year', 'year', { unique: false });
      setsStore.createIndex('theme_id', 'theme_id', { unique: false });
    }

    // Themes store - keyed by id
    if (!db.objectStoreNames.contains(this.CSV_STORES.themes)) {
      const themesStore = db.createObjectStore(this.CSV_STORES.themes, { keyPath: 'id' });
      themesStore.createIndex('name', 'name', { unique: false });
      themesStore.createIndex('parent_id', 'parent_id', { unique: false });
    }

    // Metadata store for cache timestamps and versions
    if (!db.objectStoreNames.contains(this.CSV_STORES.metadata)) {
      db.createObjectStore(this.CSV_STORES.metadata, { keyPath: 'key' });
    }
  }

  /**
   * Save app state to IndexedDB (user data only)
   */
  async saveAppState(state: AppState): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.USER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.USER_STORE_NAME);

      const stateRecord = {
        id: this.STATE_KEY,
        data: state,
        timestamp: Date.now()
      };

      return new Promise((resolve, reject) => {
        const request = store.put(stateRecord);

        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => {
          console.error('Failed to save app state to IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error saving to IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Load app state from IndexedDB (user data only)
   */
  async loadAppState(): Promise<AppState | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.USER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.USER_STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(this.STATE_KEY);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data) {
            resolve(result.data as AppState);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('Failed to load app state from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Load app state with timestamp from IndexedDB (user data only)
   */
  async loadAppStateWithTimestamp(): Promise<{ data: AppState; timestamp: number } | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.USER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.USER_STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(this.STATE_KEY);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data) {
            resolve({
              data: result.data as AppState,
              timestamp: result.timestamp || 0
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('Failed to load app state from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Save CSV data cache to IndexedDB using individual object stores
   */
  async saveCSVDataCache(csvData: CSVDataCache, progressCallback?: (progress: { phase: string; percentage: number; current: number; total: number }) => void): Promise<void> {
    try {
      const db = await this.ensureDB();

      // Save metadata first
      progressCallback?.({ phase: 'Saving metadata', percentage: 0, current: 0, total: 12 });
      await this.saveCSVMetadata(csvData.timestamp, csvData.version);

      // Define save operations with their data
      const saveOperations = [
        { store: this.CSV_STORES.inventories, data: csvData.inventories, name: 'Inventories' },
        { store: this.CSV_STORES.inventoryParts, data: csvData.inventoryParts, name: 'Inventory Parts', keyGen: this.generateInventoryPartKey },
        { store: this.CSV_STORES.inventoryMinifigs, data: csvData.inventoryMinifigs, name: 'Inventory Minifigs', keyGen: this.generateInventoryMinifigKey },
        { store: this.CSV_STORES.inventorySets, data: csvData.inventorySets, name: 'Inventory Sets', keyGen: this.generateInventorySetKey },
        { store: this.CSV_STORES.parts, data: csvData.parts, name: 'Parts' },
        { store: this.CSV_STORES.colors, data: csvData.colors, name: 'Colors' },
        { store: this.CSV_STORES.partCategories, data: csvData.partCategories, name: 'Part Categories' },
        { store: this.CSV_STORES.partRelationships, data: csvData.partRelationships, name: 'Part Relationships', keyGen: this.generatePartRelationshipKey },
        { store: this.CSV_STORES.elements, data: csvData.elements, name: 'Elements' },
        { store: this.CSV_STORES.minifigs, data: csvData.minifigs, name: 'Minifigs' },
        { store: this.CSV_STORES.sets, data: csvData.sets, name: 'Sets' },
        { store: this.CSV_STORES.themes, data: csvData.themes, name: 'Themes' }
      ];

      // Save each data type to its own object store with progress tracking
      for (let i = 0; i < saveOperations.length; i++) {
        const operation = saveOperations[i];
        const percentage = Math.round(((i + 1) / saveOperations.length) * 100);

        progressCallback?.({
          phase: `Saving ${operation.name}`,
          percentage,
          current: i + 1,
          total: saveOperations.length
        });

        await this.saveToObjectStore(operation.store, operation.data, operation.keyGen as ((item: any) => string) | undefined, (batchProgress) => {
          // Sub-progress for large datasets
          if (operation.data.length > 10000) {
            const subPercentage = Math.round(((i + batchProgress) / saveOperations.length) * 100);
            progressCallback?.({
              phase: `Saving ${operation.name} (${Math.round(batchProgress * 100)}%)`,
              percentage: subPercentage,
              current: i + 1,
              total: saveOperations.length
            });
          }
        });
      }

      progressCallback?.({ phase: 'Completed!', percentage: 100, current: 12, total: 12 });

    } catch (error) {
      console.error('Error saving CSV data to individual object stores:', error);
      throw error;
    }
  }

  /**
   * Load CSV data cache from IndexedDB individual object stores
   */
  async loadCSVDataCache(): Promise<CSVDataCache | null> {
    try {
      const db = await this.ensureDB();

      // Check if metadata exists
      const metadata = await this.loadCSVMetadata();
      if (!metadata) {
        return null;
      }

      // Load all data types from their individual object stores
      const [
        inventories,
        inventoryParts,
        inventoryMinifigs,
        inventorySets,
        parts,
        colors,
        partCategories,
        partRelationships,
        elements,
        minifigs,
        sets,
        themes
      ] = await Promise.all([
        this.loadFromObjectStore<Inventory>(this.CSV_STORES.inventories),
        this.loadFromObjectStore<InventoryPart>(this.CSV_STORES.inventoryParts),
        this.loadFromObjectStore<InventoryMinifig>(this.CSV_STORES.inventoryMinifigs),
        this.loadFromObjectStore<InventorySet>(this.CSV_STORES.inventorySets),
        this.loadFromObjectStore<Part>(this.CSV_STORES.parts),
        this.loadFromObjectStore<Color>(this.CSV_STORES.colors),
        this.loadFromObjectStore<PartCategory>(this.CSV_STORES.partCategories),
        this.loadFromObjectStore<PartRelationship>(this.CSV_STORES.partRelationships),
        this.loadFromObjectStore<Element>(this.CSV_STORES.elements),
        this.loadFromObjectStore<Minifig>(this.CSV_STORES.minifigs),
        this.loadFromObjectStore<PartialSet>(this.CSV_STORES.sets),
        this.loadFromObjectStore<Theme>(this.CSV_STORES.themes)
      ]);

      const csvData: CSVDataCache = {
        inventories,
        inventoryParts,
        inventoryMinifigs,
        inventorySets,
        parts,
        colors,
        partCategories,
        partRelationships,
        elements,
        minifigs,
        sets,
        themes,
        timestamp: metadata.timestamp,
        version: metadata.version
      };

      return csvData;

    } catch (error) {
      console.error('Error loading CSV data from individual object stores:', error);
      return null;
    }
  }

  /**
   * Save data to a specific object store
   */
  private async saveToObjectStore<T>(storeName: string, data: T[], keyGenerator?: (item: T) => string, progressCallback?: (progress: number) => void): Promise<void> {
    const db = await this.ensureDB();

    // Clear existing data first and wait for completion
    await new Promise<void>((resolve, reject) => {
      const clearTransaction = db.transaction([storeName], 'readwrite');
      const clearStore = clearTransaction.objectStore(storeName);
      const clearRequest = clearStore.clear();

      clearTransaction.oncomplete = () => resolve();
      clearTransaction.onerror = () => reject(clearTransaction.error);
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Dynamic batch sizing for better performance
    // Larger batches for smaller datasets, smaller batches for huge datasets
    let batchSize: number;
    if (data.length < 10000) {
      batchSize = 5000; // Smaller datasets can use larger batches
    } else if (data.length < 100000) {
      batchSize = 3000; // Medium datasets
    } else {
      batchSize = 2000; // Very large datasets (like inventory_parts) use smaller batches
    }

    const totalBatches = Math.ceil(data.length / batchSize);
    let totalSaved = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, data.length);
      const batch = data.slice(start, end);

      const batchSaved = await new Promise<number>((resolve, reject) => {
        const batchTransaction = db.transaction([storeName], 'readwrite');
        const batchStore = batchTransaction.objectStore(storeName);
        let completed = 0;
        let errors = 0;

        batchTransaction.oncomplete = () => resolve(completed);
        batchTransaction.onerror = () => {
          console.error(`❌ Batch transaction error for ${storeName}:`, batchTransaction.error);
          reject(batchTransaction.error);
        };

        batch.forEach((item, index) => {
          try {
            const key = keyGenerator ? keyGenerator(item) : undefined;
            // Use put() instead of add() to allow overwriting existing keys
            const request = key ? batchStore.put(item, key) : batchStore.put(item);

            request.onsuccess = () => {
              completed++;
            };

            request.onerror = () => {
              errors++;
              console.error(`❌ Failed to save item ${start + index} in ${storeName}:`, request.error);
              // Don't reject here, let the batch continue
            };
          } catch (error) {
            errors++;
            console.error(`❌ Exception saving item ${start + index} in ${storeName}:`, error);
          }
        });

        // Set a timeout to prevent hanging
        setTimeout(() => {
          if (completed + errors >= batch.length) {
            resolve(completed);
          } else {
            console.warn(`⚠️ Batch timeout for ${storeName}: completed ${completed}, errors ${errors}, expected ${batch.length}`);
            resolve(completed);
          }
        }, 30000); // 30 second timeout
      });

      totalSaved += batchSaved;

      // Progress callback for progress tracking
      const batchProgress = (batchIndex + 1) / totalBatches;
      progressCallback?.(batchProgress);
    }

    // Verify we saved all records
    if (totalSaved !== data.length) {
      console.warn(`⚠️ Data loss in ${storeName}! Expected: ${data.length}, Saved: ${totalSaved}, Lost: ${data.length - totalSaved}`);
    }
  }

  /**
   * Load all data from a specific object store
   */
  private async loadFromObjectStore<T>(storeName: string): Promise<T[]> {
    const db = await this.ensureDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise<T[]>((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as T[]);
      };

      request.onerror = () => {
        console.error(`Failed to load data from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save CSV metadata (timestamp and version)
   */
  private async saveCSVMetadata(timestamp: number, version: string): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([this.CSV_STORES.metadata], 'readwrite');
    const store = transaction.objectStore(this.CSV_STORES.metadata);

    const metadata = {
      key: 'csv_cache_info',
      timestamp,
      version
    };

    return new Promise<void>((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load CSV metadata (timestamp and version) with timeout protection
   */
  private async loadCSVMetadata(): Promise<{ timestamp: number; version: string } | null> {
    const db = await this.ensureDB();

    return new Promise<{ timestamp: number; version: string } | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 2000); // Reduced timeout to 2 seconds

      try {
        const transaction = db.transaction([this.CSV_STORES.metadata], 'readonly');
        const store = transaction.objectStore(this.CSV_STORES.metadata);
        const request = store.get('csv_cache_info');

        request.onsuccess = () => {
          clearTimeout(timeout);
          if (request.result) {
            resolve({
              timestamp: request.result.timestamp,
              version: request.result.version
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };

        transaction.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };

        // Also handle transaction abort
        transaction.onabort = () => {
          clearTimeout(timeout);
          resolve(null);
        };
      } catch (error) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  // Key generation functions for composite keys
  private generateInventoryPartKey = (item: InventoryPart): string => {
    return `${item.inventory_id}_${item.part_num}_${item.color_id}_${item.is_spare ? 'spare' : 'normal'}`;
  };

  private generateInventoryMinifigKey = (item: InventoryMinifig): string => {
    return `${item.inventory_id}_${item.fig_num}`;
  };

  private generateInventorySetKey = (item: InventorySet): string => {
    return `${item.inventory_id}_${item.set_num}`;
  };

  private generatePartRelationshipKey = (item: PartRelationship): string => {
    return `${item.child_part_num}_${item.parent_part_num}`;
  };

  /**
   * Check if CSV cache is valid
   */
  async isCSVCacheValid(): Promise<boolean> {
    try {
      const db = await this.ensureDB();

      // Check if metadata object store exists
      if (!db.objectStoreNames.contains('csv_metadata')) {
        return false;
      }

      // Check if parts object store exists (main indicator of data)
      if (!db.objectStoreNames.contains('csv_parts')) {
        return false;
      }

      // Check metadata
      const metadata = await this.loadCSVMetadata();
      if (!metadata) {
        return false;
      }

      const cacheAge = Date.now() - metadata.timestamp;
      const maxAge = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
      const isValid = cacheAge < maxAge;

      return isValid;
    } catch (error) {
      console.error('Error checking CSV cache validity:', error);
      return false;
    }
  }

  /**
   * Clear CSV data cache only (all individual object stores)
   */
  async clearCSVCache(): Promise<void> {
    try {
      const db = await this.ensureDB();

      // Clear all CSV object stores
      const storeNames = Object.values(this.CSV_STORES);
      const clearPromises = storeNames.map(storeName => {
        return new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          const clearRequest = store.clear();

          clearRequest.onsuccess = () => resolve();
          clearRequest.onerror = () => reject(clearRequest.error);
        });
      });

      await Promise.all(clearPromises);

    } catch (error) {
      console.error('Error clearing CSV data cache from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Clear user data only (preserves CSV cache)
   */
  async clearUserData(): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.USER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.USER_STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to clear user data from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error clearing user data from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Clear all data from IndexedDB (both user data and CSV cache)
   */
  async clearAllData(): Promise<void> {
    try {
      await this.clearUserData();
      await this.clearCSVCache();
    } catch (error) {
      console.error('Error clearing all data from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Check if IndexedDB is supported
   */
  static isSupported(): boolean {
    return 'indexedDB' in window && indexedDB !== null;
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{ used: number; quota: number } | null> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0
        };
      }
    } catch (error) {
      console.error('Error getting storage info:', error);
    }
    return null;
  }

  /**
   * Get CSV cache information
   */
  async getCSVCacheInfo(): Promise<{ exists: boolean; timestamp?: number; age?: number; isValid?: boolean }> {
    try {
      const metadata = await this.loadCSVMetadata();
      if (!metadata) {
        return { exists: false };
      }

      const now = Date.now();
      const age = now - metadata.timestamp;
      const maxAge = this.CSV_CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      const isValid = age < maxAge;

      return {
        exists: true,
        timestamp: metadata.timestamp,
        age,
        isValid
      };
    } catch (error) {
      console.error('Error getting CSV cache info:', error);
      return { exists: false };
    }
  }

  /**
   * Get inventory parts by inventory ID (efficient indexed lookup)
   */
  async getInventoryPartsByInventoryId(inventoryId: number): Promise<InventoryPart[]> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.inventoryParts], 'readonly');
      const store = transaction.objectStore(this.CSV_STORES.inventoryParts);
      const index = store.index('inventory_id');

      return new Promise<InventoryPart[]>((resolve, reject) => {
        const request = index.getAll(inventoryId);

        request.onsuccess = () => {
          resolve(request.result as InventoryPart[]);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting inventory parts by inventory ID:', error);
      return [];
    }
  }

  /**
   * Get inventory minifigs by inventory ID (efficient indexed lookup)
   */
  async getInventoryMinifigsByInventoryId(inventoryId: number): Promise<InventoryMinifig[]> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.inventoryMinifigs], 'readonly');
      const store = transaction.objectStore(this.CSV_STORES.inventoryMinifigs);
      const index = store.index('inventory_id');

      return new Promise<InventoryMinifig[]>((resolve, reject) => {
        const request = index.getAll(inventoryId);

        request.onsuccess = () => {
          resolve(request.result as InventoryMinifig[]);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting inventory minifigs by inventory ID:', error);
      return [];
    }
  }

  /**
   * Get inventory by set number and version (efficient indexed lookup)
   */
  async getInventoryBySetNumAndVersion(setNum: string, version: number): Promise<Inventory | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.inventories], 'readonly');
      const store = transaction.objectStore(this.CSV_STORES.inventories);
      const index = store.index('set_version');

      return new Promise<Inventory | null>((resolve, reject) => {
        const request = index.get([setNum, version]);

        request.onsuccess = () => {
          resolve(request.result as Inventory || null);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting inventory by set number and version:', error);
      return null;
    }
  }

  /**
   * Get part by part number (efficient keyed lookup)
   */
  async getPartByPartNum(partNum: string): Promise<Part | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.parts], 'readonly');
      const store = transaction.objectStore(this.CSV_STORES.parts);

      return new Promise<Part | null>((resolve, reject) => {
        const request = store.get(partNum);

        request.onsuccess = () => {
          resolve(request.result as Part || null);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting part by part number:', error);
      return null;
    }
  }

  /**
   * Get color by ID (efficient keyed lookup)
   */
  async getColorById(colorId: number): Promise<Color | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.colors], 'readonly');
      const store = transaction.objectStore(this.CSV_STORES.colors);

      return new Promise<Color | null>((resolve, reject) => {
        const request = store.get(colorId);

        request.onsuccess = () => {
          resolve(request.result as Color || null);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting color by ID:', error);
      return null;
    }
  }

  /**
   * Check if individual object stores have data (fast check)
   */
  async hasCSVObjectStoreData(): Promise<boolean> {
    try {
      const db = await this.ensureDB();

      // Quick check: does the parts store exist and have data?
      if (!db.objectStoreNames.contains(this.CSV_STORES.parts)) {
        return false;
      }

      // Use a timeout to prevent hanging
      return new Promise<boolean>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(false);
        }, 5000);

        try {
          const transaction = db.transaction([this.CSV_STORES.parts], 'readonly');
          const store = transaction.objectStore(this.CSV_STORES.parts);
          const request = store.count();

          request.onsuccess = () => {
            clearTimeout(timeout);
            const count = request.result;
            resolve(count > 0);
          };

          request.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };

          // Also handle transaction errors
          transaction.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        } catch (error) {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    } catch (error) {
      console.error('Error checking CSV object store data:', error);
      return false;
    }
  }
}

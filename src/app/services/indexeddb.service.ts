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

  // New singleton pattern fields
  private initializationPromise: Promise<IDBDatabase> | null = null;
  private initializationFailed = false;
  private lastInitAttempt = 0;
  private readonly MIN_RETRY_INTERVAL = 30000; // 30 seconds between retry attempts

  // Persistent failure detection - more aggressive settings
  private failureCount = 0;
  private readonly MAX_FAILURES = 3; // Give IndexedDB more chances before disabling
  private indexedDBDisabled = false;
  private disabledReason = '';

  private db: IDBDatabase | null = null;

  constructor() {
    // Clear any stale session disable status from previous sessions on fresh load
    // This gives IndexedDB a fresh start each time the page is loaded
    if (!sessionStorage.getItem('indexeddb_keep_disabled')) {
      sessionStorage.removeItem('indexeddb_disabled');
      sessionStorage.removeItem('indexeddb_disabled_reason');
    }

    // Check if IndexedDB was previously disabled in this session
    this.checkSessionDisableStatus();
  }

  private checkSessionDisableStatus(): void {
    const sessionDisabled = sessionStorage.getItem('indexeddb_disabled');
    if (sessionDisabled) {
      this.indexedDBDisabled = true;
      this.disabledReason = sessionStorage.getItem('indexeddb_disabled_reason') || 'Previous session failure';
      console.warn(`IndexedDB disabled for session: ${this.disabledReason}`);
    }
  }

  private throwIfDisabled(): void {
    if (this.indexedDBDisabled) {
      throw new Error(`IndexedDB disabled: ${this.disabledReason}`);
    }
  }

  private disableIndexedDBForSession(reason: string): void {
    this.indexedDBDisabled = true;
    this.disabledReason = reason;
    this.initializationPromise = null;
    this.db = null;

    // Store in session storage to persist across page reloads within the session
    sessionStorage.setItem('indexeddb_disabled', 'true');
    sessionStorage.setItem('indexeddb_disabled_reason', reason);

    console.warn(`IndexedDB disabled for this session: ${reason}`);
  }

  private async ensureDB(): Promise<IDBDatabase> {
    // Always check session disable status first
    this.checkSessionDisableStatus();
    this.throwIfDisabled();

    // If we have a working database, return it
    if (this.db) {
      return this.db;
    }

    // If initialization failed recently, don't retry immediately
    const now = Date.now();
    if (this.initializationFailed && (now - this.lastInitAttempt) < this.MIN_RETRY_INTERVAL) {
      throw new Error('Database initialization failed recently, please wait before retrying');
    }

    // If there's already an initialization in progress, return that promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization directly - no availability test
    this.initializationPromise = this.performDBInitialization();

    try {
      const db = await this.initializationPromise;
      this.initializationFailed = false;
      this.failureCount = 0; // Reset failure count on success
      this.db = db;
      return db;
    } catch (error) {
      this.initializationFailed = true;
      this.lastInitAttempt = now;
      this.initializationPromise = null; // Reset so we can try again later
      this.failureCount++;

      // Only disable after multiple failures, not just one
      if (this.failureCount >= this.MAX_FAILURES) {
        this.disableIndexedDBForSession(`Database initialization failed ${this.failureCount} times: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      throw error;
    }
  }

  private async performDBInitialization(): Promise<IDBDatabase> {
    return new Promise(async (resolve, reject) => {
      // Use a single timeout for all database operations to avoid complexity
      // 25 seconds should be sufficient for both existing and fresh databases
      const timeoutDuration = 25000;
      console.log(`Initializing database with ${timeoutDuration / 1000}s timeout`);

      const timeoutId = setTimeout(() => {
        this.initializationFailed = true;
        this.initializationPromise = null;
        reject(new Error(`Database initialization timed out after ${timeoutDuration / 1000} seconds`));
      }, timeoutDuration);

      try {
        // Clean up any existing connections first
        if (this.db) {
          this.db.close();
          this.db = null;
        }

        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

        request.onerror = (event) => {
          clearTimeout(timeoutId);
          this.initializationFailed = true;
          this.initializationPromise = null;
          console.error('IndexedDB error:', request.error);
          reject(new Error(`IndexedDB error: ${request.error?.message || 'Unknown error'}`));
        };

        request.onsuccess = (event) => {
          clearTimeout(timeoutId);
          const db = request.result as IDBDatabase;

          // Add error handler for the database connection
          db.onerror = (event) => {
            console.error('Database error:', event);
          };

          resolve(db);
        };

        request.onupgradeneeded = (event) => {
          try {
            const db = request.result as IDBDatabase;
            this.handleDBUpgrade(db, event.oldVersion, event.newVersion || this.DB_VERSION);
          } catch (upgradeError) {
            clearTimeout(timeoutId);
            reject(new Error(`Database upgrade failed: ${upgradeError instanceof Error ? upgradeError.message : 'Unknown error'}`));
          }
        };

      } catch (error) {
        clearTimeout(timeoutId);
        this.initializationFailed = true;
        this.initializationPromise = null;
        reject(error);
      }
    });
  }

  private handleDBUpgrade(db: IDBDatabase, oldVersion: number, newVersion: number): void {
    console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`);

    try {
      // Create user data store if it doesn't exist
      if (!db.objectStoreNames.contains(this.USER_STORE_NAME)) {
        db.createObjectStore(this.USER_STORE_NAME, { keyPath: 'id' });
      }

      // For version 3+, create CSV object stores in a simpler way
      if (newVersion >= 3) {
        this.createCSVObjectStoresSimplified(db);
      }

      // Remove legacy CSV store if it exists
      if (db.objectStoreNames.contains(this.CSV_STORE_NAME)) {
        db.deleteObjectStore(this.CSV_STORE_NAME);
      }
    } catch (error) {
      console.error('Error during database upgrade:', error);
      throw error;
    }
  }

  /**
   * Create CSV object stores with simplified approach to avoid upgrade hangs
   */
  private createCSVObjectStoresSimplified(db: IDBDatabase): void {
    // Only create the essential stores without complex indexing initially
    const essentialStores = [
      { name: this.CSV_STORES.inventories, keyPath: 'id' },
      { name: this.CSV_STORES.parts, keyPath: 'part_num' },
      { name: this.CSV_STORES.colors, keyPath: 'id' },
      { name: this.CSV_STORES.elements, keyPath: 'element_id' },
      { name: this.CSV_STORES.minifigs, keyPath: 'fig_num' },
      { name: this.CSV_STORES.sets, keyPath: 'set_num' },
      { name: this.CSV_STORES.themes, keyPath: 'id' },
      { name: this.CSV_STORES.partCategories, keyPath: 'id' },
      { name: this.CSV_STORES.metadata, keyPath: 'key' }
    ];

    // Stores without natural key paths
    const keylessStores = [
      this.CSV_STORES.inventoryParts,
      this.CSV_STORES.inventoryMinifigs,
      this.CSV_STORES.inventorySets,
      this.CSV_STORES.partRelationships
    ];

    // Create stores with key paths
    essentialStores.forEach(({ name, keyPath }) => {
      if (!db.objectStoreNames.contains(name)) {
        db.createObjectStore(name, { keyPath });
      }
    });

    // Create stores without key paths
    keylessStores.forEach(name => {
      if (!db.objectStoreNames.contains(name)) {
        db.createObjectStore(name);
      }
    });
  }

  private async initDB(): Promise<void> {
    // This method is now handled by ensureDB
    await this.ensureDB();
  }

  /**
   * Save app state to IndexedDB
   */
  async saveAppState(state: AppState): Promise<void> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.USER_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.USER_STORE_NAME);

        const stateData = {
          id: this.STATE_KEY,
          data: state,
          timestamp: Date.now()
        };

        const request = store.put(stateData);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error saving to IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Load app state from IndexedDB
   */
  async loadAppState(): Promise<AppState | null> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.USER_STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.USER_STORE_NAME);
        const request = store.get(this.STATE_KEY);

        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.data : null);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Load app state with timestamp from IndexedDB
   */
  async loadAppStateWithTimestamp(): Promise<{ data: AppState; timestamp: number } | null> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.USER_STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.USER_STORE_NAME);
        const request = store.get(this.STATE_KEY);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data && result.timestamp) {
            resolve({ data: result.data, timestamp: result.timestamp });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Save CSV data cache to individual object stores
   */
  async saveCSVDataCache(csvData: CSVDataCache, progressCallback?: (progress: { phase: string; percentage: number; current: number; total: number }) => void): Promise<void> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      // Set population flag to prevent concurrent access to partially populated database
      console.log('🏗️ Setting population flag...');
      await this.setPopulationFlag();

      const storeDataSteps = [
        { name: 'inventories', data: csvData.inventories, key: null },
        { name: 'inventoryParts', data: csvData.inventoryParts, key: this.generateInventoryPartKey },
        { name: 'inventoryMinifigs', data: csvData.inventoryMinifigs, key: this.generateInventoryMinifigKey },
        { name: 'inventorySets', data: csvData.inventorySets, key: this.generateInventorySetKey },
        { name: 'parts', data: csvData.parts, key: null },
        { name: 'colors', data: csvData.colors, key: null },
        { name: 'partCategories', data: csvData.partCategories, key: null },
        { name: 'partRelationships', data: csvData.partRelationships, key: this.generatePartRelationshipKey },
        { name: 'elements', data: csvData.elements, key: null },
        { name: 'minifigs', data: csvData.minifigs, key: null },
        { name: 'sets', data: csvData.sets, key: null },
        { name: 'themes', data: csvData.themes, key: null }
      ];

      let totalRecords = 0;
      storeDataSteps.forEach(step => {
        totalRecords += Array.isArray(step.data) ? step.data.length : 0;
      });

      let processedRecords = 0;

      for (let i = 0; i < storeDataSteps.length; i++) {
        const step = storeDataSteps[i];
        const storeName = this.CSV_STORES[step.name as keyof typeof this.CSV_STORES];

        if (!Array.isArray(step.data) || step.data.length === 0) {
          console.warn(`Skipping ${step.name} - no data or not an array`);
          continue;
        }

        try {
          await this.saveToObjectStore(
            storeName,
            step.data as any[],
            step.key as ((item: any) => string) | undefined,
            (progress: number) => {
              const recordsInThisStep = step.data.length;
              const stepRecordsProcessed = Math.round(recordsInThisStep * progress);
              const totalProcessed = processedRecords + stepRecordsProcessed;
              const overallProgress = totalRecords > 0 ? (totalProcessed / totalRecords) : 0;
              const percentageText = Math.round(overallProgress * 100);

              progressCallback?.({
                phase: `Saving ${step.name}... (${percentageText}%)`,
                percentage: overallProgress,
                current: totalProcessed,
                total: totalRecords
              });
            }
          );

          processedRecords += step.data.length;
        } catch (error) {
          console.error(`Error saving ${step.name} to IndexedDB:`, error);
          // Clear population flag before throwing
          await this.clearPopulationFlag();
          throw error;
        }
      }

      // Save metadata with timestamp and version
      await this.saveCSVMetadata(csvData.timestamp, csvData.version);

      // Clear population flag to indicate successful completion
      console.log('✅ Clearing population flag - cache population complete');
      await this.clearPopulationFlag();

      console.log('✅ Successfully saved all CSV data to IndexedDB');

    } catch (error) {
      console.error('Error saving CSV data to individual object stores:', error);
      // Ensure we clear the population flag even if something fails
      try {
        await this.clearPopulationFlag();
      } catch (clearError) {
        console.error('Failed to clear population flag after error:', clearError);
      }
      throw error;
    }
  }

  /**
   * Load CSV data cache from individual object stores
   */
  async loadCSVDataCache(progressCallback?: (phase: string, percentage: number) => void): Promise<CSVDataCache | null> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      // Check if metadata exists
      const metadata = await this.loadCSVMetadata();
      if (!metadata) {
        return null;
      }

      // Load data types sequentially with progress reporting
      const storeLoadSteps = [
        { name: 'inventories', store: this.CSV_STORES.inventories },
        { name: 'parts', store: this.CSV_STORES.parts },
        { name: 'colors', store: this.CSV_STORES.colors },
        { name: 'inventoryParts', store: this.CSV_STORES.inventoryParts },
        { name: 'inventoryMinifigs', store: this.CSV_STORES.inventoryMinifigs },
        { name: 'inventorySets', store: this.CSV_STORES.inventorySets },
        { name: 'partCategories', store: this.CSV_STORES.partCategories },
        { name: 'partRelationships', store: this.CSV_STORES.partRelationships },
        { name: 'elements', store: this.CSV_STORES.elements },
        { name: 'minifigs', store: this.CSV_STORES.minifigs },
        { name: 'sets', store: this.CSV_STORES.sets },
        { name: 'themes', store: this.CSV_STORES.themes }
      ];

      const results: any = {};

      for (let i = 0; i < storeLoadSteps.length; i++) {
        const step = storeLoadSteps[i];
        const progress = Math.round(30 + (i / storeLoadSteps.length) * 50); // 30-80% range

        progressCallback?.(`Loading ${step.name} data from cache...`, progress);
        console.log(`Loading ${step.name} from cache...`);
        results[step.name] = await this.loadFromObjectStore(step.store);

        // Allow other operations to run
        if (i < storeLoadSteps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      const csvData: CSVDataCache = {
        inventories: results.inventories,
        inventoryParts: results.inventoryParts,
        inventoryMinifigs: results.inventoryMinifigs,
        inventorySets: results.inventorySets,
        parts: results.parts,
        colors: results.colors,
        partCategories: results.partCategories,
        partRelationships: results.partRelationships,
        elements: results.elements,
        minifigs: results.minifigs,
        sets: results.sets,
        themes: results.themes,
        timestamp: metadata.timestamp,
        version: metadata.version
      };

      return csvData;

    } catch (error) {
      console.error('Error loading CSV data from individual object stores:', error);
      throw error;
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
            // Validate item before processing
            if (!item || typeof item !== 'object') {
              errors++;
              if (errors <= 10) { // Limit logging to prevent console crashes
                console.error(`❌ Invalid item at ${start + index} in ${storeName}: item is not an object`);
              }
              return;
            }

            const key = keyGenerator ? keyGenerator(item) : undefined;

            // Validate generated key
            if (keyGenerator && (key === null || key === undefined || key === '')) {
              errors++;
              if (errors <= 10) { // Limit logging to prevent console crashes
                console.error(`❌ Invalid key generated for item ${start + index} in ${storeName}:`,
                  { item: JSON.stringify(item).substring(0, 200), key });
              }
              return;
            }

            // Use put() instead of add() to allow overwriting existing keys
            const request = key ? batchStore.put(item, key) : batchStore.put(item);

            request.onsuccess = () => {
              completed++;
            };

            request.onerror = () => {
              errors++;
              if (errors <= 10) { // Limit logging to prevent console crashes
                console.error(`❌ Failed to save item ${start + index} in ${storeName}:`, request.error);
              } else if (errors === 11) {
                console.warn(`⚠️ Too many errors in ${storeName}, suppressing further error logs...`);
              }
              // Don't reject here, let the batch continue
            };
          } catch (error) {
            errors++;
            if (errors <= 10) { // Limit logging to prevent console crashes
              console.error(`❌ Exception saving item ${start + index} in ${storeName}:`, error);
              console.error(`Item data:`, JSON.stringify(item).substring(0, 200));
            } else if (errors === 11) {
              console.warn(`⚠️ Too many exceptions in ${storeName}, suppressing further exception logs...`);
            }
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
      const lost = data.length - totalSaved;
      console.warn(`⚠️ Data loss in ${storeName}! Expected: ${data.length}, Saved: ${totalSaved}, Lost: ${lost}`);
      console.warn(`This usually indicates invalid data or key generation issues. Check the data quality for ${storeName}.`);
    } else {
      console.log(`✅ Successfully saved ${totalSaved} records to ${storeName}`);
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
      }, 5000); // Increased from 2 to 5 seconds

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
    const inventoryId = item?.inventory_id?.toString() || 'unknown';
    const partNum = item?.part_num || 'unknown';
    const colorId = item?.color_id?.toString() || 'unknown';
    const spareFlag = item?.is_spare ? 'spare' : 'normal';
    return `${inventoryId}_${partNum}_${colorId}_${spareFlag}`;
  };

  private generateInventoryMinifigKey = (item: InventoryMinifig): string => {
    const inventoryId = item?.inventory_id?.toString() || 'unknown';
    const figNum = item?.fig_num || 'unknown';
    return `${inventoryId}_${figNum}`;
  };

  private generateInventorySetKey = (item: InventorySet): string => {
    const inventoryId = item?.inventory_id?.toString() || 'unknown';
    const setNum = item?.set_num || 'unknown';
    return `${inventoryId}_${setNum}`;
  };

  private generatePartRelationshipKey = (item: PartRelationship): string => {
    const childPart = item?.child_part_num || 'unknown';
    const parentPart = item?.parent_part_num || 'unknown';
    return `${childPart}_${parentPart}`;
  };

  /**
   * Check if CSV cache is valid
   */
  async isCSVCacheValid(): Promise<boolean> {
    try {
      this.throwIfDisabled();

      // Wait for database to be ready before validating cache
      await this.ensureDB();

      return await this.performCacheValidation();
    } catch (error) {
      console.error('Cache validation error:', error);
      return false;
    }
  }

  private async performCacheValidation(): Promise<boolean> {
    try {
      // Remove timeout - let cache validation complete naturally
      // If database is initializing, this will wait for it to complete
      const db = await this.ensureDB();

      console.log('🔍 Starting cache validation...');

      // Check if population is currently in progress
      const populationInProgress = await this.isPopulationInProgress();
      if (populationInProgress) {
        console.log('❌ Cache population in progress - treating as invalid');
        return false;
      }

      // Check if we have the metadata store
      if (!db.objectStoreNames.contains(this.CSV_STORES.metadata)) {
        console.log(`❌ ${this.CSV_STORES.metadata} store not found`);
        return false;
      }

      // Load metadata
      const metadata = await this.loadCSVMetadata();
      if (!metadata) {
        console.log('❌ No CSV metadata found');
        return false;
      }

      // Check age
      const ageMs = Date.now() - metadata.timestamp;
      const ageHours = ageMs / (1000 * 60 * 60);

      console.log(`📅 Cache metadata: timestamp=${new Date(metadata.timestamp).toISOString()}, age=${ageHours.toFixed(2)}h, version=${metadata.version}`);

      if (ageHours > this.CSV_CACHE_EXPIRY_HOURS) {
        console.log(`❌ Cache expired: ${ageHours.toFixed(1)} hours old (max: ${this.CSV_CACHE_EXPIRY_HOURS})`);
        return false;
      }

      console.log('⏱️ Checking data completeness...');

      // Check that all expected stores exist and have reasonable amounts of data
      const validationChecks = [
        { store: this.CSV_STORES.parts, minCount: 50000 },
        { store: this.CSV_STORES.colors, minCount: 200 },
        { store: this.CSV_STORES.inventories, minCount: 30000 },
        { store: this.CSV_STORES.inventoryParts, minCount: 100000 }
      ];

      for (const check of validationChecks) {
        const hasValidData = await this.quickStoreCountCheck(check.store, check.minCount);
        if (!hasValidData) {
          console.log(`❌ ${check.store} validation failed (expected min: ${check.minCount})`);
          return false;
        }
      }

      console.log('✅ Cache validation passed');
      return true;
    } catch (error) {
      console.error('❌ Cache validation failed:', error);
      return false;
    }
  }

  /**
   * Quick check to see if a store has at least the minimum expected number of records
   */
  private async quickStoreCountCheck(storeName: string, minExpected: number): Promise<boolean> {
    try {
      const db = await this.ensureDB();

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(false); // Timeout = assume no data
        }, 2000); // Very short timeout for count operations

        try {
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const request = store.count();

          request.onsuccess = () => {
            clearTimeout(timeout);
            const count = request.result;
            const isValid = count >= minExpected;
            console.log(`📊 Store ${storeName}: count=${count}, expected>=${minExpected}, valid=${isValid}`);
            resolve(isValid);
          };

          request.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };

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
      return false;
    }
  }

  /**
   * Clear CSV data cache only (all individual object stores)
   */
  async clearCSVCache(): Promise<void> {
    this.throwIfDisabled();

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

      // Clear population flag in case it was set
      await this.clearPopulationFlag();

      // Reset session state after clearing to allow fresh caching
      this.resetSessionStateAfterClear();

    } catch (error) {
      console.error('Error clearing CSV data cache from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Clear user data only (preserves CSV cache)
   */
  async clearUserData(): Promise<void> {
    this.throwIfDisabled();

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
    console.log('Clearing all data by deleting and recreating database...');

    try {
      // First, completely close all connections and reset state
      this.forceCleanup();

      // Add a small delay to ensure connections are fully closed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Delete the entire database
      await this.deleteDatabase();

      // Reset session state after successful clearing
      this.resetSessionStateAfterClear();

      console.log('✅ All IndexedDB data cleared successfully');
    } catch (error) {
      console.error('Error clearing all data from IndexedDB:', error);

      // If deletion fails, still reset our internal state
      this.forceCleanup();
      this.resetSessionStateAfterClear();

      // Don't throw the error, as this might be due to browser limitations
      // The data should still be cleared on next initialization
      console.log('⚠️ Database deletion may have failed, but internal state reset');
    }
  }

  /**
   * Reset session state after clearing data (less aggressive than full reset)
   */
  private resetSessionStateAfterClear(): void {
    // Reset failure counts and states to allow fresh attempts
    this.failureCount = 0;
    this.initializationFailed = false;
    this.initializationPromise = null;

    // Don't clear the session storage flags yet - let the next successful operation do that
    console.log('Reset IndexedDB state after data clearing - ready for fresh initialization');
  }

  /**
   * Check if IndexedDB is supported
   */
  static isSupported(): boolean {
    // Only check browser support, not session disable status
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
    this.throwIfDisabled();

    try {
      const metadata = await this.loadCSVMetadata();
      if (!metadata) {
        return { exists: false };
      }

      const now = Date.now();
      const age = now - metadata.timestamp;
      const ageInHours = age / (1000 * 60 * 60);
      const isValid = ageInHours < this.CSV_CACHE_EXPIRY_HOURS;

      return {
        exists: true,
        timestamp: metadata.timestamp,
        age: age,
        isValid: isValid
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
    this.throwIfDisabled();

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
    this.throwIfDisabled();

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
    this.throwIfDisabled();

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
    this.throwIfDisabled();

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
    this.throwIfDisabled();

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
    this.throwIfDisabled();

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

  isDisabledForSession(): boolean {
    return this.indexedDBDisabled;
  }

  getDisabledReason(): string {
    return this.disabledReason;
  }

  /**
   * Reset IndexedDB session state (for manual reset by user)
   */
  resetSessionState(): void {
    sessionStorage.removeItem('indexeddb_disabled');
    sessionStorage.removeItem('indexeddb_disabled_reason');
    this.indexedDBDisabled = false;
    this.disabledReason = '';
    this.failureCount = 0;
    this.initializationFailed = false;
    this.initializationPromise = null;

    // Close any existing database connection
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    console.log('IndexedDB session state reset');
  }

  /**
   * Delete the entire IndexedDB database (nuclear option for corruption)
   */
  async deleteDatabase(): Promise<void> {
    try {
      // Close any existing connection first
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // Reset internal state
      this.initializationPromise = null;
      this.initializationFailed = false;

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Database deletion timed out after 10 seconds'));
        }, 10000);

        const deleteRequest = indexedDB.deleteDatabase(this.DB_NAME);

        deleteRequest.onsuccess = () => {
          clearTimeout(timeoutId);
          console.log('IndexedDB database deleted successfully');
          resolve();
        };

        deleteRequest.onerror = () => {
          clearTimeout(timeoutId);
          reject(new Error(`Failed to delete database: ${deleteRequest.error?.message || 'Unknown error'}`));
        };

        deleteRequest.onblocked = () => {
          console.warn('Database deletion blocked - other connections may be open');
          // Don't reject here, wait for success or error
        };
      });
    } catch (error) {
      console.error('Error deleting IndexedDB database:', error);
      throw error;
    }
  }

  /**
   * Force cleanup of all database connections and reset state
   */
  forceCleanup(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.warn('Error closing database connection:', error);
      }
      this.db = null;
    }

    this.initializationPromise = null;
    this.initializationFailed = false;
    this.lastInitAttempt = 0;
  }

  /**
   * Set population flag to indicate IndexedDB is being populated
   */
  private async setPopulationFlag(): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.metadata], 'readwrite');
      const store = transaction.objectStore(this.CSV_STORES.metadata);

      const flagData = {
        key: 'population_in_progress',
        timestamp: Date.now(),
        inProgress: true
      };

      return new Promise<void>((resolve, reject) => {
        const request = store.put(flagData);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error setting population flag:', error);
      throw error;
    }
  }

  /**
   * Clear population flag when caching completes
   */
  private async clearPopulationFlag(): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORES.metadata], 'readwrite');
      const store = transaction.objectStore(this.CSV_STORES.metadata);

      return new Promise<void>((resolve, reject) => {
        const request = store.delete('population_in_progress');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error clearing population flag:', error);
      // Don't throw - clearing flag failure shouldn't break the app
    }
  }

  /**
   * Check if population is currently in progress
   */
  private async isPopulationInProgress(): Promise<boolean> {
    try {
      const db = await this.ensureDB();

      // Check if metadata store exists
      if (!db.objectStoreNames.contains(this.CSV_STORES.metadata)) {
        return false;
      }

      const transaction = db.transaction([this.CSV_STORES.metadata], 'readonly');
      const store = transaction.objectStore(this.CSV_STORES.metadata);

      return new Promise<boolean>((resolve) => {
        const request = store.get('population_in_progress');

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.inProgress) {
            // Check if the flag is stale (older than 30 minutes)
            const flagAge = Date.now() - result.timestamp;
            const thirtyMinutes = 30 * 60 * 1000;

            if (flagAge > thirtyMinutes) {
              console.warn('🧹 Found stale population flag (older than 30 minutes), clearing it...');
              console.warn(`Flag was set ${Math.round(flagAge / (60 * 1000))} minutes ago`);
              // Don't wait for the cleanup, just return false
              this.clearPopulationFlag();
              resolve(false);
            } else {
              const minutesAgo = Math.round(flagAge / (60 * 1000));
              console.log(`⚠️ Population in progress detected (started ${minutesAgo} minute(s) ago)`);
              resolve(true);
            }
          } else {
            console.log(`✅ No population flag found or flag is cleared`);
            resolve(false);
          }
        };

        request.onerror = () => {
          // If we can't read the flag, assume not in progress
          resolve(false);
        };
      });
    } catch (error) {
      console.error('Error checking population flag:', error);
      return false;
    }
  }
}

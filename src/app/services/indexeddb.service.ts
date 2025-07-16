import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import { AppState, Color, Element, Inventory, InventoryMinifig, InventoryPart, InventorySet, Minifig, Part, PartCategory, PartCategoryToSection, PartialSet, PartPopularityScore, PartRelationship, PartSection, Theme } from '../models/models';

type StoreOperationsType<T, K> = {
  name: string;
  table: Dexie.Table<T, K>;
  data: T[];
}

interface CSVDataCache {
  inventories: Inventory[];
  inventoryParts: InventoryPart[];
  inventoryMinifigs: InventoryMinifig[];
  inventorySets: InventorySet[];
  parts: Part[];
  colors: Color[];
  partCategories: PartCategory[];
  partSections: PartSection[];
  partCategoryToSection: PartCategoryToSection[];
  partRelationships: PartRelationship[];
  elements: Element[];
  minifigs: Minifig[];
  sets: PartialSet[];
  themes: Theme[];
  partPopularityScores: PartPopularityScore[];
  timestamp: number;
  version: string;
}

// Define the database schema interface
interface BrickInventoryDB extends Dexie {
  // User data
  appState: Dexie.Table<{ id: string; data: AppState; timestamp: number }, string>;

  // CSV data stores
  csv_inventories: Dexie.Table<Inventory, number>;
  csv_inventory_parts: Dexie.Table<InventoryPart, string>;
  csv_inventory_minifigs: Dexie.Table<InventoryMinifig, string>;
  csv_inventory_sets: Dexie.Table<InventorySet, string>;
  csv_parts: Dexie.Table<Part, string>;
  csv_colors: Dexie.Table<Color, number>;
  csv_part_categories: Dexie.Table<PartCategory, number>;
  csv_part_sections: Dexie.Table<PartSection, number>;
  csv_part_category_to_section: Dexie.Table<PartCategoryToSection, number>;
  csv_part_relationships: Dexie.Table<PartRelationship, string>;
  csv_elements: Dexie.Table<Element, string>;
  csv_minifigs: Dexie.Table<Minifig, string>;
  csv_sets: Dexie.Table<PartialSet, string>;
  csv_themes: Dexie.Table<Theme, number>;
  csv_part_popularity_scores: Dexie.Table<PartPopularityScore, string>;
  csv_metadata: Dexie.Table<{ key: string; timestamp?: number; version?: string; inProgress?: boolean }, string>;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDBService {
  private readonly DB_NAME = 'BrickInventoryDB';
  private readonly DB_VERSION = 5;
  private readonly STATE_KEY = 'brickInventoryAppState';
  private readonly CSV_CACHE_EXPIRY_HOURS = 720;

  // New singleton pattern fields
  private initializationPromise: Promise<BrickInventoryDB> | null = null;
  private initializationFailed = false;
  private lastInitAttempt = 0;
  private readonly MIN_RETRY_INTERVAL = 30000; // 30 seconds between retry attempts

  // Persistent failure detection - more aggressive settings
  private failureCount = 0;
  private readonly MAX_FAILURES = 3; // Give IndexedDB more chances before disabling
  private indexedDBDisabled = false;
  private disabledReason = '';

  private db: BrickInventoryDB | null = null;

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

  /**
   * Get the cache expiry time in hours for UI display
   */
  getCacheExpiryHours(): number {
    return this.CSV_CACHE_EXPIRY_HOURS;
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

  private async ensureDB(): Promise<BrickInventoryDB> {
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

  private async performDBInitialization(): Promise<BrickInventoryDB> {
    // Use a single timeout for all database operations to avoid complexity
    // 25 seconds should be sufficient for both existing and fresh databases
    const timeoutDuration = 25000;
    console.log(`Initializing database with ${timeoutDuration / 1000}s timeout`);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.initializationFailed = true;
        this.initializationPromise = null;
        reject(new Error(`Database initialization timed out after ${timeoutDuration / 1000} seconds`));
      }, timeoutDuration);

      const initializeDB = async () => {
        try {
          // Clean up any existing connections first
          if (this.db) {
            this.db.close();
            this.db = null;
          }

          const db = new Dexie(this.DB_NAME) as BrickInventoryDB;

          // Define schemas for version management and upgrades

          // Version 4 schema (previous version)
          db.version(4).stores({
            // User data store
            appState: 'id',

            // CSV data stores with primary keys
            csv_inventories: 'id, set_num, version, [set_num+version]',
            csv_inventory_parts: '++, inventory_id, part_num, color_id, [inventory_id+part_num+color_id]',
            csv_inventory_minifigs: '++, inventory_id, fig_num, [inventory_id+fig_num]',
            csv_inventory_sets: '++, inventory_id, set_num, [inventory_id+set_num]',
            csv_parts: 'part_num, part_cat_id, name',
            csv_colors: 'id, name, rgb',
            csv_part_categories: 'id, name',
            csv_part_sections: 'id, name',
            csv_part_category_to_section: 'id, section_id',
            csv_part_relationships: '++, child_part_num, parent_part_num, [child_part_num+parent_part_num]',
            csv_elements: 'element_id, part_num, color_id, [part_num+color_id]',
            csv_minifigs: 'fig_num, name, num_parts',
            csv_sets: 'set_num, name, year, theme_id, num_parts',
            csv_themes: 'id, name, parent_id',
            csv_metadata: 'key'
          });

          // Version 5 schema (current version with popularity scores)
          db.version(this.DB_VERSION).stores({
            // User data store (unchanged)
            appState: 'id',

            // CSV data stores with primary keys
            csv_inventories: 'id, set_num, version, [set_num+version]',
            csv_inventory_parts: '++, inventory_id, part_num, color_id, [inventory_id+part_num+color_id]',
            csv_inventory_minifigs: '++, inventory_id, fig_num, [inventory_id+fig_num]',
            csv_inventory_sets: '++, inventory_id, set_num, [inventory_id+set_num]',
            csv_parts: 'part_num, part_cat_id, name',
            csv_colors: 'id, name, rgb',
            csv_part_categories: 'id, name',
            csv_part_sections: 'id, name',
            csv_part_category_to_section: 'id, section_id',
            csv_part_relationships: '++, child_part_num, parent_part_num, [child_part_num+parent_part_num]',
            csv_elements: 'element_id, part_num, color_id, [part_num+color_id]',
            csv_minifigs: 'fig_num, name, num_parts',
            csv_sets: 'set_num, name, year, theme_id, num_parts',
            csv_themes: 'id, name, parent_id',
            csv_part_popularity_scores: 'part_num, score',
            csv_metadata: 'key'
          }).upgrade(async (trans) => {
            // Clear all CSV cache data but preserve user data (appState)
            console.log('Upgrading database to version 5: clearing CSV cache data...');

            await Promise.all([
              trans.table('csv_inventories').clear(),
              trans.table('csv_inventory_parts').clear(),
              trans.table('csv_inventory_minifigs').clear(),
              trans.table('csv_inventory_sets').clear(),
              trans.table('csv_parts').clear(),
              trans.table('csv_colors').clear(),
              trans.table('csv_part_categories').clear(),
              trans.table('csv_part_sections').clear(),
              trans.table('csv_part_category_to_section').clear(),
              trans.table('csv_part_relationships').clear(),
              trans.table('csv_elements').clear(),
              trans.table('csv_minifigs').clear(),
              trans.table('csv_sets').clear(),
              trans.table('csv_themes').clear(),
              trans.table('csv_metadata').clear()
            ]);

            console.log('Database upgrade completed - CSV cache cleared, user data preserved');
          });

          await db.open();

          clearTimeout(timeoutId);
          resolve(db);

        } catch (error) {
          clearTimeout(timeoutId);
          this.initializationFailed = true;
          this.initializationPromise = null;
          reject(error);
        }
      };

      initializeDB();
    });
  }

  /**
   * Save app state to IndexedDB
   */
  async saveAppState(state: AppState): Promise<void> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      const stateData = {
        id: this.STATE_KEY,
        data: state,
        timestamp: Date.now()
      };

      await db.appState.put(stateData);
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
      const result = await db.appState.get(this.STATE_KEY);
      return result ? result.data : null;
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
      const result = await db.appState.get(this.STATE_KEY);

      if (result && result.data && result.timestamp) {
        return { data: result.data, timestamp: result.timestamp };
      }

      return null;
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Save CSV data cache to individual object stores using bulkPut for performance
   */
  async saveCSVDataCache(csvData: CSVDataCache, progressCallback?: (progress: { phase: string; percentage: number; current: number; total: number }) => void): Promise<void> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      // Set population flag to prevent concurrent access to partially populated database
      console.log('🏗️ Setting population flag...');
      await this.setPopulationFlag();

      const storeOperations: StoreOperationsType<any, any>[] = [
        { name: 'inventories', table: db.csv_inventories, data: csvData.inventories },
        { name: 'parts', table: db.csv_parts, data: csvData.parts },
        { name: 'colors', table: db.csv_colors, data: csvData.colors },
        { name: 'partCategories', table: db.csv_part_categories, data: csvData.partCategories },
        { name: 'partSections', table: db.csv_part_sections, data: csvData.partSections },
        { name: 'partCategoryToSection', table: db.csv_part_category_to_section, data: csvData.partCategoryToSection },
        { name: 'elements', table: db.csv_elements, data: csvData.elements },
        { name: 'minifigs', table: db.csv_minifigs, data: csvData.minifigs },
        { name: 'sets', table: db.csv_sets, data: csvData.sets },
        { name: 'themes', table: db.csv_themes, data: csvData.themes },
        { name: 'inventoryParts', table: db.csv_inventory_parts, data: csvData.inventoryParts },
        { name: 'inventoryMinifigs', table: db.csv_inventory_minifigs, data: csvData.inventoryMinifigs },
        { name: 'inventorySets', table: db.csv_inventory_sets, data: csvData.inventorySets },
        { name: 'partRelationships', table: db.csv_part_relationships, data: csvData.partRelationships },
        { name: 'partPopularityScores', table: db.csv_part_popularity_scores, data: csvData.partPopularityScores }
      ];

      let totalRecords = 0;
      storeOperations.forEach(op => {
        totalRecords += Array.isArray(op.data) ? op.data.length : 0;
      });

      let processedRecords = 0;

      for (const operation of storeOperations) {

        if (!Array.isArray(operation.data) || operation.data.length === 0) {
          console.warn(`Skipping ${operation.name} - no data or not an array`);
          continue;
        }

        try {
          // Clear existing data first
          await operation.table.clear();

          // Process data in chunks of 10,000 records for better memory management
          const batchSize = 10000;
          const totalBatches = Math.ceil(operation.data.length / batchSize);

          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * batchSize;
            const end = Math.min(start + batchSize, operation.data.length);
            const batch = operation.data.slice(start, end);

            // Use bulkPut for efficient bulk insertion
            await operation.table.bulkPut(batch);

            const batchProcessedRecords = processedRecords + end;

            // Update progress for each batch
            const overallProgress = totalRecords > 0 ? (batchProcessedRecords / totalRecords) : 0;
            const percentageText = Math.round(overallProgress * 100);

            progressCallback?.({
              phase: `Saving ${operation.name}... batch ${batchIndex + 1}/${totalBatches} (${percentageText}%)`,
              percentage: overallProgress,
              current: batchProcessedRecords,
              total: totalRecords
            });

            // Allow other operations to run between batches
            if (batchIndex < totalBatches - 1) {
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          }

          processedRecords += operation.data.length;

          console.log(`✅ Successfully saved ${operation.data.length} records to ${operation.name} in ${totalBatches} batch(es)`);

        } catch (error) {
          console.error(`Error saving ${operation.name} to IndexedDB:`, error);
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

      // Load data types with progress reporting
      const loadOperations = [
        { name: 'inventories', table: db.csv_inventories },
        { name: 'parts', table: db.csv_parts },
        { name: 'colors', table: db.csv_colors },
        { name: 'inventoryParts', table: db.csv_inventory_parts },
        { name: 'inventoryMinifigs', table: db.csv_inventory_minifigs },
        { name: 'inventorySets', table: db.csv_inventory_sets },
        { name: 'partCategories', table: db.csv_part_categories },
        { name: 'partSections', table: db.csv_part_sections },
        { name: 'partCategoryToSection', table: db.csv_part_category_to_section },
        { name: 'partRelationships', table: db.csv_part_relationships },
        { name: 'elements', table: db.csv_elements },
        { name: 'minifigs', table: db.csv_minifigs },
        { name: 'sets', table: db.csv_sets },
        { name: 'themes', table: db.csv_themes },
        { name: 'partPopularityScores', table: db.csv_part_popularity_scores }
      ];

      const results: any = {};

      for (let i = 0; i < loadOperations.length; i++) {
        const operation = loadOperations[i];
        const progress = Math.round(30 + (i / loadOperations.length) * 50); // 30-80% range

        progressCallback?.(`Loading ${operation.name} data from cache...`, progress);
        console.log(`Loading ${operation.name} from cache...`);

        results[operation.name] = await operation.table.toArray();

        // Allow other operations to run
        if (i < loadOperations.length - 1) {
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
        partSections: results.partSections,
        partCategoryToSection: results.partCategoryToSection,
        partRelationships: results.partRelationships,
        elements: results.elements,
        minifigs: results.minifigs,
        sets: results.sets,
        themes: results.themes,
        partPopularityScores: results.partPopularityScores,
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
   * Save CSV metadata (timestamp and version)
   */
  private async saveCSVMetadata(timestamp: number, version: string): Promise<void> {
    const db = await this.ensureDB();

    const metadata = {
      key: 'csv_cache_info',
      timestamp,
      version
    };

    await db.csv_metadata.put(metadata);
  }

  /**
   * Load CSV metadata (timestamp and version) with timeout protection
   */
  private async loadCSVMetadata(): Promise<{ timestamp: number; version: string } | null> {
    try {
      const db = await this.ensureDB();
      const result = await db.csv_metadata.get('csv_cache_info');

      if (result && result.timestamp && result.version) {
        return {
          timestamp: result.timestamp,
          version: result.version
        };
      }

      return null;
    } catch (error) {
      console.error('Error loading CSV metadata:', error);
      return null;
    }
  }



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
      const db = await this.ensureDB();

      console.log('🔍 Starting cache validation...');

      // Check if population is currently in progress
      const populationInProgress = await this.isPopulationInProgress();
      if (populationInProgress) {
        console.log('❌ Cache population in progress - treating as invalid');
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
        { table: db.csv_parts, name: 'parts', minCount: 50000 },
        { table: db.csv_colors, name: 'colors', minCount: 200 },
        { table: db.csv_inventories, name: 'inventories', minCount: 30000 },
        { table: db.csv_inventory_parts, name: 'inventoryParts', minCount: 100000 }
      ];

      for (const check of validationChecks) {
        const count = await check.table.count();
        const isValid = count >= check.minCount;
        console.log(`📊 Table ${check.name}: count=${count}, expected>=${check.minCount}, valid=${isValid}`);

        if (!isValid) {
          console.log(`❌ ${check.name} validation failed`);
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
   * Clear CSV data cache only (all individual object stores)
   */
  async clearCSVCache(): Promise<void> {
    this.throwIfDisabled();

    try {
      const db = await this.ensureDB();

      // Clear all CSV tables
      await Promise.all([
        db.csv_inventories.clear(),
        db.csv_inventory_parts.clear(),
        db.csv_inventory_minifigs.clear(),
        db.csv_inventory_sets.clear(),
        db.csv_parts.clear(),
        db.csv_colors.clear(),
        db.csv_part_categories.clear(),
        db.csv_part_relationships.clear(),
        db.csv_elements.clear(),
        db.csv_minifigs.clear(),
        db.csv_sets.clear(),
        db.csv_themes.clear(),
        db.csv_part_popularity_scores.clear(),
        db.csv_metadata.clear()
      ]);

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
      await db.appState.clear();
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
      return await db.csv_inventory_parts.where('inventory_id').equals(inventoryId).toArray();
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
      return await db.csv_inventory_minifigs.where('inventory_id').equals(inventoryId).toArray();
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
      return await db.csv_inventories.where('[set_num+version]').equals([setNum, version]).first() || null;
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
      return await db.csv_parts.get(partNum) || null;
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
      return await db.csv_colors.get(colorId) || null;
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
      const count = await db.csv_parts.count();
      return count > 0;
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

      const flagData = {
        key: 'population_in_progress',
        timestamp: Date.now(),
        inProgress: true
      };

      await db.csv_metadata.put(flagData);
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
      await db.csv_metadata.delete('population_in_progress');
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
      const result = await db.csv_metadata.get('population_in_progress');

      if (result && result.inProgress) {
        // Check if the flag is stale (older than 30 minutes)
        const flagAge = Date.now() - (result.timestamp || 0);
        const thirtyMinutes = 30 * 60 * 1000;

        if (flagAge > thirtyMinutes) {
          console.warn('🧹 Found stale population flag (older than 30 minutes), clearing it...');
          console.warn(`Flag was set ${Math.round(flagAge / (60 * 1000))} minutes ago`);
          // Don't wait for the cleanup, just return false
          this.clearPopulationFlag();
          return false;
        } else {
          const minutesAgo = Math.round(flagAge / (60 * 1000));
          console.log(`⚠️ Population in progress detected (started ${minutesAgo} minute(s) ago)`);
          return true;
        }
      } else {
        console.log(`✅ No population flag found or flag is cleared`);
        return false;
      }
    } catch (error) {
      console.error('Error checking population flag:', error);
      return false;
    }
  }
}

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
  private readonly DB_VERSION = 2; // Increment version to add CSV cache store
  private readonly USER_STORE_NAME = 'appState';
  private readonly CSV_STORE_NAME = 'csvDataCache';
  private readonly STATE_KEY = 'brickInventoryAppState';
  private readonly CSV_DATA_KEY = 'csvDataCache';
  private readonly CSV_CACHE_EXPIRY_HOURS = 12;

  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  /**
   * Initialize IndexedDB with both user data and CSV cache stores
   */
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
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

        // Create CSV cache store if it doesn't exist
        if (!db.objectStoreNames.contains(this.CSV_STORE_NAME)) {
          const csvStore = db.createObjectStore(this.CSV_STORE_NAME, { keyPath: 'id' });
          csvStore.createIndex('timestamp', 'timestamp', { unique: false });
          csvStore.createIndex('version', 'version', { unique: false });
        }
      };
    });
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
   * Save CSV data cache to IndexedDB
   */
  async saveCSVDataCache(csvData: CSVDataCache): Promise<void> {
    try {
      // Calculate approximate size of data
      const dataSize = JSON.stringify(csvData).length;
      console.log(`Attempting to save CSV data cache: ~${Math.round(dataSize / 1024 / 1024)} MB`);

      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.CSV_STORE_NAME);

      const csvRecord = {
        id: this.CSV_DATA_KEY,
        data: csvData,
        timestamp: Date.now(),
        version: csvData.version
      };

      return new Promise((resolve, reject) => {
        const request = store.put(csvRecord);

        request.onsuccess = () => {
          console.log('CSV data cache saved successfully to IndexedDB');
          resolve();
        };
        request.onerror = () => {
          console.error('Failed to save CSV data cache to IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error saving CSV data cache to IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Load CSV data cache from IndexedDB
   */
  async loadCSVDataCache(): Promise<CSVDataCache | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.CSV_STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.get(this.CSV_DATA_KEY);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data) {
            resolve(result.data as CSVDataCache);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('Failed to load CSV data cache from IndexedDB:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error loading CSV data cache from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Check if CSV data cache is valid (exists and not expired)
   */
  async isCSVCacheValid(): Promise<boolean> {
    try {
      const csvCache = await this.loadCSVDataCache();
      if (!csvCache) {
        return false;
      }

      const now = Date.now();
      const cacheAge = now - csvCache.timestamp;
      const maxAge = this.CSV_CACHE_EXPIRY_HOURS * 60 * 60 * 1000; // Convert hours to milliseconds

      return cacheAge < maxAge;
    } catch (error) {
      console.error('Error checking CSV cache validity:', error);
      return false;
    }
  }

  /**
   * Clear CSV data cache only
   */
  async clearCSVCache(): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.CSV_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.CSV_STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.delete(this.CSV_DATA_KEY);

        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => {
          console.error('Failed to clear CSV data cache from IndexedDB:', request.error);
          reject(request.error);
        };
      });
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
      const csvCache = await this.loadCSVDataCache();
      if (!csvCache) {
        return { exists: false };
      }

      const now = Date.now();
      const age = now - csvCache.timestamp;
      const maxAge = this.CSV_CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      const isValid = age < maxAge;

      return {
        exists: true,
        timestamp: csvCache.timestamp,
        age,
        isValid
      };
    } catch (error) {
      console.error('Error getting CSV cache info:', error);
      return { exists: false };
    }
  }
}

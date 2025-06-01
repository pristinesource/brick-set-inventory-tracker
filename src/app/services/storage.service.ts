import { Injectable } from '@angular/core';
import { AppState, UserInventory, GlobalSettings } from '../models/models';
import { BehaviorSubject, Observable } from 'rxjs';
import { IndexedDBService } from './indexeddb.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly FALLBACK_KEY = 'brickInventoryAppState';

  private appStateSubject = new BehaviorSubject<AppState>({
    userInventories: [],
    activeInventoryId: null,
    globalSettings: {
      imagePreviewSize: '1x',
      includeSparePartsInProgress: true
    }
  });

  private isIndexedDBSupported = false;
  private migrationCompleted = false;

  constructor(private indexedDBService: IndexedDBService) {
    this.isIndexedDBSupported = IndexedDBService.isSupported();
    this.loadState();
  }

  /**
   * Load app state from IndexedDB or localStorage, always preferring the newest data
   */
  private async loadState(): Promise<void> {
    try {
      let finalState: AppState | null = null;

      if (this.isIndexedDBSupported) {
        // IndexedDB is supported - check both sources and use the newest
        const [indexedDBState, localStorageState] = await Promise.all([
          this.loadFromIndexedDB(),
          this.loadFromLocalStorage()
        ]);

        // Determine which data is newer
        const indexedDBTimestamp = indexedDBState?.timestamp || 0;
        const localStorageTimestamp = localStorageState?.timestamp || 0;

        if (localStorageState && localStorageTimestamp > indexedDBTimestamp) {
          // localStorage has newer data - migrate it to IndexedDB
          console.log('Found newer data in localStorage, migrating to IndexedDB...');
          try {
            await this.indexedDBService.saveAppState(localStorageState.data);
            finalState = localStorageState.data;

            // Clear localStorage after successful migration
            localStorage.removeItem(this.FALLBACK_KEY);
            console.log('Successfully migrated newer data from localStorage to IndexedDB');
            this.migrationCompleted = true;
          } catch (error) {
            console.error('Failed to migrate data from localStorage to IndexedDB:', error);
            // Use localStorage data anyway
            finalState = localStorageState.data;
          }
        } else if (indexedDBState) {
          // IndexedDB has the newest data (or equal timestamps)
          finalState = indexedDBState.data;

          // If localStorage also has data but it's older, clean it up
          if (localStorageState && localStorageTimestamp <= indexedDBTimestamp) {
            localStorage.removeItem(this.FALLBACK_KEY);
            console.log('Cleaned up older data from localStorage');
          }
        } else if (localStorageState) {
          // Only localStorage has data - migrate it
          console.log('Migrating data from localStorage to IndexedDB...');
          try {
            await this.indexedDBService.saveAppState(localStorageState.data);
            finalState = localStorageState.data;

            // Clear localStorage after successful migration
            localStorage.removeItem(this.FALLBACK_KEY);
            console.log('Successfully migrated data from localStorage to IndexedDB');
            this.migrationCompleted = true;
          } catch (error) {
            console.error('Failed to migrate data from localStorage to IndexedDB:', error);
            // Use localStorage data anyway
            finalState = localStorageState.data;
          }
        }
        // If neither source has data, finalState remains null (will use defaults)

      } else {
        // IndexedDB not supported - use localStorage only
        console.log('IndexedDB not supported, using localStorage only');
        const localStorageState = await this.loadFromLocalStorage();
        finalState = localStorageState?.data || null;
      }

      if (finalState) {
        // Migrate existing data structure if needed
        const migratedState = this.migrateState(finalState);
        this.appStateSubject.next(migratedState);
      }
    } catch (error) {
      console.error('Failed to load app state:', error);
      // Continue with default state if loading fails
    }
  }

  /**
   * Load state from IndexedDB with timestamp
   */
  private async loadFromIndexedDB(): Promise<{ data: AppState; timestamp: number } | null> {
    try {
      return await this.indexedDBService.loadAppStateWithTimestamp();
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Load state from localStorage with timestamp
   */
  private async loadFromLocalStorage(): Promise<{ data: AppState; timestamp: number } | null> {
    try {
      const storedData = localStorage.getItem(this.FALLBACK_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);

        // Check if it's the new format with timestamp or old format
        if (parsed.data && parsed.timestamp) {
          return { data: parsed.data as AppState, timestamp: parsed.timestamp };
        } else {
          // Old format - treat as data directly with old timestamp
          return { data: parsed as AppState, timestamp: 0 };
        }
      }
      return null;
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      return null;
    }
  }

  /**
   * Migrate app state from boolean ownership to quantity-based tracking
   */
  private migrateState(state: AppState): AppState {
    const migratedInventories = state.userInventories.map(inventory => {
      const migratedPartsOwned: Record<string, number> = {};
      const migratedMinifigsOwned: Record<string, number> = {};

      // Migrate partsOwned from boolean to number
      for (const [key, value] of Object.entries(inventory.partsOwned)) {
        if (typeof value === 'boolean') {
          migratedPartsOwned[key] = value ? 1 : 0;
        } else {
          migratedPartsOwned[key] = value as number;
        }
      }

      // Migrate minifigsOwned from boolean to number
      for (const [key, value] of Object.entries(inventory.minifigsOwned)) {
        if (typeof value === 'boolean') {
          migratedMinifigsOwned[key] = value ? 1 : 0;
        } else {
          migratedMinifigsOwned[key] = value as number;
        }
      }

      return {
        ...inventory,
        partsOwned: migratedPartsOwned,
        minifigsOwned: migratedMinifigsOwned
      };
    });

    // Ensure global settings exist with defaults
    const globalSettings: GlobalSettings = {
      imagePreviewSize: state.globalSettings?.imagePreviewSize || '1x',
      includeSparePartsInProgress: state.globalSettings?.includeSparePartsInProgress || true
    };

    return {
      ...state,
      userInventories: migratedInventories,
      globalSettings
    };
  }

  /**
   * Save current app state to IndexedDB or localStorage fallback
   */
  private async saveState(): Promise<void> {
    try {
      const currentState = this.appStateSubject.getValue();
      const timestamp = Date.now();

      if (this.isIndexedDBSupported) {
        try {
          await this.indexedDBService.saveAppState(currentState);
        } catch (error) {
          console.error('Failed to save to IndexedDB, falling back to localStorage:', error);
          // Fallback to localStorage with timestamp
          const dataWithTimestamp = {
            data: currentState,
            timestamp: timestamp
          };
          localStorage.setItem(this.FALLBACK_KEY, JSON.stringify(dataWithTimestamp));
        }
      } else {
        // IndexedDB not supported - use localStorage with timestamp
        const dataWithTimestamp = {
          data: currentState,
          timestamp: timestamp
        };
        localStorage.setItem(this.FALLBACK_KEY, JSON.stringify(dataWithTimestamp));
      }
    } catch (error) {
      console.error('Failed to save app state:', error);
    }
  }

  /**
   * Get the current app state as an observable
   */
  getState(): Observable<AppState> {
    return this.appStateSubject.asObservable();
  }

  /**
   * Add a new user inventory
   */
  addUserInventory(inventory: UserInventory): void {
    const currentState = this.appStateSubject.getValue();
    const updatedState = {
      ...currentState,
      userInventories: [...currentState.userInventories, inventory],
      activeInventoryId: currentState.activeInventoryId || inventory.id
    };

    this.appStateSubject.next(updatedState);
    this.saveState();
  }

  /**
   * Update an existing user inventory
   */
  updateUserInventory(inventory: UserInventory): void {
    const currentState = this.appStateSubject.getValue();
    const updatedInventories = currentState.userInventories.map(inv =>
      inv.id === inventory.id ? inventory : inv
    );

    const updatedState = {
      ...currentState,
      userInventories: updatedInventories
    };

    this.appStateSubject.next(updatedState);
    this.saveState();
  }

  /**
   * Delete a user inventory
   */
  deleteUserInventory(inventoryId: string): void {
    const currentState = this.appStateSubject.getValue();
    const updatedInventories = currentState.userInventories.filter(inv => inv.id !== inventoryId);

    let activeId = currentState.activeInventoryId;
    if (activeId === inventoryId) {
      activeId = updatedInventories.length > 0 ? updatedInventories[0].id : null;
    }

    const updatedState = {
      ...currentState,
      userInventories: updatedInventories,
      activeInventoryId: activeId
    };

    this.appStateSubject.next(updatedState);
    this.saveState();
  }

  /**
   * Set active inventory
   */
  setActiveInventory(inventoryId: string): void {
    const currentState = this.appStateSubject.getValue();
    const updatedState = {
      ...currentState,
      activeInventoryId: inventoryId
    };

    this.appStateSubject.next(updatedState);
    this.saveState();
  }

  /**
   * Export app state as a JSON string for download
   */
  exportState(): string {
    return JSON.stringify(this.appStateSubject.getValue());
  }

  /**
   * Import app state from a JSON string
   */
  async importState(stateJson: string): Promise<boolean> {
    try {
      const newState = JSON.parse(stateJson) as AppState;
      this.appStateSubject.next(newState);
      await this.saveState();
      return true;
    } catch (error) {
      console.error('Failed to import app state:', error);
      return false;
    }
  }

  /**
   * Update global settings
   */
  updateGlobalSettings(settings: Partial<GlobalSettings>): void {
    const currentState = this.appStateSubject.getValue();
    const updatedState = {
      ...currentState,
      globalSettings: {
        ...currentState.globalSettings,
        ...settings
      }
    };

    this.appStateSubject.next(updatedState);
    this.saveState();
  }

  /**
   * Clear all data from IndexedDB or localStorage fallback
   */
  async clearAllData(): Promise<void> {
    try {
      if (this.isIndexedDBSupported) {
        // Clear only user data, preserve CSV cache
        await this.indexedDBService.clearUserData();
      } else {
        // Fallback to localStorage
        localStorage.removeItem(this.FALLBACK_KEY);
      }

      // Reset app state to default
      const defaultState: AppState = {
        userInventories: [],
        activeInventoryId: null,
        globalSettings: {
          imagePreviewSize: '1x',
          includeSparePartsInProgress: true
        }
      };

      this.appStateSubject.next(defaultState);
    } catch (error) {
      console.error('Failed to clear app data:', error);
      throw error;
    }
  }

  /**
   * Clear CSV cache only (for manual refresh)
   */
  async clearCSVCache(): Promise<void> {
    if (this.isIndexedDBSupported) {
      await this.indexedDBService.clearCSVCache();
    }
  }

  /**
   * Clear all data including CSV cache
   */
  async clearAllDataIncludingCache(): Promise<void> {
    try {
      if (this.isIndexedDBSupported) {
        await this.indexedDBService.clearAllData();
      } else {
        // Fallback to localStorage
        localStorage.removeItem(this.FALLBACK_KEY);
      }

      // Reset app state to default
      const defaultState: AppState = {
        userInventories: [],
        activeInventoryId: null,
        globalSettings: {
          imagePreviewSize: '1x',
          includeSparePartsInProgress: true
        }
      };

      this.appStateSubject.next(defaultState);
    } catch (error) {
      console.error('Failed to clear all data including cache:', error);
      throw error;
    }
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<{ used: number; quota: number; type: string } | null> {
    if (this.isIndexedDBSupported) {
      const info = await this.indexedDBService.getStorageInfo();
      return info ? { ...info, type: 'IndexedDB' } : null;
    } else {
      // Estimate localStorage usage
      try {
        const data = localStorage.getItem(this.FALLBACK_KEY);
        const used = data ? new Blob([data]).size : 0;
        return {
          used,
          quota: 5 * 1024 * 1024, // Typical localStorage limit is ~5MB
          type: 'localStorage'
        };
      } catch (error) {
        return null;
      }
    }
  }

  /**
   * Check if IndexedDB is being used
   */
  isUsingIndexedDB(): boolean {
    return this.isIndexedDBSupported;
  }
}

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
    this.checkIndexedDBSupport();
    this.loadState();
  }

  private checkIndexedDBSupport(): void {
    // First check if IndexedDB is disabled for this session
    if (this.indexedDBService.isDisabledForSession()) {
      this.isIndexedDBSupported = false;
      console.warn(`IndexedDB disabled for session: ${this.indexedDBService.getDisabledReason()}`);
      return;
    }

    // Then check browser support
    this.isIndexedDBSupported = IndexedDBService.isSupported();

    if (!this.isIndexedDBSupported) {
      console.warn('IndexedDB not supported by browser, using localStorage fallback');
    }
  }

  /**
   * Load app state from IndexedDB or localStorage, always preferring the newest data
   */
  async loadState(): Promise<void> {
    // Re-check support in case it was disabled during initialization
    this.checkIndexedDBSupport();

    try {
      if (this.isIndexedDBSupported) {
        // Try IndexedDB first - no timeout, let it complete naturally
        // This prevents inappropriate fallbacks during database initialization
        const state = await this.loadFromIndexedDB();

        if (state) {
          this.appStateSubject.next(state);
          this.saveState();
          return;
        }
      }
    } catch (error) {
      console.warn('Failed to load from IndexedDB, using localStorage fallback:', error);
      // Re-check support after failure
      this.checkIndexedDBSupport();
    }

    // Fallback to localStorage
    try {
      const localStorageState = await this.loadFromLocalStorage();
      if (localStorageState) {
        this.appStateSubject.next(localStorageState.data);
        this.saveState();
        return;
      }
    } catch (error) {
      console.warn('Failed to load from localStorage, using default state:', error);
    }

    // Use default state if all loading methods fail
    this.appStateSubject.next({
      userInventories: [],
      activeInventoryId: null,
      globalSettings: {
        imagePreviewSize: '1x',
        includeSparePartsInProgress: true
      }
    });
    this.saveState();
  }

  /**
   * Load state from IndexedDB with timeout
   */
  private async loadFromIndexedDB(): Promise<AppState | null> {
    try {
      if (!this.isIndexedDBSupported || this.indexedDBService.isDisabledForSession()) {
        return null;
      }

      const result = await this.indexedDBService.loadAppStateWithTimestamp();
      if (!result) {
        return null;
      }

      const { data, timestamp } = result;

      // Check if IndexedDB data is fresher than localStorage
      const localTimestamp = this.getLocalStorageTimestamp();
      if (localTimestamp && timestamp < localTimestamp) {
        // localStorage is newer, prefer it
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error loading from IndexedDB:', error);
      throw error; // Re-throw to trigger fallback
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

      // Re-check support before attempting save
      this.checkIndexedDBSupport();

      if (this.isIndexedDBSupported && !this.indexedDBService.isDisabledForSession()) {
        try {
          // Save to IndexedDB - no timeout, let it complete naturally
          // This prevents inappropriate fallbacks during database initialization
          await this.indexedDBService.saveAppState(currentState);
          return; // Success, no need for fallback
        } catch (error) {
          console.warn('Failed to save to IndexedDB, falling back to localStorage:', error);
          // Re-check support after failure
          this.checkIndexedDBSupport();
        }
      }

      // Use localStorage (either as fallback or primary storage)
      const dataWithTimestamp = {
        data: currentState,
        timestamp: timestamp
      };
      localStorage.setItem(this.FALLBACK_KEY, JSON.stringify(dataWithTimestamp));
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
      this.checkIndexedDBSupport();

      if (this.isIndexedDBSupported) {
        try {
          // Clear only user data, preserve CSV cache
          await this.indexedDBService.clearUserData();
        } catch (error) {
          console.warn('Failed to clear IndexedDB data, clearing localStorage:', error);
          this.checkIndexedDBSupport();
          localStorage.removeItem(this.FALLBACK_KEY);
        }
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
    this.checkIndexedDBSupport();
    if (this.isIndexedDBSupported) {
      try {
        await this.indexedDBService.clearCSVCache();
      } catch (error) {
        console.warn('Failed to clear CSV cache from IndexedDB:', error);
        this.checkIndexedDBSupport();
      }
    }
  }

  /**
   * Clear all data including CSV cache
   */
  async clearAllDataIncludingCache(): Promise<void> {
    try {
      this.checkIndexedDBSupport();

      if (this.isIndexedDBSupported) {
        try {
          await this.indexedDBService.clearAllData();
        } catch (error) {
          console.warn('Failed to clear all IndexedDB data, clearing localStorage:', error);
          this.checkIndexedDBSupport();
          localStorage.removeItem(this.FALLBACK_KEY);
        }
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
  async getStorageInfo(): Promise<{ used: number; quota: number; type: string; status: string } | null> {
    this.checkIndexedDBSupport();

    if (this.isIndexedDBSupported) {
      try {
        const info = await this.indexedDBService.getStorageInfo();
        return info ? { ...info, type: 'IndexedDB', status: 'Active' } : null;
      } catch (error) {
        console.warn('Failed to get IndexedDB storage info:', error);
        this.checkIndexedDBSupport();
        // Fall through to localStorage
      }
    }

    // Use localStorage info (either as fallback or primary)
    try {
      const data = localStorage.getItem(this.FALLBACK_KEY);
      const used = data ? new Blob([data]).size : 0;
      const status = this.indexedDBService.isDisabledForSession()
        ? `Disabled: ${this.indexedDBService.getDisabledReason()}`
        : 'Fallback';

      return {
        used,
        quota: 5 * 1024 * 1024, // Typical localStorage limit is ~5MB
        type: 'localStorage',
        status
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if IndexedDB is being used
   */
  isUsingIndexedDB(): boolean {
    return this.isIndexedDBSupported;
  }

  private getLocalStorageTimestamp(): number | null {
    const storedData = localStorage.getItem(this.FALLBACK_KEY);
    if (storedData) {
      const parsed = JSON.parse(storedData);
      if (parsed.data && parsed.timestamp) {
        return parsed.timestamp;
      }
    }
    return null;
  }

  /**
   * Reset IndexedDB and try to re-enable it
   */
  async resetIndexedDB(): Promise<boolean> {
    try {
      this.indexedDBService.resetSessionState();
      this.checkIndexedDBSupport();

      if (this.isIndexedDBSupported) {
        // Try to save current state to test IndexedDB
        await this.saveState();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to reset IndexedDB:', error);
      return false;
    }
  }

  /**
   * Check if there is existing user data that would be overwritten
   */
  hasExistingData(): boolean {
    const currentState = this.appStateSubject.getValue();
    return currentState.userInventories.length > 0;
  }
}

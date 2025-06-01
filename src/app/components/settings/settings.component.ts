import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { ExportService } from '../../services/export.service';
import { DataService } from '../../services/data.service';
import { GlobalSettings } from '../../models/models';
import { IndexedDBService } from '../../services/indexeddb.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  message: { text: string, type: 'success' | 'error' } | null = null;
  selectedFile: File | null = null;
  globalSettings: GlobalSettings = {
    imagePreviewSize: '1x',
    includeSparePartsInProgress: true
  };
  storageInfo: { used: number; quota: number; type: string; status: string } | null = null;
  isUsingIndexedDB = false;
  isIndexedDBDisabled = false;
  indexedDBDisabledReason = '';
  csvCacheInfo: { exists: boolean; timestamp?: number; age?: number; isValid?: boolean } | null = null;
  isRefreshingCSV = false;
  isCheckingIntegrity = false;
  isResettingIndexedDB = false;
  dataIntegrityResults: {
    comparisons: Array<{
      dataType: string;
      memoryCount: number;
      indexedDBCount: number;
    }>;
    totalMemory: number;
    totalIndexedDB: number;
    isHealthy: boolean;
    message: string;
  } | null = null;

  constructor(
    private storageService: StorageService,
    private exportService: ExportService,
    private dataService: DataService,
    private indexedDBService: IndexedDBService
  ) {}

  async ngOnInit(): Promise<void> {
    this.storageService.getState().subscribe(state => {
      this.globalSettings = { ...state.globalSettings };
    });

    // Load storage information
    await this.loadStorageInfo();
    this.isUsingIndexedDB = this.storageService.isUsingIndexedDB();

    // Load CSV cache information
    await this.loadCSVCacheInfo();
  }

  async loadStorageInfo(): Promise<void> {
    try {
      this.storageInfo = await this.storageService.getStorageInfo();
      this.isUsingIndexedDB = this.storageService.isUsingIndexedDB();

      // Check if IndexedDB is disabled
      this.isIndexedDBDisabled = !this.isUsingIndexedDB && 'indexedDB' in window;
      if (this.isIndexedDBDisabled && this.storageInfo) {
        this.indexedDBDisabledReason = this.storageInfo.status.includes('Disabled:')
          ? this.storageInfo.status.replace('Disabled: ', '')
          : 'Unknown reason';
      }
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  }

  async loadCSVCacheInfo(): Promise<void> {
    try {
      this.csvCacheInfo = await this.dataService.getCSVCacheInfo();
    } catch (error) {
      console.error('Failed to load CSV cache info:', error);
    }
  }

  updateImagePreviewSize(size: '1x' | '2x' | '4x'): void {
    this.globalSettings.imagePreviewSize = size;
    this.storageService.updateGlobalSettings({ imagePreviewSize: size });
    this.showMessage(`Image preview size updated to ${size}`, 'success');
  }

  updateIncludeSparePartsInProgress(include: boolean): void {
    this.globalSettings.includeSparePartsInProgress = include;
    this.storageService.updateGlobalSettings({ includeSparePartsInProgress: include });
    this.showMessage(
      include
        ? 'Spare parts will now be included in progress calculations'
        : 'Spare parts will now be excluded from progress calculations',
      'success'
    );
  }

  exportData(): void {
    try {
      this.exportService.exportData();
      this.showMessage('Data exported successfully. Download started.', 'success');
    } catch (error) {
      console.error('Error exporting data:', error);
      this.showMessage('Failed to export data. Please try again.', 'error');
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    } else {
      this.selectedFile = null;
    }
  }

  async importData(): Promise<void> {
    if (!this.selectedFile) {
      this.showMessage('Please select a file to import.', 'error');
      return;
    }

    // Check if there's existing data that would be overwritten
    if (this.storageService.hasExistingData()) {
      const confirmOverwrite = confirm(
        '⚠️ WARNING: Importing data will overwrite all your existing inventory data in the browser.\n\n' +
        'This action cannot be undone. All your current inventories, part ownership data, and settings will be replaced.\n\n' +
        'Do you want to continue?'
      );

      if (!confirmOverwrite) {
        this.showMessage('Import cancelled. Your existing data remains unchanged.', 'success');
        return;
      }
    }

    try {
      const success = await this.exportService.importData(this.selectedFile);
      if (success) {
        this.showMessage('Data imported successfully.', 'success');
        this.selectedFile = null;
        // Refresh storage info after import
        await this.loadStorageInfo();
      } else {
        this.showMessage('Failed to import data. Invalid file format.', 'error');
      }
    } catch (error) {
      console.error('Error importing data:', error);
      this.showMessage('An error occurred while importing data.', 'error');
    }
  }

  async clearAllData(): Promise<void> {
    if (confirm('Are you sure you want to clear all your data? This action cannot be undone.')) {
      try {
        await this.storageService.clearAllData();
        this.showMessage('All data cleared successfully.', 'success');
        // Refresh storage info after clearing
        await this.loadStorageInfo();
        // Reload the page to reset the app state
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        console.error('Error clearing data:', error);
        this.showMessage('Failed to clear data. Please try again.', 'error');
      }
    }
  }

  async refreshCSVData(): Promise<void> {
    if (confirm('Are you sure you want to refresh the CSV data? This will download the latest data from the server and may take a few minutes.')) {
      this.isRefreshingCSV = true;
      try {
        const success = await this.dataService.refreshCSVData();
        if (success) {
          this.showMessage('CSV data refreshed successfully from server.', 'success');
          await this.loadCSVCacheInfo();
          await this.loadStorageInfo();
        } else {
          this.showMessage('Failed to refresh CSV data. Please try again.', 'error');
        }
      } catch (error) {
        console.error('Error refreshing CSV data:', error);
        this.showMessage('An error occurred while refreshing CSV data.', 'error');
      } finally {
        this.isRefreshingCSV = false;
      }
    }
  }

  async clearAllDataIncludingCache(): Promise<void> {
    if (confirm('Are you sure you want to clear ALL data including CSV cache? This will force a complete reload of all data on next visit and cannot be undone.')) {
      try {
        await this.storageService.clearAllDataIncludingCache();
        this.showMessage('All data including cache cleared successfully.', 'success');
        // Refresh storage info after clearing
        await this.loadStorageInfo();
        await this.loadCSVCacheInfo();
        // Reload the page to reset the app state
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        console.error('Error clearing all data:', error);
        this.showMessage('Failed to clear all data. Please try again.', 'error');
      }
    }
  }

  async clearAllDataAndCache(): Promise<void> {
    if (this.isRefreshingCSV) return;

    if (confirm('⚠️ This will permanently delete ALL your inventory data and cached CSV data. This action cannot be undone. Are you sure?')) {
      this.isRefreshingCSV = true;
      try {
        console.log('Starting complete data clear...');

        // Clear user data from storage service
        await this.storageService.clearAllData();
        console.log('Storage service data cleared');

        // Clear CSV cache if IndexedDB is available
        if ('indexedDB' in window) {
          try {
            await this.indexedDBService.clearAllData();
            console.log('IndexedDB cleared completely');

            // Reset session state after clearing to allow fresh caching
            this.indexedDBService.resetSessionState();
            console.log('IndexedDB session state reset');
          } catch (error) {
            console.warn('Failed to clear IndexedDB data:', error);
          }
        }

        console.log('All data cleared successfully, reloading page...');
        // Refresh the page to reload everything fresh
        window.location.reload();
      } catch (error) {
        console.error('Error clearing all data:', error);
        alert('Error clearing data. Please try again.');
      } finally {
        this.isRefreshingCSV = false;
      }
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getStoragePercentage(): number {
    if (!this.storageInfo || this.storageInfo.quota === 0) return 0;
    return (this.storageInfo.used / this.storageInfo.quota) * 100;
  }

  formatCacheAge(ageMs?: number): string {
    if (!ageMs) return 'Unknown';

    const hours = ageMs / (1000 * 60 * 60);
    if (hours < 1) {
      const minutes = ageMs / (1000 * 60);
      return `${Math.round(minutes)} minutes ago`;
    } else if (hours < 24) {
      return `${Math.round(hours * 10) / 10} hours ago`;
    } else {
      const days = hours / 24;
      return `${Math.round(days * 10) / 10} days ago`;
    }
  }

  getCacheStatusText(): string {
    if (!this.isUsingIndexedDB) return 'No caching (IndexedDB unavailable)';
    if (!this.csvCacheInfo) return 'Unknown';
    if (!this.csvCacheInfo.exists) return 'No cache found';
    if (this.csvCacheInfo.isValid) return 'Valid';
    return 'Expired (>12 hours old)';
  }

  getCacheStatusClass(): string {
    if (!this.isUsingIndexedDB) return 'text-gray-500';
    if (!this.csvCacheInfo) return 'text-gray-500';
    return this.csvCacheInfo.exists && this.csvCacheInfo.isValid
      ? 'text-green-600'
      : 'text-orange-600';
  }

  async checkDataIntegrity(): Promise<void> {
    this.isCheckingIntegrity = true;
    this.dataIntegrityResults = null;

    try {
      // Get current data stats from DataService
      const memoryStats = this.dataService.getCurrentDataStats();

      // Get IndexedDB cached data
      const indexedDBService = (this.storageService as any).indexedDBService;
      const cachedData = await indexedDBService.loadCSVDataCache();

      const comparisons: Array<{
        dataType: string;
        memoryCount: number;
        indexedDBCount: number;
      }> = [];
      let totalMemory = 0;
      let totalIndexedDB = 0;
      let hasDiscrepancies = false;

      const dataTypes = [
        'inventories',
        'inventoryParts',
        'inventoryMinifigs',
        'inventorySets',
        'parts',
        'colors',
        'partCategories',
        'partRelationships',
        'elements',
        'minifigs',
        'sets',
        'themes'
      ];

      dataTypes.forEach(dataType => {
        const memoryCount = memoryStats[dataType] || 0;
        const indexedDBCount = cachedData && Array.isArray(cachedData[dataType]) ? cachedData[dataType].length : 0;

        comparisons.push({
          dataType: dataType.charAt(0).toUpperCase() + dataType.slice(1),
          memoryCount,
          indexedDBCount
        });

        totalMemory += memoryCount;
        totalIndexedDB += indexedDBCount;

        if (memoryCount !== indexedDBCount) {
          hasDiscrepancies = true;
        }
      });

      this.dataIntegrityResults = {
        comparisons,
        totalMemory,
        totalIndexedDB,
        isHealthy: !hasDiscrepancies,
        message: hasDiscrepancies
          ? 'Some data counts differ between memory and IndexedDB cache. Consider refreshing CSV data.'
          : 'All data counts match between memory and IndexedDB cache. Data integrity is good.'
      };

    } catch (error) {
      console.error('Error checking data integrity:', error);
      this.dataIntegrityResults = {
        comparisons: [],
        totalMemory: 0,
        totalIndexedDB: 0,
        isHealthy: false,
        message: 'Failed to check data integrity. Error: ' + (error as Error).message
      };
    } finally {
      this.isCheckingIntegrity = false;
    }
  }

  async resetIndexedDB(): Promise<void> {
    if (this.isResettingIndexedDB) return;
    this.isResettingIndexedDB = true;

    try {
      // Force cleanup first
      this.indexedDBService.forceCleanup();

      // Reset session state
      this.indexedDBService.resetSessionState();

      // Reload storage info to reflect changes
      await this.loadStorageInfo();

      console.log('IndexedDB session state reset successfully');
    } catch (error) {
      console.error('Error resetting IndexedDB:', error);
    } finally {
      this.isResettingIndexedDB = false;
    }
  }

  async deleteEntireDatabase(): Promise<void> {
    if (this.isResettingIndexedDB) return;

    if (!confirm('⚠️ WARNING: This will completely delete the IndexedDB database and all cached data. This cannot be undone. Continue?')) {
      return;
    }

    this.isResettingIndexedDB = true;

    try {
      // Force cleanup and delete database
      this.indexedDBService.forceCleanup();
      await this.indexedDBService.deleteDatabase();

      // Reset session state
      this.indexedDBService.resetSessionState();

      // Reload storage info to reflect changes
      await this.loadStorageInfo();

      console.log('IndexedDB database deleted successfully');
      alert('Database deleted successfully. The page will reload to reinitialize.');

      // Reload the page to reinitialize everything
      window.location.reload();
    } catch (error) {
      console.error('Error deleting database:', error);
      alert(`Failed to delete database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isResettingIndexedDB = false;
    }
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    this.message = { text, type };

    // Clear message after 5 seconds
    setTimeout(() => {
      this.message = null;
    }, 5000);
  }
}

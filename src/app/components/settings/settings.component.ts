import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { ExportService } from '../../services/export.service';
import { DataService } from '../../services/data.service';
import { GlobalSettings } from '../../models/models';

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
  storageInfo: { used: number; quota: number; type: string } | null = null;
  isUsingIndexedDB = false;
  csvCacheInfo: { exists: boolean; timestamp?: number; age?: number; isValid?: boolean } | null = null;
  isRefreshingCSV = false;

  constructor(
    private storageService: StorageService,
    private exportService: ExportService,
    private dataService: DataService
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
    if (!this.csvCacheInfo.exists) return 'text-red-600';
    if (this.csvCacheInfo.isValid) return 'text-green-600';
    return 'text-orange-600';
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    this.message = { text, type };

    // Clear message after 5 seconds
    setTimeout(() => {
      this.message = null;
    }, 5000);
  }
}

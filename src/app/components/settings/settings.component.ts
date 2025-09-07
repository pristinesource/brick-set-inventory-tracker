import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Color, ColorAlias, GlobalSettings, MyColorsSettings } from '../../models/models';
import { ColorGroupingService } from '../../services/color-grouping.service';
import { DataService } from '../../services/data.service';
import { ExportService } from '../../services/export.service';
import { IndexedDBService } from '../../services/indexeddb.service';
import { StorageService } from '../../services/storage.service';

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
    message: { text: string, type: 'success' | 'error' } | null = null;
    selectedFile: File | null = null;
    globalSettings: GlobalSettings = {
        imagePreviewSize: '1x',
        includeSparePartsInProgress: true,
        alwaysTrackLoosePartsByColor: false
    };

    // My Colors settings
    myColorsSettings: MyColorsSettings = {
        enabledColorIds: [],
        colorAliases: [],
        showHiddenColors: true,
        applyToSets: false
    };
    allColors: Color[] = [];
    selectedColors: Set<number> = new Set();

    // Color alias modal
    showColorAliasModal = false;
    editingAlias: ColorAlias | null = null;
    aliasName = '';
    aliasSelectedColors: Set<number> = new Set();
    aliasPrimaryColorId: number | null = null;

    storageInfo: { used: number; quota: number; type: string; status: string } | null = null;
    isUsingIndexedDB = false;
    isIndexedDBDisabled = false;
    indexedDBDisabledReason = '';
    csvCacheInfo: { exists: boolean; timestamp?: number; age?: number; isValid?: boolean } | null = null;
    isRefreshingCSV = false;
    isCheckingIntegrity = false;
    isResettingIndexedDB = false;
    isClearingAllData = false;
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
        private colorGroupingService: ColorGroupingService,
        private exportService: ExportService,
        private dataService: DataService,
        private indexedDBService: IndexedDBService
    ) { }

    /**
     * Get the cache expiry hours for UI display
     */
    get cacheExpiryHours(): number {
        return this.indexedDBService.getCacheExpiryHours();
    }

    /**
     * Get a user-friendly description of the cache expiry time
     */
    get cacheExpiryDescription(): string {
        const hours = this.cacheExpiryHours;
        const days = Math.floor(hours / 24);

        if (days === 1) {
            return '1 day';
        } else if (days < 7) {
            return `${days} days`;
        } else if (days < 30) {
            const weeks = Math.floor(days / 7);
            return weeks === 1 ? '1 week' : `${weeks} weeks`;
        } else if (days < 365) {
            const months = Math.floor(days / 30);
            return months === 1 ? '1 month' : `${months} months`;
        } else {
            const years = Math.floor(days / 365);
            return years === 1 ? '1 year' : `${years} years`;
        }
    }

    async ngOnInit(): Promise<void> {
        this.storageService.getState().subscribe(state => {
            this.globalSettings = { ...state.globalSettings };
            this.myColorsSettings = { ...this.storageService.getMyColorsSettings() };
            this.selectedColors = new Set(this.myColorsSettings.enabledColorIds);
        });

        // Load all colors
        this.dataService.isDataLoaded().subscribe(loaded => {
            if (loaded) {
                this.allColors = this.dataService.getCurrentColors();
            }
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

    updateAlwaysTrackByColor(alwaysTrack: boolean): void {
        this.globalSettings.alwaysTrackLoosePartsByColor = alwaysTrack;
        this.storageService.updateGlobalSettings({ alwaysTrackLoosePartsByColor: alwaysTrack });
        this.showMessage(
            alwaysTrack
                ? 'Loose parts will now always be tracked by color'
                : 'Loose parts can now be switched between color and quantity tracking',
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
        if (this.isClearingAllData) return;

        if (confirm('⚠️ This will permanently delete ALL your inventory data and cached CSV data. This action cannot be undone. Are you sure?')) {
            this.isClearingAllData = true;
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
                this.isClearingAllData = false;
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
        return `Expired (>${this.cacheExpiryHours} hours old)`;
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

    // My Colors Methods
    toggleColorSelection(colorId: number): void {
        if (this.selectedColors.has(colorId)) {
            this.selectedColors.delete(colorId);
        } else {
            this.selectedColors.add(colorId);
        }
    }

    saveMyColors(): void {
        this.myColorsSettings.enabledColorIds = Array.from(this.selectedColors);
        this.storageService.updateMyColorsSettings({
            enabledColorIds: this.myColorsSettings.enabledColorIds
        });
        this.showMessage('My Colors preferences saved successfully.', 'success');
    }

    selectAllColors(): void {
        this.allColors.forEach(color => this.selectedColors.add(color.id));
    }

    clearAllColors(): void {
        this.selectedColors.clear();
    }

    updateApplyToSets(apply: boolean): void {
        this.myColorsSettings.applyToSets = apply;
        this.storageService.updateMyColorsSettings({ applyToSets: apply });
        this.showMessage(
            apply
                ? 'Color filtering will now apply to sets inventory'
                : 'Color filtering will only apply to loose parts',
            'success'
        );
    }

    // Color Alias Methods
    openNewAliasModal(): void {
        this.editingAlias = null;
        this.aliasName = '';
        this.aliasSelectedColors.clear();
        this.aliasPrimaryColorId = null;
        this.showColorAliasModal = true;
    }

    openEditAliasModal(alias: ColorAlias): void {
        this.editingAlias = alias;
        this.aliasName = alias.name;
        this.aliasSelectedColors = new Set(alias.colorIds);
        this.aliasPrimaryColorId = alias.primaryColorId;
        this.showColorAliasModal = true;
    }

    closeAliasModal(): void {
        this.showColorAliasModal = false;
        this.editingAlias = null;
        this.aliasName = '';
        this.aliasSelectedColors.clear();
        this.aliasPrimaryColorId = null;
    }

    toggleAliasColorSelection(colorId: number): void {
        if (this.aliasSelectedColors.has(colorId)) {
            this.aliasSelectedColors.delete(colorId);
            // If we removed the primary color, select a new one
            if (colorId === this.aliasPrimaryColorId && this.aliasSelectedColors.size > 0) {
                this.aliasPrimaryColorId = Array.from(this.aliasSelectedColors)[0];
            }
        } else {
            this.aliasSelectedColors.add(colorId);
            // If no primary color is selected, make this the primary
            if (!this.aliasPrimaryColorId || !this.aliasSelectedColors.has(this.aliasPrimaryColorId)) {
                this.aliasPrimaryColorId = colorId;
            }
        }
    }

    setPrimaryColor(colorId: number): void {
        if (this.aliasSelectedColors.has(colorId)) {
            this.aliasPrimaryColorId = colorId;
        }
    }

    saveAlias(): void {
        if (!this.aliasName.trim()) {
            this.showMessage('Please enter a name for the color alias.', 'error');
            return;
        }

        if (this.aliasSelectedColors.size < 2) {
            this.showMessage('Please select at least 2 colors to create an alias.', 'error');
            return;
        }

        if (!this.aliasPrimaryColorId || !this.aliasSelectedColors.has(this.aliasPrimaryColorId)) {
            this.showMessage('Please select a primary color for this alias.', 'error');
            return;
        }

        const alias: ColorAlias = {
            id: this.editingAlias?.id || this.uuidv4(),
            name: this.aliasName.trim(),
            colorIds: Array.from(this.aliasSelectedColors),
            primaryColorId: this.aliasPrimaryColorId,
            dateCreated: this.editingAlias?.dateCreated || Date.now()
        };

        try {
            this.storageService.addOrUpdateColorAlias(alias);
            this.myColorsSettings = this.storageService.getMyColorsSettings();
            this.closeAliasModal();
            this.showMessage(
                this.editingAlias ? 'Color alias updated successfully.' : 'Color alias created successfully.',
                'success'
            );
        } catch (error) {
            this.showMessage((error as Error).message, 'error');
        }
    }

    deleteAlias(aliasId: string): void {
        if (confirm('Are you sure you want to delete this color alias?')) {
            this.storageService.removeColorAlias(aliasId);
            this.myColorsSettings = this.storageService.getMyColorsSettings();
            this.showMessage('Color alias deleted successfully.', 'success');
        }
    }

    getColorById(colorId: number): Color | undefined {
        return this.allColors.find(c => c.id === colorId);
    }

    getColorName(colorId: number): string {
        const color = this.getColorById(colorId);
        return color?.name || `Color ${colorId}`;
    }

    isColorInAlias(colorId: number): boolean {
        return this.myColorsSettings.colorAliases.some(alias =>
            alias.colorIds.includes(colorId)
        );
    }

    getAliasForColor(colorId: number): ColorAlias | null {
        return this.myColorsSettings.colorAliases.find(alias =>
            alias.colorIds.includes(colorId)
        ) || null;
    }

    getSortedColors(): Color[] {
        return [...this.allColors].sort((a, b) => {
            // Calculate popularity score based on num_parts and num_sets
            // Weight parts more heavily than sets since parts represent actual usage frequency
            const getPopularityScore = (color: Color): number => {
                const parts = color.num_parts || 0;
                const sets = color.num_sets || 0;
                return (parts * 3) + (sets * 1); // Parts weighted 3x more than sets
            };

            const scoreA = getPopularityScore(a);
            const scoreB = getPopularityScore(b);

            // Sort by popularity (highest first), then by name alphabetically
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }
            return a.name.localeCompare(b.name);
        });
    }

    uuidv4(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

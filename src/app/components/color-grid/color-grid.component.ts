import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Color, ColorGrid, ColorRegion, MyColorsSettings } from '../../models/models';
import { ColorGroupingService } from '../../services/color-grouping.service';
import { DataService } from '../../services/data.service';
import { StorageService } from '../../services/storage.service';

@Component({
    selector: 'app-color-grid',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './color-grid.component.html',
    styleUrls: ['./color-grid.component.css']
})
export class ColorGridComponent implements OnInit {
    // Grid data
    grid: (number | null)[][] = [];
    regions: ColorRegion[] = [];

    // Colors
    allColors: Color[] = [];
    myColorsSettings: MyColorsSettings = {
        enabledColorIds: [],
        colorAliases: [],
        showHiddenColors: true,
        applyToSets: false
    };
    availableColors: Color[] = [];

    // UI State
    selectedColorId: number | null = null;
    isMouseDown = false;
    backgroundFill: 'white' | 'black' | 'none' = 'white';
    showGrid = true;

    // Constants
    readonly GRID_SIZE = 16;

    constructor(
        private dataService: DataService,
        private colorGroupingService: ColorGroupingService,
        private storageService: StorageService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        // Initialize empty grid
        this.initializeGrid();

        // Load colors and settings
        this.loadData();
    }

    private initializeGrid(): void {
        this.grid = Array(this.GRID_SIZE).fill(null).map(() =>
            Array(this.GRID_SIZE).fill(null)
        );
    }

    private loadData(): void {
        // Load colors
        this.dataService.isDataLoaded().subscribe(loaded => {
            if (loaded) {
                this.allColors = this.dataService.getCurrentColors();
                this.updateAvailableColors();
            }
        });

        // Load My Colors settings
        this.storageService.getState().subscribe(state => {
            this.myColorsSettings = state.myColorsSettings || {
                enabledColorIds: [],
                colorAliases: [],
                showHiddenColors: true,
                applyToSets: false
            };

            // Load existing grid if available
            if (this.myColorsSettings.colorGrid) {
                this.grid = this.myColorsSettings.colorGrid.cells.map(row => [...row]);
                this.backgroundFill = this.myColorsSettings.colorGrid.backgroundFill;
                this.detectRegions();
            }

            this.updateAvailableColors();

            // Select first available color by default
            if (this.availableColors.length > 0 && !this.selectedColorId) {
                this.selectedColorId = this.availableColors[0].id;
            }
        });
    }

    private updateAvailableColors(): void {
        // Get colors that are in My Colors
        this.availableColors = this.allColors.filter(color =>
            this.myColorsSettings.enabledColorIds.includes(color.id)
        );
    }

    // Grid interaction methods
    onCellClick(row: number, col: number): void {
        if (this.selectedColorId !== null) {
            this.grid[row][col] = this.grid[row][col] === this.selectedColorId ? null : this.selectedColorId;
            this.detectRegions();
            this.saveGrid();
        }
    }

    onCellMouseDown(row: number, col: number): void {
        this.isMouseDown = true;
        this.onCellClick(row, col);
    }

    onCellMouseEnter(row: number, col: number): void {
        if (this.isMouseDown && this.selectedColorId !== null) {
            this.grid[row][col] = this.selectedColorId;
            this.detectRegions();
        }
    }

    onMouseUp(): void {
        if (this.isMouseDown) {
            this.isMouseDown = false;
            this.saveGrid();
        }
    }

    clearGrid(): void {
        if (confirm('Are you sure you want to clear the entire grid?')) {
            this.initializeGrid();
            this.regions = [];
            this.saveGrid();
        }
    }

    fillEmpty(): void {
        if (this.selectedColorId !== null) {
            for (let row = 0; row < this.GRID_SIZE; row++) {
                for (let col = 0; col < this.GRID_SIZE; col++) {
                    if (this.grid[row][col] === null) {
                        this.grid[row][col] = this.selectedColorId;
                    }
                }
            }
            this.detectRegions();
            this.saveGrid();
        }
    }

    // Region detection using flood fill
    private detectRegions(): void {
        this.regions = [];
        const visited = Array(this.GRID_SIZE).fill(null).map(() =>
            Array(this.GRID_SIZE).fill(false)
        );

        for (let row = 0; row < this.GRID_SIZE; row++) {
            for (let col = 0; col < this.GRID_SIZE; col++) {
                if (!visited[row][col] && this.grid[row][col] !== null) {
                    const region = this.floodFill(row, col, this.grid[row][col]!, visited);
                    if (region.cells.length > 0) {
                        this.regions.push(region);
                    }
                }
            }
        }
    }

    private floodFill(startRow: number, startCol: number, colorId: number, visited: boolean[][]): ColorRegion {
        const cells: { row: number; col: number }[] = [];
        const stack: { row: number; col: number }[] = [{ row: startRow, col: startCol }];

        let minRow = startRow, maxRow = startRow;
        let minCol = startCol, maxCol = startCol;

        while (stack.length > 0) {
            const { row, col } = stack.pop()!;

            if (row < 0 || row >= this.GRID_SIZE || col < 0 || col >= this.GRID_SIZE) {
                continue;
            }

            if (visited[row][col] || this.grid[row][col] !== colorId) {
                continue;
            }

            visited[row][col] = true;
            cells.push({ row, col });

            // Update bounds
            minRow = Math.min(minRow, row);
            maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col);
            maxCol = Math.max(maxCol, col);

            // Add neighbors
            stack.push({ row: row - 1, col });
            stack.push({ row: row + 1, col });
            stack.push({ row, col: col - 1 });
            stack.push({ row, col: col + 1 });
        }

        return {
            colorId,
            cells,
            bounds: {
                minRow,
                maxRow,
                minCol,
                maxCol,
                centerRow: Math.floor((minRow + maxRow) / 2),
                centerCol: Math.floor((minCol + maxCol) / 2)
            }
        };
    }

    // Save grid to storage
    private saveGrid(): void {
        const colorGrid: ColorGrid = {
            cells: this.grid,
            backgroundFill: this.backgroundFill,
            lastUpdated: Date.now()
        };

        this.storageService.updateMyColorsSettings({
            colorGrid
        });
    }

    // Helper methods
    getCellColor(row: number, col: number): string {
        const colorId = this.grid[row][col];
        if (colorId === null) {
            if (this.backgroundFill === 'white') return '#d0d0d0'; // Medium gray for better contrast
            if (this.backgroundFill === 'black') return '#1A1A1A';
            return 'transparent';
        }

        const color = this.getColorById(colorId);
        return color ? `#${color.rgb}` : '#CCCCCC';
    }

    shouldShowCellBorder(row: number, col: number): boolean {
        // Only show border if grid is enabled AND cell is empty
        return this.showGrid && this.grid[row][col] === null;
    }

    getColorById(colorId: number): Color | undefined {
        return this.allColors.find(c => c.id === colorId);
    }

    getColorName(colorId: number): string {
        // Check for alias first
        const alias = this.storageService.isColorInAlias(colorId);
        if (alias) {
            return alias.name;
        }

        const color = this.getColorById(colorId);
        return color?.name || `Color ${colorId}`;
    }

    selectColor(colorId: number): void {
        this.selectedColorId = colorId;
    }

    isColorSelected(colorId: number): boolean {
        return this.selectedColorId === colorId;
    }

    // Check if we should show text in a region
    shouldShowText(region: ColorRegion): boolean {
        // Show text for any region, even single cells, preferring main text over overflow
        return region.cells.length >= 1;
    }

    // Calculate text position and size for a region with advanced text fitting
    getRegionTextStyle(region: ColorRegion): any {
        const cellSize = 100 / this.GRID_SIZE; // Percentage size of each cell

        // Check if this is a single cell that should expand
        const isSingleCell = region.cells.length === 1;
        let effectiveRegion = region;

        if (isSingleCell) {
            // Try to expand single cells up to 2 cells in any direction
            const expandedBounds = this.calculateExpandedBounds(region);
            if (expandedBounds) {
                effectiveRegion = {
                    ...region,
                    bounds: {
                        ...expandedBounds,
                        centerRow: Math.floor((expandedBounds.minRow + expandedBounds.maxRow) / 2),
                        centerCol: Math.floor((expandedBounds.minCol + expandedBounds.maxCol) / 2)
                    }
                };
            }
        }

        const width = (effectiveRegion.bounds.maxCol - effectiveRegion.bounds.minCol + 1) * cellSize;
        const height = (effectiveRegion.bounds.maxRow - effectiveRegion.bounds.minRow + 1) * cellSize;

        const colorName = this.getColorName(region.colorId);

        // Check if height > width, if so we'll rotate text
        const shouldRotate = height > width;

        // Always calculate text metrics as if horizontal
        // For vertical regions, we pretend they're horizontal for calculation
        const metricsWidth = shouldRotate ? height : width;
        const metricsHeight = shouldRotate ? width : height;

        // Create a pseudo-region with swapped dimensions for rotated text
        const metricsRegion = shouldRotate ? {
            ...effectiveRegion,
            bounds: {
                minRow: effectiveRegion.bounds.minCol,
                maxRow: effectiveRegion.bounds.maxCol,
                minCol: effectiveRegion.bounds.minRow,
                maxCol: effectiveRegion.bounds.maxRow,
                centerRow: effectiveRegion.bounds.centerCol,
                centerCol: effectiveRegion.bounds.centerRow
            }
        } : effectiveRegion;

        const textMetrics = this.calculateOptimalTextDisplay(colorName, metricsWidth, metricsHeight, metricsRegion);

        // Now apply rotation if needed
        if (shouldRotate) {
            textMetrics.transform = 'rotate(-90deg)';
            textMetrics.whiteSpace = 'nowrap'; // Prevent word breaking when rotated
        }

        // Calculate position using the effective region
        const left = effectiveRegion.bounds.minCol * cellSize;
        const top = effectiveRegion.bounds.minRow * cellSize;

        return {
            position: 'absolute',
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
            fontSize: `${textMetrics.fontSize}vmin`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            color: this.getContrastColor(region.colorId),
            fontWeight: textMetrics.fontWeight,
            textAlign: 'center',
            lineHeight: textMetrics.lineHeight,
            whiteSpace: textMetrics.whiteSpace,
            wordBreak: 'normal', // Avoid breaking words
            hyphens: 'none', // Disable hyphenation
            transform: textMetrics.transform || '',
            transformOrigin: 'center center',
            overflow: 'visible',
            zIndex: 10,
            boxSizing: 'border-box',
        };
    }

    // Advanced text fitting algorithm
    private calculateOptimalTextDisplay(text: string, widthPercent: number, heightPercent: number, region: ColorRegion): any {
        const aspectRatio = widthPercent / heightPercent;
        const area = widthPercent * heightPercent;
        const textLength = text.length;

        // Base font size calculation - conservative to avoid word breaks
        let fontSize = Math.min(widthPercent, heightPercent) * 0.25;

        // More conservative scaling for long text - prioritize no word breaks
        if (textLength > 6) {
            fontSize *= 0.85;
        }
        if (textLength > 8) {
            fontSize *= 0.75;
        }
        if (textLength > 10) {
            fontSize *= 0.65;
        }
        if (textLength > 12) {
            fontSize *= 0.6;
        }
        if (textLength > 15) {
            fontSize *= 0.5;
        }
        if (textLength > 18) {
            fontSize *= 0.45;
        }

        // Very small minimum but still readable
        fontSize = Math.max(fontSize, 0.8); // Much smaller minimum - prioritize fitting
        fontSize = Math.min(fontSize, 4);   // Maximum size to prevent oversizing

        let result = {
            fontSize: fontSize,
            fontWeight: 'bold',
            lineHeight: '0.9',
            whiteSpace: 'nowrap',
            wordBreak: 'normal',
            transform: '',
            overflow: 'hidden'
        };


        // For very wide regions, try horizontal layout first
        if (aspectRatio > 3) {
            result.whiteSpace = 'nowrap';
            result.fontSize = Math.min(fontSize, heightPercent * 0.8);
        }
        // For very tall regions, allow more wrapping
        else if (aspectRatio < 0.5) {
            result.lineHeight = '0.8';
            result.fontSize = Math.min(fontSize, widthPercent * 0.5);
        }
        // For square-ish regions
        else {
            // Better estimation for line count based on character width
            const estimatedCharsPerLine = Math.floor(widthPercent * 3); // More chars per line estimate
            const estimatedLines = Math.ceil(textLength / estimatedCharsPerLine);
            if (estimatedLines > 1) {
                result.fontSize = Math.min(fontSize, heightPercent / estimatedLines * 1.0);
                result.lineHeight = '0.85';
            }
        }

        // Single cell special handling
        if (region.cells.length === 1) {
            if (textLength > 5) {
                // For single cells, just adjust font size
                const maxFontForWidth = widthPercent * 0.15;
                const maxFontForHeight = heightPercent * 0.25;
                result.fontSize = Math.min(result.fontSize, maxFontForWidth, maxFontForHeight);
                result.lineHeight = '0.8';
            }
        }

        // For very long text in small areas, reduce font weight and be extremely aggressive
        if (textLength > 10 && area < 50) {
            result.fontWeight = '600';
            result.fontSize *= 0.8;
        }

        // Extra aggressive for really long names
        if (textLength > 15) {
            result.fontSize *= 0.7;
            result.lineHeight = '0.75';
            result.fontWeight = '500'; // Even lighter weight
        }

        return result;
    }

    // Enhanced method to handle text overflow into adjacent empty cells
    getRegionTextOverflowStyle(region: ColorRegion): any {
        const colorName = this.getColorName(region.colorId);
        if (colorName.length <= 10) {
            return null; // No overflow needed for short names
        }

        const cellSize = 100 / this.GRID_SIZE;

        // Check for empty cells adjacent to this region for potential overflow
        const expandedBounds = this.calculateExpandedBounds(region);

        if (expandedBounds) {
            const width = (expandedBounds.maxCol - expandedBounds.minCol + 1) * cellSize;
            const height = (expandedBounds.maxRow - expandedBounds.minRow + 1) * cellSize;

            // Calculate position
            const left = expandedBounds.minCol * cellSize;
            const top = expandedBounds.minRow * cellSize;

            // Check if we should rotate (height > width)
            const shouldRotate = height > width;

            // Calculate text layout as if horizontal
            const layoutWidth = shouldRotate ? height : width;
            const layoutHeight = shouldRotate ? width : height;

            // Use same font sizing calculation as horizontal text
            let fontSize = Math.min(layoutWidth, layoutHeight) * 0.3;

            // Apply rotation after calculating everything
            let transform = shouldRotate ? 'rotate(-90deg)' : '';
            let whiteSpace = shouldRotate ? 'nowrap' : 'normal';

            return {
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                fontSize: `${fontSize}vmin`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                color: this.getContrastColor(region.colorId),
                fontWeight: '600',
                textAlign: 'center',
                padding: '2px',
                backgroundColor: 'transparent',
                borderRadius: '2px',
                zIndex: 15,
                whiteSpace: whiteSpace,
                wordBreak: 'normal',
                lineHeight: '1.1',
                transform: transform,
                transformOrigin: 'center center',
                overflow: 'visible',
                boxSizing: 'border-box'
            };
        }

        return null;
    }

    // Calculate expanded bounds for text overflow - expand up to 2 cells in any direction
    private calculateExpandedBounds(region: ColorRegion): any {
        const originalBounds = region.bounds;

        // Only try to expand single cells
        if (region.cells.length !== 1) {
            return null;
        }

        let expandedBounds = { ...originalBounds };
        let totalExpansion = 0;

        // Try expanding in each direction, up to 2 cells total
        // Priority: up, down, right, left

        // Try expanding upward first (up to 2 cells)
        let upwardExpansion = 0;
        for (let row = originalBounds.minRow - 1; row >= Math.max(0, originalBounds.minRow - 2) && totalExpansion < 2; row--) {
            if (this.grid[row][originalBounds.minCol] === null) {
                expandedBounds.minRow = row;
                upwardExpansion++;
                totalExpansion++;
            } else {
                break;
            }
        }

        // Try expanding downward if we haven't reached 2 cells yet
        if (totalExpansion < 2) {
            for (let row = originalBounds.maxRow + 1; row < Math.min(this.GRID_SIZE, originalBounds.maxRow + 3) && totalExpansion < 2; row++) {
                if (this.grid[row][originalBounds.minCol] === null) {
                    expandedBounds.maxRow = row;
                    totalExpansion++;
                } else {
                    break;
                }
            }
        }

        // If we couldn't expand vertically, try horizontally
        if (totalExpansion === 0) {
            // Try right
            for (let col = originalBounds.maxCol + 1; col < Math.min(this.GRID_SIZE, originalBounds.maxCol + 3) && totalExpansion < 2; col++) {
                if (this.grid[originalBounds.minRow][col] === null) {
                    expandedBounds.maxCol = col;
                    totalExpansion++;
                } else {
                    break;
                }
            }

            // Try left if still need expansion
            if (totalExpansion < 2) {
                for (let col = originalBounds.minCol - 1; col >= Math.max(0, originalBounds.minCol - 3) && totalExpansion < 2; col--) {
                    if (this.grid[originalBounds.minRow][col] === null) {
                        expandedBounds.minCol = col;
                        totalExpansion++;
                    } else {
                        break;
                    }
                }
            }
        }

        return totalExpansion > 0 ? expandedBounds : null;
    }

    // Check if a region needs overflow text display
    needsOverflowText(region: ColorRegion): boolean {
        // We now handle all text expansion in the main text style
        // This prevents duplicate text rendering
        return false;
    }

    // Get contrasting color for text
    private getContrastColor(colorId: number): string {
        const color = this.getColorById(colorId);
        if (!color) return '#000000';

        // Convert hex to RGB
        const r = parseInt(color.rgb.substr(0, 2), 16);
        const g = parseInt(color.rgb.substr(2, 2), 16);
        const b = parseInt(color.rgb.substr(4, 2), 16);

        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    // Print functionality
    print(): void {
        // Get the grid container element
        const gridContainer = document.querySelector('.grid-container') as HTMLElement;
        const regionLabels = document.querySelector('.region-labels') as HTMLElement;

        if (!gridContainer || !regionLabels) {
            console.error('Grid container or region labels not found');
            return;
        }

        // Create a new window for printing (maximized or large size)
        const screenWidth = window.screen.availWidth || 1200;
        const screenHeight = window.screen.availHeight || 900;
        const windowFeatures = `width=${screenWidth},height=${screenHeight},top=0,left=0,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`;

        const printWindow = window.open('', '_blank', windowFeatures);
        if (!printWindow) {
            console.error('Could not open print window');
            return;
        }

        // Try to maximize the window (some browsers support this)
        try {
            printWindow.moveTo(0, 0);
            printWindow.resizeTo(screenWidth, screenHeight);
        } catch (e) {
            console.log('Could not maximize print window, but it should still be large enough');
        }

        // Clone the grid container and region labels
        const gridClone = gridContainer.cloneNode(true) as HTMLElement;
        const labelsClone = regionLabels.cloneNode(true) as HTMLElement;

        // Create the print document
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Color Grid Layout</title>
                <style>
                    @page {
                        size: letter;
                        margin: 0.5in;
                    }

                    body {
                        margin: 0;
                        padding: 20px;
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: white;
                    }

                    .print-container {
                        position: relative;
                        width: 7.5in;
                        height: 7.5in;
                        border: 2px solid #000;
                        background: white;
                        page-break-inside: avoid;
                    }

                    .grid-container {
                        width: 100%;
                        height: 100%;
                        display: block;
                        position: relative;
                        border: none;
                        box-shadow: none;
                    }

                    .grid-row {
                        display: flex;
                        height: calc(100% / 16);
                    }

                    .grid-cell {
                        width: calc(100% / 16);
                        height: 100%;
                        box-sizing: border-box;
                        border: 0.5px solid transparent;
                        position: relative;
                    }

                    .grid-cell.show-border {
                        border-color: #ccc;
                    }

                    .region-labels {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        pointer-events: none;
                    }

                    .region-label,
                    .region-label-overflow {
                        font-size: 10pt;
                        /* text-shadow removed to prevent black boxes in print */
                        line-height: 1;
                        position: absolute;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                </style>
            </head>
            <body>
                <div class="print-container">
                    ${gridClone.outerHTML}
                    ${labelsClone.outerHTML}
                </div>
            </body>
            </html>
        `;

        // Write content to print window
        printWindow.document.write(printContent);
        printWindow.document.close();

        // Wait for content to load, then print
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        };
    }

    // Track by functions for performance
    trackByRow(index: number): number {
        return index;
    }

    trackByCol(index: number): number {
        return index;
    }

    trackByColorId(index: number, color: Color): number {
        return color.id;
    }

    trackByRegion(index: number, region: ColorRegion): number {
        return region.colorId;
    }
}

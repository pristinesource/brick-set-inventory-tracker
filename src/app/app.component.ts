import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DataService } from './services/data.service';
import { ExportService } from './services/export.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Brick Set Inventory Tracker';
  isLoading = true;
  isMobileMenuOpen = false;

  constructor(
    private dataService: DataService,
    private exportService: ExportService
  ) {
  }

  ngOnInit(): void {
    // Subscribe to data loading status
    this.dataService.isDataLoaded().subscribe({
      next: (loaded: boolean) => {
        if (loaded) {
          this.isLoading = false;
        }
      },
      error: (err: any) => {
        console.error('Failed to load data:', err);
        this.isLoading = false;
      }
    });
  }

  /**
   * Toggle mobile menu visibility
   */
  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  /**
   * Close mobile menu (useful when navigating)
   */
  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  /**
   * Quick download method for the header button
   */
  quickDownload(): void {
    try {
      this.exportService.exportData();
    } catch (error) {
      console.error('Error during quick download:', error);
      // Could add a toast notification here in the future
    }
  }
}

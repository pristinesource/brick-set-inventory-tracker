import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService, LoadingProgress } from '../../services/loading.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="loadingState.isLoading"
         class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
         style="backdrop-filter: blur(4px);">

      <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 class="text-xl font-semibold text-gray-800 mb-2">Loading Data</h2>
          <p class="text-gray-600 text-sm">
            Please wait while we prepare your building set inventory data...
          </p>
        </div>

        <!-- Progress Info -->
        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium text-gray-700">{{ loadingState.phase }}</span>
            <span class="text-sm text-gray-500">{{ loadingState.percentage }}%</span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              class="h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
              [style.width.%]="loadingState.percentage">
            </div>
          </div>

          <!-- Record Counter -->
          <div class="flex justify-between items-center mt-2 text-xs text-gray-500">
            <span *ngIf="loadingState.total > 0">{{ loadingState.current | number }} of {{ loadingState.total | number }} records</span>
            <span *ngIf="loadingState.total === 0">&nbsp;</span>
            <span *ngIf="loadingState.percentage === 100" class="text-green-600 font-medium">Almost done!</span>
          </div>
        </div>

        <!-- Additional Message -->
        <div *ngIf="loadingState.message"
             class="text-center text-sm text-gray-600 bg-gray-50 rounded p-3">
          {{ loadingState.message }}
        </div>

        <!-- Large Dataset Notice -->
        <div *ngIf="showLargeDatasetNotice"
             class="mt-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-blue-700">
                <strong>First-time setup:</strong> We're organizing hundreds of thousands of building set parts and sets for optimal performance. This only happens once!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .z-50 {
      z-index: 50;
    }
  `]
})
export class LoadingOverlayComponent implements OnInit, OnDestroy {
  loadingState: LoadingProgress = {
    isLoading: false,
    phase: '',
    percentage: 0,
    current: 0,
    total: 0
  };

  showLargeDatasetNotice = false;
  private subscription?: Subscription;

  constructor(private loadingService: LoadingService) {}

  ngOnInit(): void {
    this.subscription = this.loadingService.loading$.subscribe(state => {
      this.loadingState = state;

      // Show large dataset notice for long operations
      if (state.isLoading && !this.showLargeDatasetNotice) {
        this.showLargeDatasetNotice = true;
      } else if (!state.isLoading) {
        this.showLargeDatasetNotice = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}

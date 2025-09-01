import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { BackgroundLoadingProgress, BackgroundLoadingService } from '../../services/background-loading.service';

@Component({
    selector: 'app-footer-progress',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div *ngIf="loadingState.isLoading"
         [@slideUp]
         class="fixed bottom-0 left-0 right-0 bg-gray-800 text-white shadow-lg z-40 border-t border-gray-700">
      <div class="container mx-auto px-4 py-3">
        <!-- Progress Info Row -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-3">
            <!-- Spinner -->
            <div class="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-white"></div>

            <!-- Status Text -->
            <div>
              <p class="text-sm font-medium">{{ loadingState.phase }}</p>
              <p class="text-xs text-gray-400" *ngIf="loadingState.message">{{ loadingState.message }}</p>
            </div>
          </div>

          <!-- Progress Percentage and Close Button -->
          <div class="flex items-center space-x-4">
            <span class="text-sm font-medium">{{ loadingState.percentage }}%</span>
            <button
              (click)="dismissProgress()"
              class="text-gray-400 hover:text-white transition-colors p-1"
              title="Dismiss (continue in background)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            class="h-2 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 ease-out"
            [style.width.%]="loadingState.percentage">
          </div>
        </div>

        <!-- Record Counter -->
        <div class="flex justify-between items-center mt-1 text-xs text-gray-400">
          <span *ngIf="loadingState.total > 0">
            Processing {{ loadingState.current | number }} of {{ loadingState.total | number }} items
          </span>
          <span *ngIf="loadingState.total === 0">&nbsp;</span>
          <span *ngIf="loadingState.percentage === 100" class="text-green-400 font-medium">
            Complete! 🎉
          </span>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .z-40 {
      z-index: 40;
    }
  `],
    animations: [
        trigger('slideUp', [
            transition(':enter', [
                style({ transform: 'translateY(100%)' }),
                animate('300ms ease-out', style({ transform: 'translateY(0%)' }))
            ]),
            transition(':leave', [
                animate('300ms ease-in', style({ transform: 'translateY(100%)' }))
            ])
        ])
    ]
})
export class FooterProgressComponent implements OnInit, OnDestroy {
    loadingState: BackgroundLoadingProgress = {
        isLoading: false,
        phase: '',
        percentage: 0,
        current: 0,
        total: 0
    };

    private subscription?: Subscription;

    constructor(private backgroundLoadingService: BackgroundLoadingService) { }

    ngOnInit(): void {
        this.subscription = this.backgroundLoadingService.loading$.subscribe(state => {
            this.loadingState = state;

            // Safety mechanism: auto-hide after 5 minutes to prevent getting stuck
            if (state.isLoading) {
                setTimeout(() => {
                    if (this.loadingState.isLoading) {
                        console.warn('Background loading took too long, auto-hiding progress indicator');
                        this.backgroundLoadingService.hideLoading();
                    }
                }, 5 * 60 * 1000); // 5 minutes
            }
        });
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }

    dismissProgress(): void {
        this.backgroundLoadingService.hideLoading();
    }
}

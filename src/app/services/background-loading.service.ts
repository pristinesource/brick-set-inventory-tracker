import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface BackgroundLoadingProgress {
    isLoading: boolean;
    phase: string;
    percentage: number;
    current: number;
    total: number;
    message?: string;
}

@Injectable({
    providedIn: 'root'
})
export class BackgroundLoadingService {
    private loadingSubject = new BehaviorSubject<BackgroundLoadingProgress>({
        isLoading: false,
        phase: '',
        percentage: 0,
        current: 0,
        total: 0
    });

    public loading$ = this.loadingSubject.asObservable();

    /**
     * Start background loading with initial progress
     */
    startLoading(phase: string, total: number = 100): void {
        this.loadingSubject.next({
            isLoading: true,
            phase,
            percentage: 0,
            current: 0,
            total,
            message: 'Optimizing database for faster access...'
        });
    }

    /**
     * Update background loading progress
     */
    updateProgress(progress: Partial<BackgroundLoadingProgress>): void {
        const current = this.loadingSubject.value;

        // Calculate percentage if current and total are provided
        let percentage = progress.percentage;
        if (progress.current !== undefined && progress.total !== undefined && progress.total > 0) {
            percentage = Math.round((progress.current / progress.total) * 100);
        }

        this.loadingSubject.next({
            ...current,
            ...progress,
            percentage: percentage || current.percentage,
            isLoading: true
        });
    }

    /**
     * Complete background loading
     */
    completeLoading(message?: string): void {
        const current = this.loadingSubject.value;
        this.loadingSubject.next({
            ...current,
            percentage: 100,
            message: message || 'Database optimization complete!',
            isLoading: true // Keep showing for a moment
        });

        // Hide after 2 seconds
        setTimeout(() => {
            this.hideLoading();
        }, 2000);
    }

    /**
     * Hide background loading indicator
     */
    hideLoading(): void {
        this.loadingSubject.next({
            isLoading: false,
            phase: '',
            percentage: 0,
            current: 0,
            total: 0
        });
    }

    /**
     * Get current loading state
     */
    get isLoading(): boolean {
        return this.loadingSubject.value.isLoading;
    }

    /**
     * Get current loading state as observable
     */
    getLoadingState(): Observable<BackgroundLoadingProgress> {
        return this.loading$;
    }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface LoadingProgress {
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
export class LoadingService {
  private loadingSubject = new BehaviorSubject<LoadingProgress>({
    isLoading: false,
    phase: '',
    percentage: 0,
    current: 0,
    total: 0
  });

  public loading$ = this.loadingSubject.asObservable();

  /**
   * Show loading overlay with initial progress
   */
  showLoading(phase: string, total: number = 100): void {
    this.loadingSubject.next({
      isLoading: true,
      phase,
      percentage: 0,
      current: 0,
      total
    });
  }

  /**
   * Update loading progress
   */
  updateProgress(progress: Partial<LoadingProgress>): void {
    const current = this.loadingSubject.value;
    this.loadingSubject.next({
      ...current,
      ...progress,
      isLoading: true
    });
  }

  /**
   * Hide loading overlay
   */
  hideLoading(): void {
    this.loadingSubject.next({
      isLoading: false,
      phase: '',
      percentage: 100,
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
}

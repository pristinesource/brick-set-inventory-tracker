import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GlobalSettings } from '../../models/models';
import { BrickognizeResult, BrickognizeService } from '../../services/brickognize.service';
import { StorageService } from '../../services/storage.service';

@Component({
    selector: 'app-camera-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
             (click)="onBackdropClick($event)">
            <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
                 (click)="$event.stopPropagation()">
                <!-- Header -->
                <div class="bg-gray-100 px-6 py-4 border-b">
                    <div class="flex items-center justify-between">
                        <h2 class="text-xl font-semibold text-gray-800">Identify Parts with Camera</h2>
                        <button (click)="close()"
                                class="text-gray-400 hover:text-gray-600 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6">
                    <!-- Camera Selection -->
                    <div class="mb-4" *ngIf="availableCameras.length > 1">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Select Camera
                        </label>
                        <select [(ngModel)]="selectedCameraId"
                                (change)="onCameraChange()"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option [value]="null">Select a camera...</option>
                            <option *ngFor="let camera of availableCameras" [value]="camera.deviceId">
                                {{ camera.label || 'Camera ' + (availableCameras.indexOf(camera) + 1) }}
                            </option>
                        </select>
                    </div>

                    <!-- Camera View -->
                    <div class="relative bg-black rounded-lg overflow-hidden" style="aspect-ratio: 4/3;">
                        <video #videoElement
                               id="videoElement"
                               class="w-full h-full object-contain"
                               [class.hidden]="!cameraActive || capturedImage"
                               autoplay
                               playsinline></video>

                        <canvas #canvasElement
                                id="canvasElement"
                                class="w-full h-full object-contain"
                                [class.hidden]="!capturedImage"></canvas>

                        <!-- Loading/Error States -->
                        <div *ngIf="!cameraActive && !capturedImage && !error"
                             class="absolute inset-0 flex items-center justify-center text-white">
                            <div class="text-center">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                                <p>Initializing camera...</p>
                            </div>
                        </div>

                        <div *ngIf="error"
                             class="absolute inset-0 flex items-center justify-center text-white">
                            <div class="text-center p-4">
                                <svg class="w-12 h-12 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                </svg>
                                <p class="text-sm">{{ error }}</p>
                                <button *ngIf="availableCameras.length > 0"
                                        (click)="retryCamera()"
                                        class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                                    Try Again
                                </button>
                            </div>
                        </div>

                        <!-- Processing Overlay -->
                        <div *ngIf="processing"
                             class="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center text-white">
                            <div class="text-center">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                                <p>Identifying parts...</p>
                            </div>
                        </div>
                    </div>


                    <!-- Instructions -->
                    <div class="mt-4 text-sm text-gray-600">
                        <p *ngIf="!capturedImage">Position LEGO parts clearly in the camera view and click "Capture" to identify them.</p>
                        <p *ngIf="capturedImage && !results">Click "Identify" to search for these parts or "Retake" to try again.</p>
                    </div>
                </div>

                <!-- Footer -->
                <div class="bg-gray-50 px-6 py-4 border-t flex justify-between">
                    <button (click)="close()"
                            class="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                        Cancel
                    </button>

                    <div class="space-x-3">
                        <button *ngIf="capturedImage && !results"
                                (click)="retakePhoto()"
                                [disabled]="processing"
                                class="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                            Retake
                        </button>

                        <button *ngIf="!capturedImage"
                                (click)="captureImage()"
                                [disabled]="!cameraActive"
                                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
                            Capture
                        </button>

                        <button *ngIf="capturedImage && !results"
                                (click)="identifyParts()"
                                [disabled]="processing"
                                class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
                            Identify
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: []
})
export class CameraModalComponent implements OnInit, OnDestroy {
    @Output() searchQueryEmitter = new EventEmitter<string>();
    @Output() closed = new EventEmitter<void>();

    availableCameras: MediaDeviceInfo[] = [];
    selectedCameraId: string | null = null;
    cameraActive = false;
    capturedImage = false;
    processing = false;
    error: string | null = null;
    results: BrickognizeResult | null = null;
    searchQuery: string = '';

    private videoElement: HTMLVideoElement | null = null;
    private canvasElement: HTMLCanvasElement | null = null;
    private mediaStream: MediaStream | null = null;
    private globalSettings: GlobalSettings = {
        imagePreviewSize: '1x',
        includeSparePartsInProgress: true,
        alwaysTrackLoosePartsByColor: false,
        lastSelectedCameraId: null
    };

    constructor(
        private brickognizeService: BrickognizeService,
        private storageService: StorageService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadSettings();
        this.initializeCamera();
    }

    ngOnDestroy(): void {
        this.stopCamera();
    }

    ngAfterViewInit(): void {
        // Get video and canvas elements after view initialization
        setTimeout(() => {
            this.videoElement = document.querySelector('#videoElement');
            this.canvasElement = document.querySelector('#canvasElement');
        });
    }

    private async loadSettings(): Promise<void> {
        const appState = await new Promise<any>((resolve) => {
            this.storageService.getState().subscribe(state => resolve(state));
        });
        if (appState && appState.globalSettings) {
            this.globalSettings = appState.globalSettings;
            this.selectedCameraId = this.globalSettings.lastSelectedCameraId || null;
        }
    }

    private async saveSelectedCamera(): Promise<void> {
        this.globalSettings.lastSelectedCameraId = this.selectedCameraId;
        await this.storageService.updateGlobalSettings(this.globalSettings);
    }

    private async initializeCamera(): Promise<void> {
        try {
            // Request camera permissions first
            await navigator.mediaDevices.getUserMedia({ video: true });

            // Get available cameras
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');

            if (this.availableCameras.length === 0) {
                throw new Error('No cameras found on this device');
            }

            // If we have a saved camera preference, check if it's still available
            if (this.selectedCameraId) {
                const savedCameraExists = this.availableCameras.some(
                    camera => camera.deviceId === this.selectedCameraId
                );
                if (!savedCameraExists) {
                    this.selectedCameraId = null;
                }
            }

            // If no camera selected, use the first available
            if (!this.selectedCameraId) {
                this.selectedCameraId = this.availableCameras[0].deviceId;
            }

            await this.startCamera();
        } catch (error: any) {
            console.error('Camera initialization error:', error);
            if (error.name === 'NotAllowedError') {
                this.error = 'Camera access denied. Please allow camera access and try again.';
            } else if (error.name === 'NotFoundError') {
                this.error = 'No camera found on this device.';
            } else {
                this.error = 'Failed to access camera. Please check your device settings.';
            }
        }
    }

    private async startCamera(): Promise<void> {
        if (!this.selectedCameraId || !this.videoElement) return;

        try {
            this.stopCamera();

            const constraints: MediaStreamConstraints = {
                video: {
                    deviceId: { exact: this.selectedCameraId },
                    width: { ideal: 1280 },
                    height: { ideal: 960 }
                }
            };

            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.mediaStream;
            this.cameraActive = true;
            this.error = null;

            await this.saveSelectedCamera();
        } catch (error: any) {
            console.error('Failed to start camera:', error);
            this.error = 'Failed to start selected camera. Please try another camera.';
            this.cameraActive = false;
        }
    }

    private stopCamera(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        this.cameraActive = false;
    }

    async onCameraChange(): Promise<void> {
        if (this.selectedCameraId) {
            await this.startCamera();
        }
    }

    async retryCamera(): Promise<void> {
        this.error = null;
        await this.initializeCamera();
    }

    captureImage(): void {
        if (!this.videoElement || !this.canvasElement) return;

        const video = this.videoElement;
        const canvas = this.canvasElement;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0);

        this.capturedImage = true;
        this.stopCamera();
    }

    retakePhoto(): void {
        this.capturedImage = false;
        this.results = null;
        this.searchQuery = '';
        this.startCamera();
    }

    async identifyParts(): Promise<void> {
        if (!this.canvasElement) return;

        this.processing = true;
        this.error = null;

        try {
            // Convert canvas to blob
            const blob = await new Promise<Blob>((resolve, reject) => {
                this.canvasElement!.toBlob(
                    blob => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create image blob'));
                        }
                    },
                    'image/jpeg',
                    0.8
                );
            });

            // Send to Brickognize API
            console.log('Sending image to Brickognize API...');
            this.results = await new Promise((resolve, reject) => {
                this.brickognizeService.recognizeImage(blob).subscribe({
                    next: (result) => {
                        console.log('Brickognize API response:', result);
                        resolve(result);
                    },
                    error: (error) => {
                        console.error('Brickognize API error:', error);
                        reject(error);
                    }
                });
            });

            console.log('Results received:', this.results);
            if (this.results && this.results.items.length > 0) {
                this.searchQuery = this.brickognizeService.convertResultsToSearchQuery(this.results);
                console.log('Search query generated:', this.searchQuery);

                // Automatically use the results if we found parts
                if (this.searchQuery) {
                    this.useResults();
                }
            }
        } catch (error: any) {
            console.error('Failed to identify parts:', error);
            this.error = error.message || 'Failed to identify parts. Please try again.';
        } finally {
            this.processing = false;
            this.cdr.detectChanges(); // Force UI update
        }
    }

    getResultsDescription(): string {
        if (!this.results) return '';
        return this.brickognizeService.getResultsDescription(this.results);
    }

    useResults(): void {
        if (this.searchQuery) {
            this.searchQueryEmitter.emit(this.searchQuery);
            this.close();
        }
    }

    onBackdropClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.close();
        }
    }

    close(): void {
        this.stopCamera();
        this.closed.emit();
    }
}

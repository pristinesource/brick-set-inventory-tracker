import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent) },
  { path: 'sets', loadComponent: () => import('./components/sets/sets.component').then(m => m.SetsComponent) },
  { path: 'inventory/:id', loadComponent: () => import('./components/inventory-detail/inventory-detail.component').then(m => m.InventoryDetailComponent) },
  { path: 'missing-parts', loadComponent: () => import('./components/inventory-detail/inventory-detail.component').then(m => m.InventoryDetailComponent) },
  { path: 'settings', loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent) },
  { path: '**', redirectTo: 'home' }
];

import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'home', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  {
    path: 'account',
    loadComponent: () => import('./features/account/account').then((m) => m.Account),
  },
  {
    path: 'categories',
    loadComponent: () => import('./features/categories/categories').then((m) => m.Categories),
  },
  { path: 'stats', loadComponent: () => import('./features/stats/stats').then((m) => m.Stats) },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
];

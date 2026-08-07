import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'home', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
  {
    path: 'account/:id',
    loadComponent: () => import('./features/account/account').then((m) => m.Account),
  },
  {
    path: 'stats/:id',
    loadComponent: () => import('./features/stats/stats').then((m) => m.Stats),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'categories' },
      {
        path: 'categories',
        loadComponent: () => import('./features/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'affichage',
        loadComponent: () =>
          import('./features/settings/affichage/affichage').then((m) => m.Affichage),
      },
      {
        path: 'stockage',
        loadComponent: () =>
          import('./features/settings/stockage/stockage').then((m) => m.Stockage),
      },
    ],
  },
];

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
        loadComponent: () =>
          import('./features/settings/categories/categories').then((m) => m.Categories),
      },
      {
        path: 'display-format',
        loadComponent: () =>
          import('./features/settings/display-format/display-format').then((m) => m.DisplayFormat),
      },
      {
        path: 'storage',
        loadComponent: () => import('./features/settings/storage/storage').then((m) => m.Storage),
      },
    ],
  },
];

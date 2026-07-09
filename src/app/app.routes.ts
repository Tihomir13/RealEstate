import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'gradove',
    loadComponent: () => import('./features/cities/cities.page').then((m) => m.CitiesPage),
  },
  {
    path: 'grad/:slug',
    loadComponent: () =>
      import('./features/city-detail/city-detail.page').then((m) => m.CityDetailPage),
  },
  {
    path: 'sravnenie',
    loadComponent: () => import('./features/compare/compare.page').then((m) => m.ComparePage),
  },
  {
    path: 'obiavi',
    loadComponent: () => import('./features/listings/listings.page').then((m) => m.ListingsPage),
  },
  {
    path: 'metodologia',
    loadComponent: () =>
      import('./features/methodology/methodology.page').then((m) => m.MethodologyPage),
  },
  { path: '**', redirectTo: '' },
];

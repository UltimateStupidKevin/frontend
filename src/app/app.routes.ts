import { Routes } from '@angular/router';
import { AuthGuard } from './core/auth/auth.guard';

/**
 * Routen:
 * - /login & /register sind öffentlich.
 * - /games/* ist geschützt (AuthGuard).
 * - Standard-Redirect auf /games/open.
 *
 * Wichtig: keine .ts-Endungen in den dynamic imports!
 */
export const routes: Routes = [
  // Öffentlich
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register.page').then((m) => m.RegisterPage),
  },

  // Geschützt
  {
    path: 'games/open',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/games/open-games.page').then((m) => m.OpenGamesPage),
  },
  {
    path: 'games/create',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/games/create-game.page').then((m) => m.CreateGamePage),
  },
  {
    path: 'games/:id',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/games/game-detail.page').then((m) => m.GameDetailPage),
  },

  // Default & Fallback
  { path: '', pathMatch: 'full', redirectTo: '/games/open' },
  { path: '**', redirectTo: '/games/open' },
];

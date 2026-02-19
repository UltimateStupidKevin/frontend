import { Routes } from '@angular/router';
import { AuthGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  // Öffentlich
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },

  // Geschützt
  {
    path: 'games/open',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/games/open-games.page').then((m) => m.OpenGamesPage),
  },
  {
    path: 'games/create',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/games/create-game.page').then((m) => m.CreateGamePage),
  },
  {
    path: 'games/:id',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/games/game-detail.page').then((m) => m.GameDetailPage),
  },
  {
    path: 'tactics',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/tactics/tactics.component').then((m) => m.TacticsComponent),
  },
  {
    path: 'analysis',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/analysis/analysis.page').then((m) => m.AnalysisPage),
  },
  {
    path: 'master-games',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/master-games/master-games.page').then((m) => m.MasterGamesPage),
  },
  {
    path: 'master-games/:id',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./features/master-games/master-game-detail.page').then((m) => m.MasterGameDetailPage),
  },

  // Default & Fallback
  { path: '', pathMatch: 'full', redirectTo: '/games/open' },
  { path: '**', redirectTo: '/games/open' },
];

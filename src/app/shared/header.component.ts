import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-header',
  imports: [CommonModule, RouterLink],
  template: `
    <header class="wrap">
      <nav class="left">
        <a routerLink="/games/open" class="brand">♟ Chess</a>
        <a routerLink="/games/open">Open Games</a>
        <a routerLink="/games/create">Create Game</a>
        <a routerLink="/tactics">Tactics</a>
        <a routerLink="/analysis">Analysis</a>
      </nav>

      <div class="right" *ngIf="auth.isLoggedIn(); else authLinks">
        <span>Hallo, <strong>{{ auth.user()?.username }}</strong>!</span>
        <button type="button" (click)="onLogout()">Logout</button>
      </div>

      <ng-template #authLinks>
        <nav class="right">
          <a routerLink="/login">Login</a>
          <a routerLink="/register">Register</a>
        </nav>
      </ng-template>
    </header>
  `,
  styles: [`
    .wrap { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:1px solid #ddd; }
    .brand { font-weight:700; margin-right:12px; }
    nav.left a { margin-right:10px; }
    nav.right a { margin-left:10px; }
    .right { display:flex; gap:12px; align-items:center; }
    button { padding:6px 10px; }
  `]
})
export class HeaderComponent {
  auth = inject(AuthService);

  onLogout() {
    this.auth.logout();
  }
}

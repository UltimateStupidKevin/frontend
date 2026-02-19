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
      <div class="left">
        <div class="brand">♟ Chess</div>

        <nav class="nav" *ngIf="auth.user() as u">
          <a routerLink="/games/open">Open Games</a>
          <a routerLink="/games/create">Create Game</a>
          <a routerLink="/master-games">Master Games</a>
          <a routerLink="/tactics">Tactics</a>
          <a routerLink="/analysis">Analysis</a>
        </nav>
      </div>

      <div class="right" *ngIf="auth.user() as u; else loggedOut">
        <div class="hello">Hallo, {{ u.username }}!</div>
        <button (click)="onLogout()">Logout</button>
      </div>

      <ng-template #loggedOut>
        <nav class="nav">
          <a routerLink="/login">Login</a>
          <a routerLink="/register">Register</a>
        </nav>
      </ng-template>
    </header>
  `,
  styles: [
    `
      .wrap {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid #ddd;
        gap: 12px;
      }

      .left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .brand {
        font-weight: 800;
        margin-right: 6px;
        white-space: nowrap;
      }

      .nav a {
        margin-right: 10px;
        text-decoration: none;
      }

      .right {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .hello {
        opacity: 0.9;
        font-weight: 700;
      }

      button {
        padding: 6px 10px;
      }
    `,
  ],
})
export class HeaderComponent {
  auth = inject(AuthService);

  onLogout() {
    this.auth.logout();
  }
}

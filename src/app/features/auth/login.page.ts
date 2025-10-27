import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Login</h1>
    <form (ngSubmit)="onSubmit()" class="form">
      <label>Email
        <input [(ngModel)]="email" name="email" type="email" required />
      </label>
      <label>Password
        <input [(ngModel)]="password" name="password" type="password" required />
      </label>
      <button type="submit" [disabled]="loading()">Login</button>
      <p class="error" *ngIf="error()">{{ error() }}</p>
    </form>
  `,
  styles: [`
    .form { display: grid; gap: 12px; max-width: 360px; }
    .error { color: #c00; }
    button { padding: 8px 12px; }
    input { width: 100%; padding: 8px; }
  `]
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  async onSubmit() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigateByUrl('/games/open');
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Login fehlgeschlagen.');
    } finally {
      this.loading.set(false);
    }
  }
}

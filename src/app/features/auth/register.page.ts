import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-register',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Register</h1>
    <form (ngSubmit)="onSubmit()" class="form">
      <label>Username
        <input [(ngModel)]="username" name="username" required />
      </label>
      <label>Email
        <input [(ngModel)]="email" name="email" type="email" required />
      </label>
      <label>Password
        <input [(ngModel)]="password" name="password" type="password" required />
      </label>
      <button type="submit" [disabled]="loading()">Account anlegen</button>
      <p class="ok" *ngIf="ok()">Registrierung erfolgreich – du kannst dich jetzt einloggen.</p>
      <p class="error" *ngIf="error()">{{ error() }}</p>
    </form>
  `,
  styles: [`
    .form { display: grid; gap: 12px; max-width: 360px; }
    .error { color: #c00; }
    .ok { color: #0a0; }
    button { padding: 8px 12px; }
  `]
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  ok = signal(false);

  async onSubmit() {
    this.error.set(null);
    this.ok.set(false);
    this.loading.set(true);
    try {
      await this.auth.register(this.username, this.email, this.password);
      this.ok.set(true);
      // Optional direkt weiter zum Login:
      // this.router.navigateByUrl('/login');
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Registrierung fehlgeschlagen.');
    } finally {
      this.loading.set(false);
    }
  }
}

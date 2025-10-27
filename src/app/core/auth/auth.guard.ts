import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate: CanActivateFn = () => {
    const user = this.auth.user();
    if (!user) {
      // Kein Token/kein User → zurück zum Login
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  };
}

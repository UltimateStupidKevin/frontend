import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { TokenStorageService } from '../auth/token-storage.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStorageService);
  const router = inject(Router);

  const isApi = typeof req.url === 'string' && req.url.startsWith(environment.apiBase);
  let authReq: HttpRequest<any> = req;

  const token = tokenStore.getToken();
  if (isApi && token) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  return next(authReq).pipe(
    catchError(err => {
      // Wichtig:
      // - 401 (unauthenticated): zum Login
      // - 403 (forbidden): NICHT navigieren -> Seite kann sauber reagieren
      if (err?.status === 401) {
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};

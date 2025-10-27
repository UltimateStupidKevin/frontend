import { Injectable } from '@angular/core';

const KEY_NEW = 'accessToken';
const KEY_OLD = 'cf.jwt';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  getToken(): string | null {
    // Bevorzugt neuer Key, fallback alter Key (Kompatibilität)
    return localStorage.getItem(KEY_NEW) || localStorage.getItem(KEY_OLD);
  }

  setToken(token: string | null) {
    if (token) {
      localStorage.setItem(KEY_NEW, token);
      localStorage.setItem(KEY_OLD, token);
    } else {
      localStorage.removeItem(KEY_NEW);
      localStorage.removeItem(KEY_OLD);
    }
  }

  clear() {
    this.setToken(null);
  }
}

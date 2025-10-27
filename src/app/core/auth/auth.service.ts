import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthResponse, MeRes } from '../api.types';
import { TokenStorageService } from './token-storage.service';

type AuthUser = { id: number; username: string; email: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<AuthUser | null>(null);
  user = this._user.asReadonly();

  constructor(
    private http: HttpClient,
    private tokenStore: TokenStorageService
  ) {
    // Beim Start: Token lesen und Claims in _user setzen
    const token = this.tokenStore.getToken();
    if (token) this.applyToken(token);
  }

  isLoggedIn(): boolean {
    return !!this._user();
  }

  token(): string | null {
    return this.tokenStore.getToken();
  }

  async login(email: string, password: string): Promise<void> {
    const res = await this.http
      .post<AuthResponse>(`${environment.apiBase}/auth/login`, { email, password })
      .toPromise();
    if (!res?.accessToken) throw new Error('no_token');
    this.applyToken(res.accessToken);
    await this.verifyMe(); // optional: Token-Check serverseitig
  }

  async register(username: string, email: string, password: string): Promise<void> {
    const res = await this.http
      .post<AuthResponse>(`${environment.apiBase}/auth/register`, { username, email, password })
      .toPromise();
    if (!res?.accessToken) throw new Error('no_token');
    this.applyToken(res.accessToken);
    await this.verifyMe();
  }

  logout() {
    this.tokenStore.clear();
    this._user.set(null);
  }

  // ---- intern

  private applyToken(token: string) {
    this.tokenStore.setToken(token);
    const parsed = this.decodeJwt(token);
    if (parsed) {
      this._user.set({
        id: Number(parsed.sub),
        username: parsed.username ?? 'User',
        email: parsed.email ?? '',
      });
    } else {
      this._user.set(null);
    }
  }

  private async verifyMe() {
    try {
      const me = await this.http.get<MeRes>(`${environment.apiBase}/me`).toPromise();
      if (!me?.authenticated) this.logout();
    } catch {
      // Ignorieren – Server könnte offline sein; Requests werden sonst 401 liefern
    }
  }

  /** Minimaler JWT-Decoder (ohne crypto) */
  private decodeJwt(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      // unescape ist deprecated; Ersatz:
      const str = decodeURIComponent(
        json.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(str);
    } catch {
      return null;
    }
  }
}

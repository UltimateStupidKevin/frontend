import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

type OpenGame = {
  id: number;
  timeControl?: string;
  whiteId?: number | null;
  blackId?: number | null;
  whiteUsername?: string | null;
  blackUsername?: string | null;
  createdAt?: string;
};

@Component({
  standalone: true,
  selector: 'app-open-games',
  imports: [CommonModule],
  template: `
    <div class="p-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Open Games</h2>
        <div class="flex items-center gap-2">
          <button class="bg-blue-600 text-white px-3 py-1 rounded" (click)="reload()" [disabled]="loading()">Reload</button>
          <button class="bg-gray-700 text-white px-3 py-1 rounded" (click)="toCreate()">Create Game</button>
        </div>
      </div>

      <p *ngIf="error()" class="text-red-600 mb-3">{{ error() }}</p>

      <div *ngIf="!loading() && games().length === 0 && !error()" class="text-gray-600">
        Keine offenen Spiele gefunden.
      </div>

      <div class="space-y-2" *ngIf="games().length">
        <div *ngFor="let g of games()" class="border rounded p-3 flex items-center justify-between">
          <div class="text-sm">
            <div><b>Game #{{ g.id }}</b> • {{ g.timeControl || '—' }}</div>
            <div>White: {{ g.whiteUsername || g.whiteId || '—' }} • Black: {{ g.blackUsername || g.blackId || '—' }}</div>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="bg-green-600 text-white px-3 py-1 rounded"
              (click)="join(g.id)"
              [disabled]="joiningId() === g.id || loading()"
              title="Partie beitreten"
            >
              {{ joiningId() === g.id ? 'Joining…' : 'Join' }}
            </button>
            <button class="bg-gray-700 text-white px-3 py-1 rounded" (click)="goto(g.id)" title="Details ansehen">
              Ansehen
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [``]
})
export class OpenGamesPage implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);

  games = signal<OpenGame[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  joiningId = signal<number | null>(null);

  ngOnInit(): void {
    void this.reload();
  }

  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Robust: ohne Filter laden (einige Backends filtern sonst zu aggressiv).
      // Wenn du später "excludeMine" willst, schalten wir das optional wieder zu.
      const url = `${environment.apiBase}/games/open?limit=50`;
      console.debug('[OpenGames] GET', url);
      const data = await firstValueFrom(this.http.get<OpenGame[] | any>(url));

      // Es könnte theoretisch kein Array zurückkommen (defensiv behandeln)
      const list: OpenGame[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
          ? (data as any).items
          : [];

      console.debug('[OpenGames] loaded entries:', list.length, list);
      this.games.set(list);
    } catch (e: any) {
      console.error('[OpenGames] load error:', e);
      const msg = e?.error || e?.message || `Konnte offene Spiele nicht laden.`;
      this.error.set(String(msg));
    } finally {
      this.loading.set(false);
    }
  }

  async join(gameId: number) {
    this.joiningId.set(gameId);
    this.error.set(null);
    try {
      console.debug('[OpenGames] POST /match/join', { gameId });
      // Backend: 200 ohne Body -> direkt zur bekannten ID navigieren
      await firstValueFrom(this.http.post(`${environment.apiBase}/match/join`, { gameId }));
      await this.router.navigate(['/games', gameId]);
    } catch (e: any) {
      console.error('[OpenGames] join error:', e);
      const msg = e?.error || e?.message || 'Join fehlgeschlagen.';
      this.error.set(String(msg));
      // Liste auffrischen (z. B. wenn Spiel gerade geschlossen/gefüllt wurde)
      await this.reload();
    } finally {
      this.joiningId.set(null);
    }
  }

  goto(gameId: number) {
    this.router.navigate(['/games', gameId]);
  }

  toCreate() {
    this.router.navigate(['/games/create']);
  }
}

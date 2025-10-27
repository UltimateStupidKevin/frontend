import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { Chess, Square } from 'chess.js';

type GameDetails = {
  id: number;
  whiteId?: number;
  blackId?: number;
  whiteUsername?: string;
  blackUsername?: string;
  status: 'CREATED' | 'ONGOING' | 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | 'TIMEOUT' | 'RESIGN';
  whiteMs: number;
  blackMs: number;
  running: boolean;
  nextToMove?: 'WHITE' | 'BLACK';
  drawOfferBy?: number | null;
};

type ClockView = { whiteMs: number; blackMs: number; running: boolean; status?: string };

type MoveItem = {
  id: number;
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  createdAt?: string;
};

type PostMoveReq = {
  san: string;
  uci: string;
  fenAfter: string;
  playedMs: number;
};

type Cell = {
  sq: Square;
  piece: string | null;
  light: boolean;
  selected: boolean;
  hint: boolean;
};

@Component({
  standalone: true,
  selector: 'app-game-detail',
  imports: [CommonModule],
  templateUrl: './game-detail.page.html',
  styleUrls: ['./game-detail.page.scss'],
})
export class GameDetailPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);

  gameId!: number;
  game = signal<GameDetails | null>(null);
  meId?: number;

  private pollSub?: Subscription;
  private movesSub?: Subscription;
  private localTickSub?: Subscription;
  private lastStatus: GameDetails['status'] | null = null;

  private chess = new Chess();
  private lastMoveCount = -1;

  board = signal<Cell[][]>([]);
  selected: Square | null = null;
  legalTargets = new Set<Square>();

  error = signal<string | null>(null);
  info = signal<string | null>(null);

  private baseWhiteMs = 0;
  private baseBlackMs = 0;
  private baseRunning = false;
  private baseNextToMove: 'WHITE' | 'BLACK' | undefined;
  private baseSyncedAt = 0;

  // ➕ neues Flag: verhindert mehrfachen Hard-Refresh bei 0:00
  private timeoutSyncTriggered = false;

  flip = computed(() => {
    const g = this.game();
    if (!g) return false;
    if (this.meId && g.whiteId === this.meId) return false;
    if (this.meId && g.blackId === this.meId) return true;
    return false;
  });

  meColor(): 'w' | 'b' | null {
    const g = this.game();
    if (!g || !this.meId) return null;
    if (g.whiteId === this.meId) return 'w';
    if (g.blackId === this.meId) return 'b';
    return null;
  }

  ngOnInit(): void {
    this.meId = this.auth.user()?.id ?? undefined;
    this.gameId = Number(this.route.snapshot.paramMap.get('id'));
    this.ensureOverlayBaseStyles();
    void this.initialLoad();

    this.pollSub = interval(1000).subscribe(() => {
      void this.reloadDetailsAndClock();
    });
    this.movesSub = interval(1500).subscribe(() => {
      void this.reloadMoves();
    });
    this.localTickSub = interval(100).subscribe(() => {
      // Wenn die aktive Seite lokal <= 0 ist, forciere sofort Sync (einmalig)
      const g = this.game();
      if (!g || g.status !== 'ONGOING') return;
      const active = g.nextToMove;
      if (!active) return;
      const ms = this.nowMsFor(active);
      if (ms <= 0 && !this.timeoutSyncTriggered) {
        this.timeoutSyncTriggered = true;
        // harmloser Sync → Backend setzt TIMEOUT (siehe GameService)
        void this.reloadDetailsAndClock().finally(() => {
          // nach Sync Flag zurücksetzen, damit spätere Enden wieder erkannt werden
          setTimeout(() => (this.timeoutSyncTriggered = false), 1500);
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.movesSub?.unsubscribe();
    this.localTickSub?.unsubscribe();
    document.getElementById('game-ended-overlay')?.remove();
  }

  isEnded(status: GameDetails['status']) {
    return ['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'TIMEOUT', 'RESIGN'].includes(status);
  }

  getEndReason(status: GameDetails['status']) {
    switch (status) {
      case 'WHITE_WIN': return 'Weiß gewinnt (Matt/Aufgabe)';
      case 'BLACK_WIN': return 'Schwarz gewinnt (Matt/Aufgabe)';
      case 'DRAW':      return 'Remis (vereinbart oder Regel)';
      case 'TIMEOUT':   return 'Zeit abgelaufen';
      case 'RESIGN':    return 'Aufgegeben';
      default:          return '';
    }
  }

  private setClockBaselineFromDetails(d: GameDetails) {
    this.baseWhiteMs = d.whiteMs ?? 0;
    this.baseBlackMs = d.blackMs ?? 0;
    this.baseRunning = !!d.running && d.status === 'ONGOING';
    this.baseNextToMove = d.nextToMove;
    this.baseSyncedAt = performance.now();
  }

  private setClockBaselineFromClock(c: ClockView) {
    this.baseWhiteMs = c.whiteMs ?? this.baseWhiteMs;
    this.baseBlackMs = c.blackMs ?? this.baseBlackMs;
    this.baseRunning = typeof c.running === 'boolean' ? c.running : this.baseRunning;
    this.baseSyncedAt = performance.now();
  }

  nowMsFor(color: 'WHITE' | 'BLACK'): number {
    const g = this.game();
    if (!g) return 0;

    let wm = this.baseWhiteMs;
    let bm = this.baseBlackMs;

    const elapsed = Math.max(0, performance.now() - this.baseSyncedAt);
    if (this.baseRunning && g.status === 'ONGOING') {
      if (this.baseNextToMove === 'WHITE') wm = Math.max(0, wm - elapsed);
      else if (this.baseNextToMove === 'BLACK') bm = Math.max(0, bm - elapsed);
    }
    return color === 'WHITE' ? wm : bm;
  }

  formatMs(ms: number): string {
    const totalMs = Math.max(0, Math.floor(ms));
    const totalSec = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (totalSec < 10) {
      const tenths = Math.floor((totalMs % 1000) / 100);
      return `${minutes > 0 ? minutes + ':' : ''}${seconds.toString().padStart(2, '0')}.${tenths}`;
    }
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private async initialLoad() {
    await this.loadDetailsOnly();
    await this.reloadMoves();
  }

  private async reloadDetailsAndClock() {
    await this.loadDetailsOnly();
    await this.loadClockOnly();
  }

  private async loadDetailsOnly() {
    try {
      const d = await firstValueFrom(
        this.http.get<GameDetails>(`${environment.apiBase}/games/${this.gameId}/details`)
      );

      const prevEnded = this.lastStatus ? this.isEnded(this.lastStatus) : false;
      if ((this.lastStatus === null && this.isEnded(d.status)) || (!prevEnded && this.isEnded(d.status))) {
        this.showEndOverlay(d);
      }

      this.game.set(d);
      this.lastStatus = d.status;
      this.setClockBaselineFromDetails(d);
    } catch (e: any) {
      if (e?.status === 403) this.error.set('Kein Zugriff auf diese Partie.');
    }
  }

  private async loadClockOnly() {
    try {
      const c = await firstValueFrom(
        this.http.get<ClockView>(`${environment.apiBase}/games/${this.gameId}/clock`)
      );
      this.setClockBaselineFromClock(c);
    } catch {
      // ignore
    }
  }

  private async reloadMoves() {
    const g = this.game();
    if (!g) return;
    try {
      const moves = await firstValueFrom(
        this.http.get<MoveItem[]>(`${environment.apiBase}/games/${g.id}/moves`)
      );
      if (moves.length !== this.lastMoveCount || this.board().length === 0 || this.lastMoveCount === -1) {
        this.lastMoveCount = moves.length;
        this.rebuildPosition(moves);
      }
      this.error.set(null);
    } catch (e: any) {
      if (e?.status === 403) {
        this.error.set('Du hast keine Berechtigung, die Züge dieser Partie zu sehen.');
      } else {
        this.error.set('Züge konnten nicht geladen werden.');
      }
    }
  }

  private rebuildPosition(moves: MoveItem[]) {
    this.chess.reset();

    if (moves.length === 0) {
      this.selected = null;
      this.legalTargets.clear();
      this.refreshBoardView();
      return;
    }
    for (const m of moves) {
      if (m.fenAfter) this.chess.load(m.fenAfter);
      else if (m.san) { try { this.chess.move(m.san as any); } catch { /* ignore */ } }
    }
    this.selected = null;
    this.legalTargets.clear();
    this.refreshBoardView();
  }

  ranks = () => Array.from({length: 8}, (_, i) => 8 - i);

  private refreshBoardView() {
    const cells: Cell[][] = [];
    const b = this.chess.board();
    for (let r = 0; r < 8; r++) {
      const row: Cell[] = [];
      for (let f = 0; f < 8; f++) {
        const sq = (String.fromCharCode('a'.charCodeAt(0) + f) + (8 - r)) as Square;
        const piece = b[r][f] ? (b[r][f]!.color === 'w' ? b[r][f]!.type.toUpperCase() : b[r][f]!.type) : null;
        const isLight = ((r + f) % 2) === 0;
        row.push({ sq, piece, light: isLight, selected: this.selected === sq, hint: this.legalTargets.has(sq) });
      }
      cells.push(row);
    }
    this.board.set(this.flip() ? cells.slice().reverse().map(row => row.slice().reverse()) : cells);
  }

  isWhitePieceChar(p?: string | null) { return !!p && p >= 'A' && p <= 'Z'; }
  isBlackPieceChar(p?: string | null) { return !!p && p >= 'a' && p <= 'z'; }

  pieceGlyph(p: string): string {
    switch (p) {
      case 'K': return '♔'; case 'Q': return '♕'; case 'R': return '♖';
      case 'B': return '♗'; case 'N': return '♘'; case 'P': return '♙';
      case 'k': return '♚'; case 'q': return '♛'; case 'r': return '♜';
      case 'b': return '♝'; case 'n': return '♞'; case 'p': return '♟';
      default: return '';
    }
  }

  onCellClick(sq: Square) {
    const g = this.game();
    if (!g || g.status !== 'ONGOING') return;

    const myColor = this.meColor();
    if (!myColor) { this.info.set('Nur als Spieler kannst du ziehen.'); return; }
    const toMove = g.nextToMove === 'WHITE' ? 'w' : 'b';
    if (toMove !== myColor) { this.info.set('Du bist nicht am Zug.'); return; }

    const piece = this.chess.get(sq);
    const isOwnPiece = piece && piece.color === myColor;

    if (this.selected == null) {
      if (!isOwnPiece) { this.info.set('Wähle zuerst eine deiner Figuren.'); return; }
      this.selectSquare(sq); return;
    }

    if (isOwnPiece) { this.selectSquare(sq); return; }
    void this.tryMove(this.selected, sq);
  }

  private selectSquare(sq: Square) {
    this.selected = sq;
    this.legalTargets.clear();
    const moves = this.chess.moves({ square: sq, verbose: true }) as any[];
    for (const m of moves) this.legalTargets.add(m.to as Square);
    this.error.set(null);
    this.info.set('Ziel wählen …');
    this.refreshBoardView();
  }

  private async tryMove(from: Square, to: Square) {
    const legal = (this.chess.moves({ square: from, verbose: true }) as any[]).find(m => m.to === to);
    if (!legal) { this.error.set('Illegaler Zug.'); this.info.set(null); return; }

    const before = this.chess.fen();
    const res = this.chess.move({ from, to, promotion: 'q' } as any);
    if (!res) { this.error.set('Zug konnte nicht ausgeführt werden.'); this.info.set(null); return; }

    const san = res.san;
    const uci = (from + to + (res.promotion ? res.promotion : '')).toLowerCase();
    const fenAfter = this.chess.fen();
    this.chess.load(before);

    const body: PostMoveReq = { san, uci, fenAfter, playedMs: 0 };

    try {
      await firstValueFrom(this.http.post(`${environment.apiBase}/games/${this.gameId}/move`, body));
      this.selected = null;
      this.legalTargets.clear();
      this.info.set('Zug gesendet.');
      this.error.set(null);
      await this.reloadMoves();
      await this.loadDetailsOnly();
    } catch (e: any) {
      const msg = e?.error || e?.message || 'Move fehlgeschlagen';
      this.error.set(String(msg));
      this.info.set(null);
      this.refreshBoardView();
    }
  }

  async resign() {
    await firstValueFrom(this.http.post(`${environment.apiBase}/games/${this.gameId}/resign`, {}));
    await this.loadDetailsOnly();
  }
  async offerDraw() {
    await firstValueFrom(this.http.post(`${environment.apiBase}/games/${this.gameId}/draw/offer`, {}));
    await this.loadDetailsOnly();
  }
  async acceptDraw() {
    await firstValueFrom(this.http.post(`${environment.apiBase}/games/${this.gameId}/draw/accept`, {}));
    await this.loadDetailsOnly();
  }
  async declineDraw() {
    await firstValueFrom(this.http.post(`${environment.apiBase}/games/${this.gameId}/draw/decline`, {}));
    await this.loadDetailsOnly();
  }

  toCreate() { this.router.navigate(['/games/create']); }
  toOpen()   { this.router.navigate(['/games/open']); }

  private ensureOverlayBaseStyles() {
    const styleId = 'game-ended-overlay-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .geo-ovl-backdrop { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.5); z-index: 9999; }
      .geo-ovl-card { background: #fff; border-radius: 12px; padding: 20px; max-width: 520px; width: calc(100% - 40px);
        box-shadow: 0 10px 25px rgba(0,0,0,.35);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans'; }
      .geo-ovl-title { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
      .geo-ovl-row { margin: 6px 0; }
      .geo-ovl-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
      .geo-ovl-btn { border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #fff; background: #2563eb; }
      .geo-ovl-btn.secondary { background: #374151; }
    `;
    document.head.appendChild(style);
  }

  private showEndOverlay(d: GameDetails) {
    if (document.getElementById('game-ended-overlay')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'game-ended-overlay';
    backdrop.className = 'geo-ovl-backdrop';
    const card = document.createElement('div');
    card.className = 'geo-ovl-card';
    card.innerHTML = `
      <h2 class="geo-ovl-title">Game Over</h2>
      <div class="geo-ovl-row"><b>White:</b> ${d.whiteUsername ?? d.whiteId ?? '—'}</div>
      <div class="geo-ovl-row"><b>Black:</b> ${d.blackUsername ?? d.blackId ?? '—'}</div>
      <div class="geo-ovl-row"><b>Status:</b> ${d.status}</div>
      <div class="geo-ovl-row"><b>Grund:</b> ${this.getEndReason(d.status)}</div>
      <div class="geo-ovl-actions">
        <button id="geo-btn-create" class="geo-ovl-btn">Create Game</button>
        <button id="geo-btn-open" class="geo-ovl-btn secondary">Open Games</button>
      </div>
    `;
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    document.getElementById('geo-btn-create')?.addEventListener('click', () => { this.toCreate(); close(); });
    document.getElementById('geo-btn-open')?.addEventListener('click', () => { this.toOpen();   close(); });
    backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) close(); });
  }
}

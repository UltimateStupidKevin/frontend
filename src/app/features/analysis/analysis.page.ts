import { CommonModule } from '@angular/common';
import { Component, computed, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Chess } from 'chess.js';
import { EngineApiService } from '../../core/engine/engine-api.service';
import {
  EngineAnalyseLine,
  EngineAnalyseRequest,
  EngineAnalyseResponse,
} from '../../core/engine/engine.types';

type Piece =
  | 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'
  | 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  | '.';

type GameOverState =
  | { kind: 'checkmate'; winner: 'white' | 'black' }
  | { kind: 'stalemate' }
  | { kind: 'draw' }
  | null;

@Component({
  standalone: true,
  selector: 'app-analysis',
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis.page.html',
  styleUrls: ['./analysis.page.scss'],
})
export class AnalysisPage implements OnInit {
  private engine = inject(EngineApiService);
  private route = inject(ActivatedRoute);

  // UI State
  pgn = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  multiPv = signal(3);
  depth = signal(14);

  // Position / Result
  fen = signal<string | null>(null);
  board = signal<Record<string, Piece>>({});
  result = signal<EngineAnalyseResponse | null>(null);

  // Game end state
  gameOver = signal<GameOverState>(null);

  // Board interaction
  selectedSquare = signal<string | null>(null);
  legalTargets = signal<Set<string>>(new Set());

  // Undo stack (nur "eingefügte Züge" im UI)
  undoStack = signal<string[]>([]);
  canUndo = computed(() => this.undoStack().length > 0);

  // Auto analysis
  autoAnalysePending = signal(false);
  private analyseDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;

  // Internal chess state
  private chess: Chess | null = null;

  // helpers for board rendering 
  files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  ranks = [8, 7, 6, 5, 4, 3, 2, 1];

  ngOnInit(): void {
    const fenParam = this.route.snapshot.queryParamMap.get('fen');
    if (fenParam && fenParam.trim()) {
      this.setPositionFromFen(fenParam.trim());
    }
  }

  asNumber(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  squares(): string[] {
    const res: string[] = [];
    for (const r of this.ranks) {
      for (const f of this.files) res.push(`${f}${r}`);
    }
    return res;
  }

  isDark(i: number) {
    const f = i % 8;
    const r = Math.floor(i / 8);
    return (f + r) % 2 === 1;
  }

  isWhitePiece(p?: Piece) {
    if (!p || p === '.') return false;
    return p === p.toUpperCase();
  }

  glyph(p?: Piece): string {
    const m: Record<string, string> = {
      P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
      p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
      '.': '',
    };
    return m[p ?? '.'] ?? '';
  }

  isSelected(sq: string): boolean {
    return this.selectedSquare() === sq;
  }

  isTarget(sq: string): boolean {
    return this.legalTargets().has(sq);
  }

  // ---------- Evaluation ----------

  topLine = computed<EngineAnalyseLine | null>(() => {
    const r = this.result();
    if (!r?.lines?.length) return null;
    return r.lines.slice().sort((a, b) => a.rank - b.rank)[0] ?? null;
  });

  private rawEvalText = computed(() => {
    const tl = this.topLine();
    if (!tl) return '—';

    // mate=0 wird NICHT angezeigt. (Game Over -> keine Analyse)
    if (tl.mate !== null && tl.mate !== undefined) {
      if (tl.mate === 0) return '—';

      const n = Math.abs(tl.mate);
      const sign = tl.mate > 0 ? '+' : '-';
      return `${sign}M${n}`;
    }

    const cp = tl.scoreCp ?? 0;
    const pawns = cp / 100;
    const sign = pawns > 0 ? '+' : '';
    return `${sign}${pawns.toFixed(2)}`;
  });

  evalBoxText = computed(() => {
    const go = this.gameOver();
    if (go) {
      if (go.kind === 'checkmate') {
        return go.winner === 'white' ? 'Schachmatt, Weiß gewinnt' : 'Schachmatt, Schwarz gewinnt';
      }
      if (go.kind === 'stalemate') return 'Patt, Remis';
      return 'Remis';
    }

    if (this.loading()) return 'Analyse…';
    if (this.autoAnalysePending()) return 'Analyse geplant…';
    return this.rawEvalText();
  });

  whiteBarPct = computed(() => {
    const go = this.gameOver();
    if (go?.kind === 'checkmate') {
      return go.winner === 'white' ? 1 : 0;
    }
    if (go?.kind === 'stalemate' || go?.kind === 'draw') {
      return 0.5;
    }

    const tl = this.topLine();
    if (!tl) return 0.5;

    if (tl.mate !== null && tl.mate !== undefined) {
      if (tl.mate === 0) return 0.5;
      return tl.mate > 0 ? 1 : 0;
    }

    const cp = tl.scoreCp ?? 0;
    const x = cp / 400;
    const pct = (Math.tanh(x) + 1) / 2;
    return Math.min(1, Math.max(0, pct));
  });



  linesView = computed(() => {
    const r = this.result();
    if (!r) return [];

    const startFen = this.fen();
    const base = startFen ? new Chess(startFen) : new Chess();

    const sorted = r.lines.slice().sort((a, b) => a.rank - b.rank);
    return sorted.map((line) => {
      const sanPv = this.pvUciToSan(base, line.pv);
      return {
        ...line,
        eval: this.formatLineEval(line),
        sanPv,
      };
    });
  });

  private formatLineEval(line: EngineAnalyseLine): string {
    if (line.mate !== null && line.mate !== undefined) {
      // mate=0 nie anzeigen
      if (line.mate === 0) return '—';

      const n = Math.abs(line.mate);
      const sign = line.mate > 0 ? '+' : '-';
      return `${sign}M${n}`;
    }

    const cp = line.scoreCp ?? 0;
    const pawns = cp / 100;
    const sign = pawns > 0 ? '+' : '';
    return `${sign}${pawns.toFixed(2)}`;
  }

  private pvUciToSan(base: Chess, pv: string[]): string {
    const c = new Chess(base.fen());
    const san: string[] = [];
    for (const uci of pv) {
      const mv = this.uciToMove(uci);
      if (!mv) break;

      const res = (c as any).move(mv as any);
      if (!res) break;
      san.push(res.san);
    }
    return san.join(' ');
  }

  private uciToMove(uci: string): { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null {
    if (!uci || uci.length < 4) return null;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length >= 5 ? (uci[4].toLowerCase() as any) : undefined;
    if (promo && !['q', 'r', 'b', 'n'].includes(promo)) return { from, to };
    return promo ? { from, to, promotion: promo } : { from, to };
  }

  // ---------- Game over detection (chess.js compat) ----------

  private isGameOverChess(c: any): boolean {
    if (!c) return false;
    if (typeof c.isGameOver === 'function') return !!c.isGameOver();
    if (typeof c.game_over === 'function') return !!c.game_over();
    return false;
  }

  private isCheckmateChess(c: any): boolean {
    if (!c) return false;
    if (typeof c.isCheckmate === 'function') return !!c.isCheckmate();
    if (typeof c.in_checkmate === 'function') return !!c.in_checkmate();
    return false;
  }

  private isStalemateChess(c: any): boolean {
    if (!c) return false;
    if (typeof c.isStalemate === 'function') return !!c.isStalemate();
    if (typeof c.in_stalemate === 'function') return !!c.in_stalemate();
    return false;
  }

  private isDrawChess(c: any): boolean {
    if (!c) return false;
    if (typeof c.isDraw === 'function') return !!c.isDraw();
    if (typeof c.in_draw === 'function') return !!c.in_draw();
    return false;
  }

  private updateGameOverState() {
    const c: any = this.chess;
    if (!c) {
      this.gameOver.set(null);
      return;
    }

    if (!this.isGameOverChess(c)) {
      this.gameOver.set(null);
      return;
    }

    if (this.isCheckmateChess(c)) {
      const turn: 'w' | 'b' = c.turn();
      const winner: 'white' | 'black' = turn === 'w' ? 'black' : 'white';
      this.gameOver.set({ kind: 'checkmate', winner });
      return;
    }

    if (this.isStalemateChess(c)) {
      this.gameOver.set({ kind: 'stalemate' });
      return;
    }

    if (this.isDrawChess(c)) {
      this.gameOver.set({ kind: 'draw' });
      return;
    }

    // Fallback
    this.gameOver.set({ kind: 'draw' });
  }

  onSquareClick(sq: string) {
    if (!this.chess) return;
    if (this.gameOver()) return; // bei Game Over keine Züge mehr

    const selected = this.selectedSquare();
    const piece = this.board()[sq];
    const turn = (this.chess as any).turn() as 'w' | 'b';

    if (!selected) {
      if (piece && piece !== '.' && this.isPieceOfTurn(piece, turn)) {
        this.selectSquare(sq);
      }
      return;
    }

    if (selected === sq) {
      this.clearSelection();
      return;
    }

    if (this.legalTargets().has(sq)) {
      this.makeMove(selected, sq);
      return;
    }

    if (piece && piece !== '.' && this.isPieceOfTurn(piece, turn)) {
      this.selectSquare(sq);
      return;
    }

    this.clearSelection();
  }

  private isPieceOfTurn(piece: Piece, turn: 'w' | 'b'): boolean {
    if (piece === '.') return false;
    const isWhite = piece === piece.toUpperCase();
    return (turn === 'w' && isWhite) || (turn === 'b' && !isWhite);
  }

  private selectSquare(sq: string) {
    if (!this.chess) return;

    const moves = (this.chess as any).moves({ square: sq as any, verbose: true }) as any[];
    const targets = new Set<string>();
    for (const m of moves) targets.add(m.to);

    this.selectedSquare.set(sq);
    this.legalTargets.set(targets);
  }

  private clearSelection() {
    this.selectedSquare.set(null);
    this.legalTargets.set(new Set());
  }

  private makeMove(from: string, to: string) {
    if (!this.chess) return;
    if (this.gameOver()) return;

    const beforeFen = this.chess.fen();

    // Promotion: automatisch Queen
    const verboseMoves = (this.chess as any).moves({ square: from as any, verbose: true }) as any[];
    const needsPromotion = verboseMoves.some((m) => m.to === to && m.promotion);

    const move: any = needsPromotion
      ? { from, to, promotion: 'q' }
      : { from, to };

    const res = (this.chess as any).move(move);
    if (!res) {
      this.clearSelection();
      return;
    }
    this.undoStack.update((s) => [...s, beforeFen]);

    const newFen = this.chess.fen();
    this.fen.set(newFen);
    this.board.set(this.fenToBoard(newFen));
    this.clearSelection();
    this.result.set(null);
    this.updateGameOverState();

    if (!this.gameOver()) {
      this.scheduleAutoAnalyse();
    } else {
      this.cancelAutoAnalyse();
    }
  }

  onUndo() {
    const stack = this.undoStack();
    if (!stack.length) return;

    const prevFen = stack[stack.length - 1];
    this.undoStack.set(stack.slice(0, -1));

    this.cancelAutoAnalyse();

    this.chess = new Chess(prevFen);
    this.fen.set(prevFen);
    this.board.set(this.fenToBoard(prevFen));
    this.clearSelection();

    this.result.set(null);
    this.error.set(null);

    this.updateGameOverState();

    if (!this.gameOver()) {
      this.scheduleAutoAnalyse();
    }
  }

  async onAnalyse() {
    this.error.set(null);

    // falls noch keine Position existiert -> PGN parsen
    if (!this.fen()) {
      const pgnText = (this.pgn() ?? '').trim();
      if (!pgnText) {
        this.error.set('Bitte PGN einfügen.');
        return;
      }

      const fen = this.pgnToFen(pgnText);
      if (!fen) {
        this.error.set('PGN konnte nicht geparst werden.');
        return;
      }

      this.setPositionFromFen(fen);
    }

    // Wenn Game Over: keine Analyse starten
    if (this.gameOver()) {
      this.result.set(null);
      return;
    }

    await this.analyseCurrentFen();
  }

  private cancelAutoAnalyse() {
    this.autoAnalysePending.set(false);
    if (this.analyseDebounceHandle) {
      clearTimeout(this.analyseDebounceHandle);
      this.analyseDebounceHandle = null;
    }
  }

  private scheduleAutoAnalyse() {
    if (!this.fen()) return;
    if (this.gameOver()) return;

    if (this.analyseDebounceHandle) {
      clearTimeout(this.analyseDebounceHandle);
      this.analyseDebounceHandle = null;
    }

    this.autoAnalysePending.set(true);
    this.analyseDebounceHandle = setTimeout(async () => {
      this.autoAnalysePending.set(false);
      if (this.gameOver()) return;
      await this.analyseCurrentFen();
    }, 350);
  }

  private async analyseCurrentFen() {
    const fen = this.fen();
    if (!fen) return;
    if (this.gameOver()) return;

    const seq = ++this.requestSeq;

    const req: EngineAnalyseRequest = {
      fen,
      depth: this.depth(),
      multiPv: this.multiPv(),
    };

    this.loading.set(true);
    try {
      const res = await this.engine.analyse(req);

      if (seq !== this.requestSeq) return;

      // Safety: wenn Engine mate=0 liefert -> wir behandeln das als "Game Over -> keine Analyse"
      const hasMateZero = (res.lines ?? []).some((l) => l.mate === 0);
      if (hasMateZero) {
        this.result.set(null);
        this.updateGameOverState();
        return;
      }

      this.result.set(res);
    } catch (e: any) {
      if (seq !== this.requestSeq) return;

      const status = e?.status;
      if (status === 401) {
        this.error.set('Nicht eingeloggt (401).');
      } else if (status === 403) {
        this.error.set('Zugriff verweigert (403) – Token fehlt oder ist ungültig.');
      } else if (status === 429) {
        this.error.set('Zu viele Anfragen (429). Warte kurz und versuch es erneut.');
      } else {
        this.error.set('Analyse fehlgeschlagen. Engine/Backend erreichbar?');
      }
      console.error('[Analysis] analyse error', e);
    } finally {
      if (seq === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }

  onClear() {
    this.pgn.set('');
    this.error.set(null);
    this.result.set(null);
    this.fen.set(null);
    this.board.set({});
    this.clearSelection();
    this.chess = null;
    this.gameOver.set(null);

    this.undoStack.set([]);
    this.cancelAutoAnalyse();
  }

  private setPositionFromFen(fen: string) {
    this.cancelAutoAnalyse();

    this.fen.set(fen);
    this.board.set(this.fenToBoard(fen));
    this.result.set(null);
    this.error.set(null);
    this.clearSelection();

    this.chess = new Chess(fen);
    this.undoStack.set([]);
    this.updateGameOverState();
    if (!this.gameOver()) {
      this.scheduleAutoAnalyse();
    }
  }

  // ---------- PGN / FEN ----------

  private pgnToFen(pgn: string): string | null {
    try {
      const c = new Chess();
      const anyC = c as any;
      const ok =
        typeof anyC.loadPgn === 'function'
          ? anyC.loadPgn(pgn)
          : typeof anyC.load_pgn === 'function'
            ? anyC.load_pgn(pgn)
            : false;

      if (ok === false) return null;
      return c.fen();
    } catch {
      return null;
    }
  }

  private fenToBoard(fen: string): Record<string, Piece> {
    const [placement] = fen.trim().split(' ');
    const rows = placement.split('/');
    const map: Record<string, Piece> = {};
    let rank = 8;

    for (const row of rows) {
      let fileIdx = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          fileIdx += parseInt(ch, 10);
        } else {
          const sq = `${this.files[fileIdx]}${rank}`;
          map[sq] = ch as Piece;
          fileIdx++;
        }
      }
      rank--;
    }

    for (let r = 1; r <= 8; r++) {
      for (const f of this.files) {
        const sq = `${f}${r}`;
        if (!map[sq]) map[sq] = '.';
      }
    }

    return map;
  }
}

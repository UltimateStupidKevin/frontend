import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chess } from 'chess.js';
import { MasterGamesApiService } from './master-games-api.service';
import { MasterGameDetail } from './master-games.types';

type Piece =
  | 'P'
  | 'N'
  | 'B'
  | 'R'
  | 'Q'
  | 'K'
  | 'p'
  | 'n'
  | 'b'
  | 'r'
  | 'q'
  | 'k'
  | '.';

type ParsedMove = {
  ply: number; // 1..n
  color: 'w' | 'b';
  san: string;
  uci: string;
  fenAfter: string;
};

@Component({
  standalone: true,
  selector: 'app-master-game-detail',
  imports: [CommonModule, RouterLink],
  templateUrl: './master-game-detail.page.html',
  styleUrls: ['./master-game-detail.page.scss'],
})
export class MasterGameDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(MasterGamesApiService);

  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  game = signal<MasterGameDetail | null>(null);

  // PGN parsed
  tags = signal<Record<string, string>>({});
  initialFen = signal<string>('start');
  moves = signal<ParsedMove[]>([]);

  // Viewer state
  ply = signal<number>(0); // 0 = start position

  files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  ranks = [8, 7, 6, 5, 4, 3, 2, 1];

  currentFen = computed(() => {
    if (this.ply() <= 0) return this.initialFen() === 'start' ? new Chess().fen() : this.initialFen();
    const ms = this.moves();
    const idx = Math.min(ms.length - 1, this.ply() - 1);
    return ms[idx]?.fenAfter ?? (this.initialFen() === 'start' ? new Chess().fen() : this.initialFen());
  });

  analysisHref = computed(() => {
    const fen = this.currentFen();
    return `/analysis?fen=${encodeURIComponent(fen)}`;
  });

  board = computed(() => this.fenToBoard(this.currentFen()));

  title = computed(() => {
    const g = this.game();
    if (!g) return 'Meisterspiel';
    const w = g.white || 'Weiß';
    const b = g.black || 'Schwarz';
    return `${w} vs ${b}`;
  });

  subtitle = computed(() => {
    const g = this.game();
    if (!g) return '';
    const date = g.gameDate || '—';
    const res = g.result || '—';
    const ev = g.event || '—';
    return `${date} • ${res} • ${ev}`;
  });

  canPrev = computed(() => this.ply() > 0);
  canNext = computed(() => this.ply() < this.moves().length);

  movePairs = computed(() => {
    const ms = this.moves();
    const rows: Array<{
      moveNo: number;
      white?: ParsedMove;
      black?: ParsedMove;
    }> = [];

    for (let i = 0; i < ms.length; i += 2) {
      rows.push({
        moveNo: Math.floor(i / 2) + 1,
        white: ms[i],
        black: ms[i + 1],
      });
    }

    return rows;
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id)) {
      this.error.set('Ungültige ID.');
      return;
    }
    void this.load(id);
  }

  async load(id: number) {
    this.loading.set(true);
    this.error.set(null);

    try {
      const g = await this.api.getById(id);
      this.game.set(g);

      const tags = this.extractPgnTags(g.pgn);
      this.tags.set(tags);

      const startFen = tags['FEN']?.trim();
      this.initialFen.set(startFen ? startFen : 'start');

      const parsed = this.parsePgnMoves(g.pgn, startFen || null);
      this.moves.set(parsed);

      // Start immer am Anfang
      this.ply.set(0);
    } catch (e: any) {
      const status = e?.status;
      if (status === 403) this.error.set('Zugriff verweigert (403).');
      else this.error.set(String(e?.error ?? e?.message ?? 'Konnte Partie nicht laden.'));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- Viewer controls ----

  start() {
    this.ply.set(0);
  }

  prev() {
    this.ply.set(Math.max(0, this.ply() - 1));
  }

  next() {
    this.ply.set(Math.min(this.moves().length, this.ply() + 1));
  }

  end() {
    this.ply.set(this.moves().length);
  }

  jumpToPly(ply: number) {
    const max = this.moves().length;
    this.ply.set(Math.min(max, Math.max(0, ply)));
  }

  isCurrentMove(m: ParsedMove | undefined): boolean {
    if (!m) return false;
    return this.ply() === m.ply;
  }

  // ---- Chess rendering helpers ----

  squares(): string[] {
    const res: string[] = [];
    for (const r of this.ranks) for (const f of this.files) res.push(`${f}${r}`);
    return res;
  }

  isDark(i: number) {
    const f = i % 8;
    const r = Math.floor(i / 8);
    return (f + r) % 2 === 1;
  }

  glyph(p?: Piece): string {
    const m: Record<Piece, string> = {
      P: '♙',
      N: '♘',
      B: '♗',
      R: '♖',
      Q: '♕',
      K: '♔',
      p: '♟',
      n: '♞',
      b: '♝',
      r: '♜',
      q: '♛',
      k: '♚',
      '.': '',
    };
    return m[p ?? '.'] ?? '';
  }

  isWhitePiece(p?: Piece) {
    if (!p || p === '.') return false;
    return p === p.toUpperCase();
  }

  private fenToBoard(fen: string): Record<string, Piece> {
    const board: Record<string, Piece> = {};
    const parts = (fen ?? '').split(' ');
    const placement = parts[0] ?? '';
    const rows = placement.split('/');
    if (rows.length !== 8) return board;

    for (let r = 0; r < 8; r++) {
      const rank = 8 - r;
      let fileIdx = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          fileIdx += Number(ch);
          continue;
        }
        const file = this.files[fileIdx];
        if (!file) continue;
        board[`${file}${rank}`] = ch as Piece;
        fileIdx++;
      }
      for (; fileIdx < 8; fileIdx++) {
        const file = this.files[fileIdx];
        board[`${file}${rank}`] = '.';
      }
    }

    return board;
  }

  // ---- PGN parsing ----

  private extractPgnTags(pgn: string): Record<string, string> {
    const tags: Record<string, string> = {};
    const lines = (pgn ?? '').split(/\r?\n/);

    for (const line of lines) {
      const m = line.match(/^\s*\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
      if (!m) continue;
      tags[m[1]] = m[2];
    }

    return tags;
  }

  private parsePgnMoves(pgn: string, startFen: string | null): ParsedMove[] {
    const nativeRes = this.parseViaLoadPgn(pgn, startFen);
    if (nativeRes.length > 0) return nativeRes;

    return this.parseViaTokenizer(pgn, startFen);
  }

  private parseViaLoadPgn(pgn: string, startFen: string | null): ParsedMove[] {
    const c: any = startFen ? new Chess(startFen) : new Chess();
    const loaded = this.tryLoadPgnAny(c, pgn);
    if (!loaded) return [];

    const history = this.historyVerboseCompat(c);
    if (!history.length) return [];

    const base: any = startFen ? new Chess(startFen) : new Chess();
    const res: ParsedMove[] = [];

    let ply = 0;
    for (const mv of history) {
      const played = base.move(mv);
      if (!played) break;

      ply += 1;
      const from = String(mv?.from ?? '');
      const to = String(mv?.to ?? '');
      const promo = mv?.promotion ? String(mv.promotion) : '';
      const uci = `${from}${to}${promo}`.toLowerCase();

      res.push({
        ply,
        color: mv?.color === 'b' ? 'b' : 'w',
        san: String(mv?.san ?? ''),
        uci,
        fenAfter: base.fen(),
      });
    }

    return res;
  }

  private parseViaTokenizer(pgn: string, startFen: string | null): ParsedMove[] {
    const base: any = startFen ? new Chess(startFen) : new Chess();
    const tokens = this.tokenizePgnMoves(pgn);
    const res: ParsedMove[] = [];

    let ply = 0;
    for (const raw of tokens) {
      const mv = this.tryMoveAny(base, raw);
      if (!mv) break;

      ply += 1;
      const from = String(mv?.from ?? '');
      const to = String(mv?.to ?? '');
      const promo = mv?.promotion ? String(mv.promotion) : '';
      const uci = `${from}${to}${promo}`.toLowerCase();

      res.push({
        ply,
        color: mv?.color === 'b' ? 'b' : 'w',
        san: String(mv?.san ?? raw),
        uci,
        fenAfter: base.fen(),
      });
    }

    return res;
  }

  private tryLoadPgnAny(c: any, pgn: string): boolean {
    const attempts: Array<() => void> = [];

    if (typeof c.loadPgn === 'function') {
      attempts.push(() => c.loadPgn(pgn, { sloppy: true }));
      attempts.push(() => c.loadPgn(pgn, { strict: false }));
      attempts.push(() => c.loadPgn(pgn));
    }

    if (typeof c.load_pgn === 'function') {
      attempts.push(() => c.load_pgn(pgn, { sloppy: true }));
      attempts.push(() => c.load_pgn(pgn));
    }

    for (const run of attempts) {
      try {
        run();
      } catch {
        // ignore
      }
      const hist = this.historyVerboseCompat(c);
      if (hist.length > 0) return true;
    }

    return false;
  }

  private historyVerboseCompat(c: any): any[] {
    try {
      if (typeof c.history === 'function') {
        return c.history({ verbose: true }) ?? [];
      }
      return [];
    } catch {
      return [];
    }
  }

  private tokenizePgnMoves(pgn: string): string[] {
    const raw = String(pgn ?? '');

    const withoutTags = raw.replace(/^\s*\[[^\]]+\]\s*$/gm, ' ');
    const withoutBraces = withoutTags.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n\r]*/g, ' ');
    const withoutVars = this.stripParentheses(withoutBraces);
    const withoutNags = withoutVars.replace(/\$\d+/g, ' ');

    const normalized = withoutNags.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const parts = normalized.split(' ');
    const out: string[] = [];

    for (const p of parts) {
      const tok = p.trim();
      if (!tok) continue;

      if (/^\d+\.(\.\.)?$/.test(tok)) continue;
      if (tok === '1-0' || tok === '0-1' || tok === '1/2-1/2' || tok === '*') continue;

      out.push(tok);
    }

    return out;
  }

  private stripParentheses(s: string): string {
    let depth = 0;
    let out = '';
    for (const ch of s) {
      if (ch === '(') {
        depth += 1;
        continue;
      }
      if (ch === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0) out += ch;
    }
    return out;
  }

  private tryMoveAny(chess: any, rawSan: string): any | null {
    const san0 = String(rawSan ?? '').trim();
    if (!san0) return null;

    const candidates = this.normalizeSanCandidates(san0);
    for (const san of candidates) {
      const mv = this.tryMoveCompat(chess, san);
      if (mv) return mv;
    }

    return null;
  }

  private normalizeSanCandidates(san: string): string[] {
    const res: string[] = [];

    const fixedCastle = san.replace(/0-0-0/gi, 'O-O-O').replace(/0-0/gi, 'O-O');
    res.push(fixedCastle);

    const strippedAnno = fixedCastle.replace(/[!?]+$/g, '');
    if (strippedAnno !== fixedCastle) res.push(strippedAnno);

    const strippedDot = strippedAnno.replace(/\.+$/g, '');
    if (strippedDot !== strippedAnno) res.push(strippedDot);

    return Array.from(new Set(res)).filter((x) => x.length > 0);
  }

  private tryMoveCompat(chess: any, san: string): any | null {
    try {
      const mv1 = chess.move(san, { sloppy: true });
      if (mv1) return mv1;
    } catch {
      // ignore
    }

    try {
      const mv2 = chess.move(san);
      if (mv2) return mv2;
    } catch {
      // ignore
    }

    return null;
  }
}

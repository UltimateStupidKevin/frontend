import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

type Piece =
  | 'P'|'N'|'B'|'R'|'Q'|'K'
  | 'p'|'n'|'b'|'r'|'q'|'k'
  | '.';

type MoveDto = {
  seq: number;              // 1..4
  color: 'w' | 'b';
  from: string;             // "e2"
  to: string;               // "e4"
  promotion?: 'q'|'r'|'b'|'n';
};

type PuzzleDto = {
  id: number;
  fen: string;
  sideToMove: 'w' | 'b';    // deine Farbe zu Beginn
  moves: MoveDto[];         // komplette (max. 4) Halbzüge inkl. Gegner
};

@Component({
  selector: 'app-tactics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tactics.component.html',
  styleUrls: ['./tactics.component.scss']
})
export class TacticsComponent {
  private http = inject(HttpClient);
  private base = environment.apiBase.replace(/\/+$/, '');

  loading = true;
  error: string | null = null;

  puzzle: PuzzleDto | null = null;
  userColor: 'w'|'b' = 'w';
  solution: MoveDto[] = [];
  step = 0;                     // 0-basiert
  done = false;

  board: Record<string, Piece> = {};
  selected: string | null = null;
  hintFrom: string | null = null;
  flashBad: string | null = null;

  files = ['a','b','c','d','e','f','g','h'];
  ranks = [8,7,6,5,4,3,2,1];

  async ngOnInit() { await this.loadRandom(); }

  get displayStep(): number { return Math.min(this.step, this.solution.length); }

  // ---------- API ----------
  private async loadRandom() {
    this.loading = true;
    this.error = null; this.done = false;
    this.selected = null; this.hintFrom = null; this.flashBad = null;

    try {
      const p = await firstValueFrom(this.http.get<PuzzleDto>(`${this.base}/api/tactics/random`));
      p.moves = (p.moves ?? []).slice().sort((a,b)=>a.seq-b.seq).slice(0,4);
      this.puzzle = p;
      this.userColor = p.sideToMove;
      this.solution = p.moves;
      this.step = 0;
      this.board = this.fenToBoard(p.fen);
      this.autoPlayOpponentUntilUserTurn();
    } catch {
      this.error = 'Konnte kein Puzzle laden.';
    } finally {
      this.loading = false;
    }
  }

  // ---------- Actions ----------
  onSquareClick(sq: string) {
    if (this.loading || this.error || this.done) return;

    if (!this.selected) {
      this.selected = sq; this.hintFrom = null;
      return;
    }

    const from = this.selected, to = sq;
    const expected = this.solution[this.step];
    if (!expected) return;

    if (expected.color !== this.userColor) {
      this.selected = null; return;
    }

    if (expected.from === from && expected.to === to) {
      this.applyMove(from, to, expected.promotion);
      this.step++;
      this.autoPlayOpponentUntilUserTurn();
      if (this.step >= this.solution.length) this.done = true;
      this.selected = null; this.hintFrom = null;
    } else {
      this.flashBad = sq; setTimeout(()=> this.flashBad = null, 220);
      this.selected = sq;
    }
  }

  onHint() {
    if (this.loading || this.error || this.done) return;
    const expected = this.solution[this.step];
    if (expected && expected.color === this.userColor) {
      this.hintFrom = expected.from; this.selected = expected.from;
      setTimeout(()=> this.hintFrom = null, 1400);
    }
  }

  onReset() {
    if (!this.puzzle) return;
    this.board = this.fenToBoard(this.puzzle.fen);
    this.step = 0; this.done = false;
    this.selected = null; this.hintFrom = null; this.flashBad = null;
    this.autoPlayOpponentUntilUserTurn();
  }

  async onNext() { await this.loadRandom(); }

  // ---------- Core ----------
  private autoPlayOpponentUntilUserTurn() {
    while (this.step < this.solution.length && this.solution[this.step].color !== this.userColor) {
      const mv = this.solution[this.step];
      this.applyMove(mv.from, mv.to, mv.promotion);
      this.step++;
    }
    if (this.step >= this.solution.length) this.done = true;
  }

  private applyMove(from: string, to: string, promotion?: MoveDto['promotion']) {
    const next = { ...this.board };
    const piece = next[from];
    next[from] = '.';
    next[to] = (promotion && piece && piece.toLowerCase() === 'p')
      ? this.promote(piece, promotion)
      : piece;
    this.board = next;
  }

  private promote(p: Piece, promo: 'q'|'r'|'b'|'n'): Piece {
    const isW = p === p.toUpperCase();
    const map = { q: isW ? 'Q':'q', r: isW ? 'R':'r', b: isW ? 'B':'b', n: isW ? 'N':'n' } as const;
    return map[promo];
  }

  // ---------- Render helpers ----------
  squares(): string[] {
    const res: string[] = [];
    for (const r of this.ranks) for (const f of this.files) res.push(`${f}${r}`);
    return res;
  }

  isDark(i: number) { const f=i%8, r=Math.floor(i/8); return (f+r)%2===1; }

  cssSquare(i: number, sq: string) {
    return {
      square: true,
      dark: this.isDark(i),
      light: !this.isDark(i),
      selected: this.selected===sq,
      hint: this.hintFrom===sq,
      bad: this.flashBad===sq
    };
  }

  isWhitePiece(p?: Piece) {
    if (!p || p === '.') return false;
    return p === p.toUpperCase();
  }

  glyph(p?: Piece): string {
    const m: Record<string,string> = {
      'P':'♙','N':'♘','B':'♗','R':'♖','Q':'♕','K':'♔',
      'p':'♟','n':'♞','b':'♝','r':'♜','q':'♛','k':'♚','.' : ''
    };
    return m[p ?? '.'] ?? '';
  }

  // ---------- FEN ----------
  private fenToBoard(fen: string): Record<string, Piece> {
    const [placement] = fen.trim().split(' ');
    const rows = placement.split('/');
    const map: Record<string, Piece> = {};
    let rank = 8;

    for (const row of rows) {
      let fileIdx = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) fileIdx += parseInt(ch,10);
        else {
          const sq = `${this.files[fileIdx]}${rank}`;
          map[sq] = ch as Piece;
          fileIdx++;
        }
      }
      rank--;
    }
    for (let r=1; r<=8; r++) for (const f of this.files) {
      const sq = `${f}${r}`; if (!map[sq]) map[sq] = '.';
    }
    return map;
  }
}

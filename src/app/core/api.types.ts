// API-Typen passend zu deinem Backend (DTOs aus den hochgeladenen Java-Dateien)

// --- Auth ---
export interface AuthResponse { accessToken: string; }
export interface MeRes { authenticated: boolean; principal?: string; }

// --- Games: Open Games (Browse) ---
export interface OpenGameView {
  id: number;
  whiteId: number | null;
  blackId: number | null;
  timeControl: string;
  createdAt: string;
  freeSeat: 'WHITE' | 'BLACK' | 'EITHER' | null;
}

// --- Games: Details (+ Clock Snapshot + Turn) ---
export type NextToMove = 'WHITE' | 'BLACK' | null;

export interface GameDetails {
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
  drawOfferBy?: number;
}


// --- Moves ---
export interface MoveItem {
  id: number;
  gameId: number;
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  playedMs: number;
}

// --- Clock (separat) ---
export interface ClockRes {
  whiteMs: number;
  blackMs: number;
  running: boolean;
  status: string; // GameStatus
}

// --- Submit Move ---
export interface PostMoveReq {
  san: string;
  uci: string;
  fenAfter: string;
  playedMs?: number;
}

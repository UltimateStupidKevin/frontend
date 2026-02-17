export type EngineScorePerspective = 'white';

export interface EnginePingResponse {
  ok: boolean;
  engineName: string;
}

export interface EngineAnalyseRequest {
  fen: string;
  /**
   * Optional: wenn gesetzt, bevorzugt die Engine eine Zeitsteuerung.
   * Backend kann stattdessen depth nutzen.
   */
  movetimeMs?: number;
  /**
   * Optional: fixe Suchtiefe.
   * Wenn beides gesetzt ist (movetimeMs & depth), entscheidet das Backend.
   */
  depth?: number;
  /** Anzahl Varianten (MultiPV). */
  multiPv?: number;
}

export interface EngineAnalyseLine {
  rank: number;
  depth: number;
  /** Bewertung in Centipawns aus scorePerspective-Sicht. */
  scoreCp: number | null;
  /** Mate in N (positiv = Weiß matt, negativ = Schwarz matt) */
  mate: number | null;
  /** Principal variation als UCI-Züge, z.B. ["e2e4", "e7e5"] */
  pv: string[];
}

export interface EngineAnalyseResponse {
  bestMoveUci: string;
  scorePerspective: EngineScorePerspective;
  lines: EngineAnalyseLine[];
}

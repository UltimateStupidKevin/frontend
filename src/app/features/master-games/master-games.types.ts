export type MasterGameResult = '1-0' | '0-1' | '1/2-1/2' | '*' | string;

export interface MasterGameListItem {
  id: number;
  event?: string | null;
  site?: string | null;
  gameDate?: string | null;
  white?: string | null;
  black?: string | null;
  result?: MasterGameResult | null;
}

export interface MasterGameDetail extends MasterGameListItem {
  pgn: string;
}

export interface MasterGamesPage {
  items: MasterGameListItem[];
  total: number;
  page: number;
  size: number;
}

export interface MasterGameSearchParams {
  q?: string;
  white?: string;
  black?: string;
  event?: string;
  site?: string;
  result?: string;
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
  page?: number;
  size?: number;
  sort?: string;
}

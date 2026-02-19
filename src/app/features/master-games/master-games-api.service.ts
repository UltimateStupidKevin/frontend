import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom, retry, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from '../../core/auth/token-storage.service';
import { MasterGameDetail, MasterGameSearchParams, MasterGamesPage } from './master-games.types';

@Injectable({ providedIn: 'root' })
export class MasterGamesApiService {
  private base = (environment.apiBase ?? '').replace(/\/+$/, '');
  private endpoint = `${this.base}/master-games`;

  constructor(
    private http: HttpClient,
    private tokenStore: TokenStorageService,
  ) {}

  async list(params: MasterGameSearchParams): Promise<MasterGamesPage> {
    const headers = this.buildAuthHeaders();

    let hp = new HttpParams();
    const add = (k: string, v: unknown) => {
      if (v === undefined || v === null) return;
      const s = String(v).trim();
      if (!s) return;
      hp = hp.set(k, s);
    };

    add('q', params.q);
    add('white', params.white);
    add('black', params.black);
    add('event', params.event);
    add('result', params.result);
    add('from', params.from);
    add('to', params.to);
    add('page', params.page ?? 0);
    add('size', params.size ?? 20);
    add('sort', params.sort);

    const raw = await firstValueFrom(
      this.http
        .get<any>(this.endpoint, { params: hp, headers })
        .pipe(timeout({ first: 12_000 }), retry({ count: 1, delay: 250 })),
    );

    return this.normalizePage(raw, params.page ?? 0, params.size ?? 20);
  }

  async getById(id: number): Promise<MasterGameDetail> {
    const headers = this.buildAuthHeaders();

    const raw = await firstValueFrom(
      this.http
        .get<any>(`${this.endpoint}/${id}`, { headers })
        .pipe(timeout({ first: 12_000 }), retry({ count: 1, delay: 250 })),
    );

    const mapped = this.mapDetail(raw);
    if (!mapped?.pgn) throw new Error('master_game_missing_pgn');
    return mapped;
  }

  private buildAuthHeaders(): HttpHeaders {
    const token = this.tokenStore.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private normalizePage(raw: any, fallbackPage: number, fallbackSize: number): MasterGamesPage {
    const arr: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw?.content)
          ? raw.content
          : [];

    const items = arr
      .map((x) => this.mapListItem(x))
      .filter((x) => !!x && Number.isFinite(x.id));

    const total =
      this.num(raw?.totalElements) ??
      this.num(raw?.total) ??
      this.num(raw?.totalCount) ??
      items.length;

    const page = this.num(raw?.number) ?? this.num(raw?.page) ?? fallbackPage;
    const size = this.num(raw?.size) ?? fallbackSize;

    return { items, total, page, size };
  }

  private mapListItem(x: any) {
    return {
      id: Number(x?.id),
      event: x?.event ?? null,
      site: x?.site ?? null,
      gameDate: x?.gameDate ?? x?.game_date ?? x?.date ?? null,
      white: x?.white ?? null,
      black: x?.black ?? null,
      result: x?.result ?? null,
    };
  }

  private mapDetail(x: any) {
    const base = this.mapListItem(x);
    return {
      ...base,
      pgn: String(x?.pgn ?? ''),
    };
  }

  private num(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}

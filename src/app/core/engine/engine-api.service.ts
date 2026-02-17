import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout, retry } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EngineAnalyseRequest,
  EngineAnalyseResponse,
  EnginePingResponse,
} from './engine.types';

@Injectable({ providedIn: 'root' })
export class EngineApiService {
  private base = environment.apiBase.replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  ping(): Promise<EnginePingResponse> {
    return firstValueFrom(
      this.http.get<EnginePingResponse>(`${this.base}/api/engine/ping`).pipe(
        timeout({ first: 8_000 }),
        retry({ count: 1, delay: 250 }),
      ),
    );
  }

  analyse(req: EngineAnalyseRequest): Promise<EngineAnalyseResponse> {
    return firstValueFrom(
      this.http
        .post<EngineAnalyseResponse>(`${this.base}/api/engine/analyse`, req)
        .pipe(timeout({ first: 30_000 }), retry({ count: 1, delay: 350 })),
    );
  }
}

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

type CreateResponse = { id?: number; gameId?: number };

@Component({
  standalone: true,
  selector: 'app-create-game',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-game.page.html',
  styleUrls: ['./create-game.page.scss'],
})
export class CreateGamePage {
  private http = inject(HttpClient);
  private router = inject(Router);

  // Presets ähnlich chess.com
  presets = [
    { label: '1 | 0',  m: 1,  inc: 0 },
    { label: '3 | 0',  m: 3,  inc: 0 },
    { label: '5 | 0',  m: 5,  inc: 0 },
    { label: '10 | 0', m: 10, inc: 0 },
    { label: '15 | 10', m: 15, inc: 10 },
  ];
  selectedPresetIdx: number | null = 2; // default 5|0

  minutes = 5;
  increment = 0;

  side: 'white' | 'black' | 'random' = 'random';
  error: string | null = null;
  busy = false;

  onSelectPreset(i: number) {
    this.selectedPresetIdx = i;
    this.minutes = this.presets[i].m;
    this.increment = this.presets[i].inc;
  }

  onCustomChange() {
    this.selectedPresetIdx = null; // Custom überschreibt Preset
    if (this.minutes < 0) this.minutes = 0;
    if (this.increment < 0) this.increment = 0;
  }

  get timeControl(): string {
    const m = Math.max(0, Math.floor(this.minutes));
    const inc = Math.max(0, Math.floor(this.increment));
    return `${m}+${inc}`;
  }

  async create() {
    this.error = null;
    if (this.busy) return;
    this.busy = true;
    try {
      const body = { timeControl: this.timeControl, side: this.side };
      const res = await this.http.post<CreateResponse>(`${environment.apiBase}/match/create`, body).toPromise();
      const id = (res?.id ?? res?.gameId);
      if (!id) throw new Error('create_failed_no_id');
      await this.router.navigate(['/games', id]);
    } catch (e: any) {
      this.error = e?.error || e?.message || 'Erstellen fehlgeschlagen.';
    } finally {
      this.busy = false;
    }
  }
}

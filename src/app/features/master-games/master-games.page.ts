import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MasterGamesApiService } from './master-games-api.service';
import { MasterGameListItem } from './master-games.types';

@Component({
  standalone: true,
  selector: 'app-master-games',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './master-games.page.html',
  styleUrls: ['./master-games.page.scss'],
})
export class MasterGamesPage implements OnInit {
  private api = inject(MasterGamesApiService);

  // Filters
  q = signal<string>('');
  player = signal<string>(''); 
  event = signal<string>('');
  result = signal<string>('');
  from = signal<string>('');
  to = signal<string>('');

  // Paging
  page = signal<number>(0);
  size = signal<number>(20);

  // Data
  items = signal<MasterGameListItem[]>([]);
  total = signal<number>(0);

  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  pageCount = computed(() => {
    const t = this.total();
    const s = this.size();
    if (!s) return 1;
    return Math.max(1, Math.ceil(t / s));
  });

  canPrev = computed(() => this.page() > 0);
  canNext = computed(() => this.page() + 1 < this.pageCount());

  ngOnInit(): void {
    void this.search(true);
  }

  async search(resetPage: boolean = false) {
    if (resetPage) this.page.set(0);

    this.loading.set(true);
    this.error.set(null);

    try {
      const effectiveQ = (this.player().trim() || this.q().trim()).trim();

      const res = await this.api.list({
        q: effectiveQ || undefined,
        event: this.event().trim() || undefined,
        result: this.result().trim() || undefined,
        from: this.from().trim() || undefined,
        to: this.to().trim() || undefined,
        page: this.page(),
        size: this.size(),
      });

      this.items.set(res.items);
      this.total.set(res.total);
    } catch (e: any) {
      const status = e?.status;
      if (status === 403) this.error.set('Zugriff verweigert (403).');
      else this.error.set(String(e?.error ?? e?.message ?? 'Konnte Meister-Partien nicht laden.'));
    } finally {
      this.loading.set(false);
    }
  }

  async reset() {
    this.q.set('');
    this.player.set('');
    this.event.set('');
    this.result.set('');
    this.from.set('');
    this.to.set('');
    this.size.set(20);
    this.page.set(0);
    await this.search(true);
  }

  async prev() {
    if (!this.canPrev()) return;
    this.page.set(this.page() - 1);
    await this.search(false);
  }

  async next() {
    if (!this.canNext()) return;
    this.page.set(this.page() + 1);
    await this.search(false);
  }
}

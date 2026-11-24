import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { MetaService } from './meta.service';

export interface MenuEntry { label: string; route: string; icon?: string | null; }

/** Navigation menu. Dynamic systems load it from the database (GET /api/menu); others use a fixed menu built from the entities. */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly meta = inject(MetaService);

  readonly items = signal<MenuEntry[]>([]);

  async load(): Promise<void> {
    if (this.meta.dynamicMenu()) {
      try {
        this.items.set(await firstValueFrom(this.http.get<MenuEntry[]>(`${this.config.apiBaseUrl}/menu`)));
        return;
      } catch {
        /* fall back to the static menu below */
      }
    }
    this.items.set(this.fixed());
  }

  private fixed(): MenuEntry[] {
    return [
      { label: 'Dashboard', route: '/', icon: 'home' },
      ...this.meta.entities().map((e) => ({ label: e.plural, route: '/e/' + e.route, icon: e.icon }))
    ];
  }
}

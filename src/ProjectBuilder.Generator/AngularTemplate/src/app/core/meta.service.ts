import { Injectable, signal } from '@angular/core';

export type FieldType = 'String' | 'Text' | 'Int' | 'Long' | 'Decimal' | 'Bool' | 'Date' | 'DateTime' | 'Guid' | 'Email' | 'Phone';
export interface FieldMeta { key: string; label: string; type: FieldType; required: boolean; maxLength?: number; }
export interface RelationMeta { key: string; label: string; target: string; required: boolean; }
export interface EntityMeta {
  name: string; label: string; plural: string; route: string;
  /** Field shown when a record is referenced from another screen. */
  display: string; icon: string;
  fields: FieldMeta[]; relations: RelationMeta[];
}
interface MetaFile { appName: string; dynamicMenu: boolean; accessControl?: boolean; entities: EntityMeta[]; }

/**
 * Describes the system (entities, fields, links). Generated into public/entities.json, so labels and fields
 * can be tweaked after deployment without rebuilding the app.
 */
@Injectable({ providedIn: 'root' })
export class MetaService {
  readonly appName = signal('');
  readonly dynamicMenu = signal(false);
  /** True when the system has modules, roles and permissions (the Administration screens). */
  readonly accessControl = signal(false);
  readonly entities = signal<EntityMeta[]>([]);

  async load(): Promise<void> {
    try {
      const res = await fetch('entities.json', { cache: 'no-store' });
      if (!res.ok) return;
      const meta = (await res.json()) as MetaFile;
      this.appName.set(meta.appName);
      this.dynamicMenu.set(meta.dynamicMenu === true);
      this.accessControl.set(meta.accessControl === true);
      this.entities.set(meta.entities ?? []);
      document.title = meta.appName;
    } catch {
      /* the app shows "Unknown section" screens if the file is missing */
    }
  }

  byRoute(route: string): EntityMeta | undefined { return this.entities().find((e) => e.route === route); }
  byName(name: string): EntityMeta | undefined { return this.entities().find((e) => e.name === name); }
}

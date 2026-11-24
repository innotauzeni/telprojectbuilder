export type DbProvider = 'Sqlite' | 'SqlServer' | 'PostgreSql' | 'MySql' | 'Oracle';
export type FieldType = 'String' | 'Text' | 'Int' | 'Long' | 'Decimal' | 'Bool' | 'Date' | 'DateTime' | 'Guid' | 'Email' | 'Phone';

export const FIELD_TYPES: FieldType[] = ['String', 'Text', 'Int', 'Long', 'Decimal', 'Bool', 'Date', 'DateTime', 'Guid', 'Email', 'Phone'];

export interface FieldDef { name: string; type: FieldType; required: boolean; unique: boolean; maxLength?: number | null; }
export interface RelationDef { name: string; targetEntity: string; required: boolean; }
export interface EntityDef { name: string; fields: FieldDef[]; relations: RelationDef[]; }

/** Mirrors the server's AppDefinition. `targets` is a flags enum serialized as e.g. "WebApi, WebApp, Docker". */
export interface AppDef {
  schemaVersion: number;
  name: string;
  database: DbProvider;
  targets: string;
  /** Store the navigation menu in a database table (MenuItems), served per role and editable by admins. */
  dynamicMenu: boolean;
  entities: EntityDef[];
}

export interface ProjectSummary { id: string; name: string; entityCount: number; updatedUtc: string; }
export interface TemplateInfo { key: string; name: string; entityCount: number; }
export interface GeneratedFile { path: string; content: string; }

export function hasTarget(def: AppDef, target: string): boolean {
  return def.targets.split(',').map((t) => t.trim()).includes(target);
}

export function setTarget(def: AppDef, target: string, on: boolean): void {
  const set = new Set(def.targets.split(',').map((t) => t.trim()).filter((t) => t && t !== 'None'));
  if (on) set.add(target); else set.delete(target);
  set.add('WebApi'); // the API is always generated
  def.targets = [...set].join(', ');
}

/** Same rule as the server, used only to show the API address hint next to an entity. */
export function plural(name: string): string {
  if (!name) return '';
  if (/y$/i.test(name) && name.length > 1 && !/[aeiou]/i.test(name[name.length - 2])) return name.slice(0, -1) + 'ies';
  if (/(s|x|ch|sh)$/i.test(name)) return name + 'es';
  return name + 's';
}

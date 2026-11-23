// Placeholder so the template type-checks on its own; the generator replaces this file with your system's description.
export type FieldType = 'String' | 'Text' | 'Int' | 'Long' | 'Decimal' | 'Bool' | 'Date' | 'DateTime' | 'Guid' | 'Email' | 'Phone';
export interface FieldMeta { key: string; label: string; type: FieldType; required: boolean; maxLength?: number; }
export interface RelationMeta { key: string; label: string; target: string; required: boolean; }
export interface EntityMeta { name: string; label: string; plural: string; route: string; display: string; fields: FieldMeta[]; relations: RelationMeta[]; }
export const APP_NAME = '__APP_NAME__';
export const ENTITIES: EntityMeta[] = [];

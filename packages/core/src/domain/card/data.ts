export interface GenericRecord {
  [key: string]: unknown;
}

export interface CardLike {
  name?: string;
  data?: GenericRecord & {
    name?: string;
    character_book?: {
      entries?: unknown[];
    };
    extensions?: {
      risuai?: {
        _moduleLorebook?: unknown[];
        customScripts?: unknown[];
        defaultVariables?: unknown;
      };
    };
  };
}

export function asRecord(value: unknown): GenericRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRecord)
    : null;
}

export function getCardName(card: unknown): string {
  const obj = asRecord(card) as CardLike | null;
  const fromData = typeof obj?.data?.name === 'string' ? obj.data.name : '';
  const fromRoot = typeof obj?.name === 'string' ? obj.name : '';
  return fromData || fromRoot || 'Unknown';
}

export function getCharacterBookEntries(card: unknown): GenericRecord[] {
  const obj = asRecord(card) as CardLike | null;
  const entries = obj?.data?.character_book?.entries;
  return Array.isArray(entries)
    ? entries.filter((entry): entry is GenericRecord => Boolean(asRecord(entry)))
    : [];
}

export function getModuleLorebookEntries(card: unknown): GenericRecord[] {
  const obj = asRecord(card) as CardLike | null;
  const entries = obj?.data?.extensions?.risuai?._moduleLorebook;
  return Array.isArray(entries)
    ? entries.filter((entry): entry is GenericRecord => Boolean(asRecord(entry)))
    : [];
}

export function getAllLorebookEntries(card: unknown): GenericRecord[] {
  return [...getCharacterBookEntries(card), ...getModuleLorebookEntries(card)];
}

export function getCustomScripts(card: unknown): GenericRecord[] {
  const obj = asRecord(card) as CardLike | null;
  const scripts = obj?.data?.extensions?.risuai?.customScripts;
  return Array.isArray(scripts)
    ? scripts.filter((script): script is GenericRecord => Boolean(asRecord(script)))
    : [];
}

export function getDefaultVariablesRaw(card: unknown): unknown {
  const obj = asRecord(card) as CardLike | null;
  return obj?.data?.extensions?.risuai?.defaultVariables;
}

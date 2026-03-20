export interface GenericRecord {
  [key: string]: unknown;
}

export function asRecord(value: unknown): GenericRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as GenericRecord)
    : null;
}

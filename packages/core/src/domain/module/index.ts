import { asRecord, type GenericRecord } from '../types';

/** 순수 module 객체에서 lorebook entry 배열을 반환한다. */
export function getModuleLorebookEntriesFromModule(module: unknown): GenericRecord[] {
  return toRecordArray(asRecord(module)?.lorebook);
}

/** 순수 module 객체에서 regex script 배열을 반환한다. */
export function getModuleRegexScriptsFromModule(module: unknown): GenericRecord[] {
  return toRecordArray(asRecord(module)?.regex);
}

/** 순수 module 객체에서 trigger 배열을 반환한다. */
export function getModuleTriggersFromModule(module: unknown): GenericRecord[] {
  return toRecordArray(asRecord(module)?.trigger);
}

/** 순수 module 객체에서 background embedding HTML을 반환한다. */
export function getModuleBackgroundEmbeddingFromModule(module: unknown): string {
  const value = asRecord(module)?.backgroundEmbedding;
  return typeof value === 'string' ? value : '';
}

function toRecordArray(value: unknown): GenericRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asRecord(entry)).filter((entry): entry is GenericRecord => entry != null);
}

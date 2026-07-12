import { HMR_ASSET_PLACEHOLDER_PREFIX } from './protocol';

export const PRESERVED_CHARACTER_KEYS = ['chats', 'chatPage', 'chaId'] as const;

type JsonLikeRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is JsonLikeRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPreservedCharacterKey(key: string): key is (typeof PRESERVED_CHARACTER_KEYS)[number] {
  return PRESERVED_CHARACTER_KEYS.some((preservedKey) => preservedKey === key);
}

export function mergeCharacterDefinition(
  existing: Record<string, unknown>,
  definition: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(definition)) {
    if (isPreservedCharacterKey(key)) {
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export function applyAssetPlaceholders<T>(value: T, resolve: (hash: string) => string): T {
  if (typeof value === 'string') {
    if (value.startsWith(HMR_ASSET_PLACEHOLDER_PREFIX)) {
      return resolve(value.slice(HMR_ASSET_PLACEHOLDER_PREFIX.length)) as T;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyAssetPlaceholders(item, resolve)) as T;
  }

  if (isPlainRecord(value)) {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = applyAssetPlaceholders(item, resolve);
    }

    return output as T;
  }

  return value;
}

export function findCharacterIndexByChaId(characters: readonly unknown[], chaId: string): number {
  return characters.findIndex((candidate) => {
    if (!isPlainRecord(candidate)) {
      return false;
    }

    return candidate['chaId'] === chaId && candidate['type'] !== 'group';
  });
}

export function replaceModuleById(
  modules: readonly unknown[],
  moduleId: string,
  incoming: Record<string, unknown>,
): unknown[] | null {
  const index = modules.findIndex((candidate) => isPlainRecord(candidate) && candidate['id'] === moduleId);

  if (index < 0) {
    return null;
  }

  const next = [...modules];
  next[index] = { ...incoming, id: moduleId };
  return next;
}

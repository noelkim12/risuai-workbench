import { Buffer } from 'node:buffer';

import {
  RISULUA_RUNTIME_LIMITS,
  type RisuLuaJsonValue,
} from './contracts';

export interface Utf8Preview {
  text: string;
  byteLength: number;
  truncated: boolean;
}

export function previewUtf8(value: string, maxBytes: number): Utf8Preview {
  const byteLength = Buffer.byteLength(value, 'utf8');
  if (byteLength <= maxBytes) return { text: value, byteLength, truncated: false };

  let usedBytes = 0;
  let text = '';
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (usedBytes + characterBytes > maxBytes) break;
    text += character;
    usedBytes += characterBytes;
  }
  return { text: `${text}…`, byteLength, truncated: true };
}

export function normalizeRisuLuaJsonValue(value: unknown): RisuLuaJsonValue {
  const ancestors = new Set<object>();
  let entries = 0;

  const visit = (current: unknown, depth: number): RisuLuaJsonValue => {
    if (depth > RISULUA_RUNTIME_LIMITS.maxValueDepth) {
      throw new Error(`RisuLua value exceeds maximum depth ${RISULUA_RUNTIME_LIMITS.maxValueDepth}`);
    }
    if (current === null || typeof current === 'boolean' || typeof current === 'string') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new Error('RisuLua numeric values must be finite');
      return current;
    }
    if (typeof current !== 'object') {
      throw new Error(`Unsupported RisuLua value type: ${typeof current}`);
    }
    if (ancestors.has(current)) throw new Error('Cyclic RisuLua table-like value is not supported');

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        entries += current.length;
        assertEntryLimit(entries);
        return current.map((item) => visit(item, depth + 1));
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('Unsupported RisuLua object prototype');
      }
      const source = current as Record<string, unknown>;
      const keys = Object.keys(source).sort();
      entries += keys.length;
      assertEntryLimit(entries);
      const normalized: Record<string, RisuLuaJsonValue> = {};
      for (const key of keys) normalized[key] = visit(source[key], depth + 1);
      return normalized;
    } finally {
      ancestors.delete(current);
    }
  };

  return visit(value, 0);
}

function assertEntryLimit(entries: number): void {
  if (entries > RISULUA_RUNTIME_LIMITS.maxValueEntries) {
    throw new Error(`RisuLua value exceeds maximum entries ${RISULUA_RUNTIME_LIMITS.maxValueEntries}`);
  }
}

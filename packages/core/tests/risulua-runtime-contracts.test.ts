import { describe, expect, it } from 'vitest';

import {
  RISULUA_RUNTIME_LIMITS,
  type RisuLuaDiagnostic,
} from '../src/node/risulua-runtime/contracts';
import {
  validateRuntimeModuleId,
  validateRuntimeModuleMap,
} from '../src/node/risulua-runtime/module-map';
import {
  normalizeRisuLuaJsonValue,
  previewUtf8,
} from '../src/node/risulua-runtime/value-codec';

describe('RisuLua runtime contracts', () => {
  it.each(['foo', 'foo.bar', 'vg_data'])('accepts module id %s', (moduleId) => {
    expect(validateRuntimeModuleId(moduleId)).toBe(moduleId);
  });

  it.each(['', '..', 'foo/bar', 'foo..bar', '1foo', 'foo\0bar'])('rejects module id %j', (moduleId) => {
    expect(() => validateRuntimeModuleId(moduleId)).toThrow(/module id/i);
  });

  it('rejects a module larger than 2 MiB in UTF-8 bytes', () => {
    expect(() => validateRuntimeModuleMap({
      entryModuleId: 'main',
      modules: { main: '가'.repeat(Math.floor(RISULUA_RUNTIME_LIMITS.maxModuleBytes / 3) + 1) },
    })).toThrow(/2 MiB|module size/i);
  });

  it('rejects a bundle larger than 8 MiB in UTF-8 bytes', () => {
    const chunk = 'x'.repeat(RISULUA_RUNTIME_LIMITS.maxModuleBytes);
    expect(() => validateRuntimeModuleMap({
      entryModuleId: 'm0',
      modules: {
        m0: chunk,
        m1: chunk,
        m2: chunk,
        m3: chunk,
        m4: 'x',
      },
    })).toThrow(/8 MiB|bundle size/i);
  });

  it('normalizes JSON-compatible values and rejects unsupported values', () => {
    expect(normalizeRisuLuaJsonValue({
      empty: null,
      enabled: true,
      count: 3,
      label: 'ok',
      list: [1, 'two'],
    })).toEqual({
      empty: null,
      enabled: true,
      count: 3,
      label: 'ok',
      list: [1, 'two'],
    });
    expect(() => normalizeRisuLuaJsonValue(Number.NaN)).toThrow(/finite/i);
    expect(() => normalizeRisuLuaJsonValue(() => undefined)).toThrow(/unsupported/i);
  });

  it('rejects excessive value depth and aggregate entries', () => {
    let nested: unknown = 'leaf';
    for (let index = 0; index < 21; index += 1) nested = [nested];

    expect(() => normalizeRisuLuaJsonValue(nested)).toThrow(/depth/i);
    expect(() => normalizeRisuLuaJsonValue(Array.from({ length: 1_001 }, (_, index) => index))).toThrow(/entries/i);
  });

  it('rejects cyclic table-like values with a bounded diagnostic', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => normalizeRisuLuaJsonValue(cyclic)).toThrow(/cyclic/i);
  });

  it('creates a deterministic UTF-8 byte preview for oversized strings', () => {
    expect(previewUtf8('가나다라마', 7)).toEqual({
      text: '가나…',
      byteLength: 15,
      truncated: true,
    });
    expect(previewUtf8('small', 7)).toEqual({
      text: 'small',
      byteLength: 5,
      truncated: false,
    });
  });

  it('keeps diagnostic ids as a closed contract', () => {
    const diagnostic: RisuLuaDiagnostic = {
      id: 'RUNTIME_VALUE_LIMIT',
      message: 'value exceeded a runtime boundary',
    };
    expect(diagnostic.id).toBe('RUNTIME_VALUE_LIMIT');
  });
});

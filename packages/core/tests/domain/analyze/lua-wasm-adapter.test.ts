import { describe, expect, it } from 'vitest';
import { analyzeLuaWithBackend } from '../../../src/domain/analyze/lua-analysis-backend';
import { analyzeLuaWithWasm, normalizeLuaWasmResult } from '../../../src/domain/analyze/lua-wasm-adapter';

describe('lua-wasm-adapter', () => {
  it('normalizes compact wasm results with utf16 offsets', () => {
    const normalized = normalizeLuaWasmResult({
      ok: true,
      parser: 'rust-wasm-lua',
      version: 1,
      sourceLengthUtf16: 24,
      sourceLengthBytes: 24,
      totalLines: 1,
      stringLiterals: [
        {
          startUtf16: 10,
          endUtf16: 20,
          contentStartUtf16: 11,
          contentEndUtf16: 19,
          startByte: 10,
          endByte: 20,
          contentStartByte: 11,
          contentEndByte: 19,
          quoteKind: 'double',
          hasCbsMarker: true,
        },
      ],
      stateAccesses: [],
      diagnostics: [],
      error: null,
    });

    expect(normalized.ok).toBe(true);
    expect(normalized.stringLiterals[0]?.contentStartUtf16).toBe(11);
    expect(normalized.stringLiterals[0]?.hasCbsMarker).toBe(true);
  });

  it('rejects unsupported parser/version and malformed arrays', () => {
    expect(() =>
      normalizeLuaWasmResult({
        ok: true,
        parser: 'other-parser',
        version: 1,
        stringLiterals: [],
        stateAccesses: [],
        diagnostics: [],
      }),
    ).toThrow(/unsupported result version/);

    expect(() =>
      normalizeLuaWasmResult({
        ok: true,
        parser: 'rust-wasm-lua',
        version: 1,
        sourceLengthUtf16: 0,
        sourceLengthBytes: 0,
        totalLines: 1,
        stringLiterals: {},
        stateAccesses: [],
        diagnostics: [],
        error: null,
      }),
    ).toThrow(/stringLiterals array/);
  });

  it('loads wasm package and analyzes a small lua source', async () => {
    const result = await analyzeLuaWithWasm('local msg = "{{user}}"\ngetState("mood")', {
      includeStringLiterals: true,
      includeStateAccesses: true,
    });

    expect(result.ok).toBe(true);
    expect(result.stringLiterals.some((literal) => literal.hasCbsMarker)).toBe(true);
    expect(result.stateAccesses.some((access) => access.key === 'mood')).toBe(true);
  });
});

describe('lua-analysis-backend', () => {
  it('returns no artifact when disabled', async () => {
    const result = await analyzeLuaWithBackend({
      filePath: 'disabled.risulua',
      source: 'getState("mood")',
      backend: 'disabled',
    });

    expect(result).toEqual({ backend: 'disabled' });
  });

  it('uses luaparse when explicitly requested', async () => {
    const result = await analyzeLuaWithBackend({
      filePath: 'fallback.risulua',
      source: 'getState("mood")',
      backend: 'luaparse',
    });

    expect(result.backend).toBe('luaparse');
    expect(result.artifact?.serialized.stateAccessOccurrences[0]?.key).toBe('mood');
  });

  it('does not fall back to luaparse for oversized risulua when wasm fails', async () => {
    const result = await analyzeLuaWithBackend({
      filePath: 'oversized.risulua',
      source: `${' '.repeat(512 * 1024 + 1)}getState("mood")`,
      analyzeWithWasm: async () => {
        throw new Error('simulated wasm failure');
      },
    });

    expect(result).toEqual({ backend: 'disabled' });
  });
});

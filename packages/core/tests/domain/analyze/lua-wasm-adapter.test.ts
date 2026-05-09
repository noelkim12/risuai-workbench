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
      requireAliases: [
        {
          aliasName: '__button_actions',
          moduleName: 'button_actions.actions',
          aliasStartUtf16: 6,
          aliasEndUtf16: 22,
          moduleStartUtf16: 34,
          moduleEndUtf16: 56,
          statementStartUtf16: 0,
          statementEndUtf16: 58,
          line: 1,
        },
      ],
      memberBridgeAssignments: [
        {
          publicName: 'setHeroineClothes',
          aliasName: '__button_actions',
          memberName: 'setHeroineClothes',
          publicStartUtf16: 59,
          publicEndUtf16: 77,
          aliasStartUtf16: 80,
          aliasEndUtf16: 96,
          memberStartUtf16: 97,
          memberEndUtf16: 115,
          statementStartUtf16: 59,
          statementEndUtf16: 115,
          line: 3,
        },
      ],
      moduleMemberDefinitions: [
        {
          exportName: 'setHeroineClothes',
          containerName: 'M',
          definitionKind: 'table-method-function',
          nameStartUtf16: 10,
          nameEndUtf16: 28,
          definitionStartUtf16: 0,
          definitionEndUtf16: 40,
          line: 1,
        },
      ],
      sourceComments: [
        {
          sourcePath: 'regex/Heroine_옷_설정.risuregex',
          sourceLine: 11,
          sourceCharacter: 0,
          commentStartUtf16: 0,
          commentEndUtf16: 44,
          appliesToStatementStartUtf16: 45,
          line: 2,
        },
      ],
      diagnostics: [],
      error: null,
    });

    expect(normalized.ok).toBe(true);
    expect(normalized.stringLiterals[0]?.contentStartUtf16).toBe(11);
    expect(normalized.stringLiterals[0]?.hasCbsMarker).toBe(true);
    expect(normalized.requireAliases[0]?.moduleName).toBe('button_actions.actions');
    expect(normalized.memberBridgeAssignments[0]?.publicName).toBe('setHeroineClothes');
    expect(normalized.moduleMemberDefinitions[0]?.definitionKind).toBe('table-method-function');
    expect(normalized.sourceComments[0]?.sourcePath).toBe('regex/Heroine_옷_설정.risuregex');
  });

  it('rejects unsupported parser/version and malformed arrays', () => {
    expect(() =>
      normalizeLuaWasmResult({
        ok: true,
        parser: 'other-parser',
        version: 1,
        stringLiterals: [],
        stateAccesses: [],
        requireAliases: [],
        memberBridgeAssignments: [],
        moduleMemberDefinitions: [],
        sourceComments: [],
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
        requireAliases: [],
        memberBridgeAssignments: [],
        moduleMemberDefinitions: [],
        sourceComments: [],
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

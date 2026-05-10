import { describe, it, expect } from 'vitest';
import {
  parseRisuLuaMode,
  stripRisuLuaMode,
  RISULUA_MODE_FLAG,
  RISULUA_MODE_HELP_LINE,
  type RisuLuaMode,
} from '../src/cli/shared/lua-bundler/risulua-mode';

// ── Parser unit tests ───────────────────────────────────────────────

describe('risulua mode parser', () => {
  it('returns null when --risulua-mode is absent', () => {
    const result = parseRisuLuaMode(['--in', '.', '--out', 'out.json']);
    expect(result.mode).toBeNull();
    expect(result.strippedArgv).toEqual(['--in', '.', '--out', 'out.json']);
  });

  it('risulua mode parser accepts classic and modular', () => {
    const classic = parseRisuLuaMode(['--risulua-mode', 'classic']);
    expect(classic.mode).toBe('classic');

    const modular = parseRisuLuaMode(['--risulua-mode', 'modular']);
    expect(modular.mode).toBe('modular');
  });

  it('risulua mode parser rejects invalid values', () => {
    expect(() =>
      parseRisuLuaMode(['--risulua-mode', 'unknown']),
    ).toThrowError(
      `Invalid ${RISULUA_MODE_FLAG} value: "unknown". Must be "classic" or "modular".`,
    );

    // missing value (flag is last arg)
    expect(() => parseRisuLuaMode(['--risulua-mode'])).toThrowError(
      `Invalid ${RISULUA_MODE_FLAG} value: "". Must be "classic" or "modular".`,
    );

    // value looks like another flag
    expect(() =>
      parseRisuLuaMode(['--risulua-mode', '--out']),
    ).toThrowError(
      `Invalid ${RISULUA_MODE_FLAG} value: "--out". Must be "classic" or "modular".`,
    );
  });

  it('strips classic mode flag from argv', () => {
    const result = parseRisuLuaMode([
      '--in',
      '.',
      '--risulua-mode',
      'classic',
      '--out',
      'out.json',
    ]);
    expect(result.mode).toBe('classic');
    expect(result.strippedArgv).toEqual(['--in', '.', '--out', 'out.json']);
  });

  it('strips modular mode flag from argv', () => {
    const result = parseRisuLuaMode([
      '--in',
      '.',
      '--risulua-mode',
      'modular',
      '--out',
      'out.json',
    ]);
    expect(result.mode).toBe('modular');
    expect(result.strippedArgv).toEqual(['--in', '.', '--out', 'out.json']);
  });

  it('produces a fresh copy of argv when flag is absent', () => {
    const original = ['--in', '.'];
    const result = parseRisuLuaMode(original);
    expect(result.strippedArgv).not.toBe(original);
    expect(result.strippedArgv).toEqual(original);
  });

  it('preserves all other args when flag is present', () => {
    const result = parseRisuLuaMode([
      'positional',
      '--in',
      'dir',
      '--risulua-mode',
      'classic',
      '--out',
      'file.json',
      '--verbose',
    ]);
    expect(result.mode).toBe('classic');
    expect(result.strippedArgv).toEqual([
      'positional',
      '--in',
      'dir',
      '--out',
      'file.json',
      '--verbose',
    ]);
  });
});

// ── stripRisuLuaMode utility ────────────────────────────────────────

describe('stripRisuLuaMode', () => {
  it('returns a copy when flag absent', () => {
    const original = ['--in', '.'];
    const result = stripRisuLuaMode(original);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
  });

  it('strips --risulua-mode and its value', () => {
    const result = stripRisuLuaMode([
      '--in',
      '.',
      '--risulua-mode',
      'classic',
    ]);
    expect(result).toEqual(['--in', '.']);
  });
});

// ── Constants ───────────────────────────────────────────────────────

describe('risulua mode constants', () => {
  it('exports the flag name', () => {
    expect(RISULUA_MODE_FLAG).toBe('--risulua-mode');
  });

  it('help line mentions both classic and modular', () => {
    expect(RISULUA_MODE_HELP_LINE).toContain('classic');
    expect(RISULUA_MODE_HELP_LINE).toContain('modular');
    expect(RISULUA_MODE_HELP_LINE).toContain('--risulua-mode');
  });
});

// ── Type narrowing smoke test ───────────────────────────────────────

describe('risulua mode type narrowing', () => {
  it('null represents absent option for future auto-detect', () => {
    const result = parseRisuLuaMode([]);
    // Type is RisuLuaMode | null; runtime value is null
    expect(result.mode).toBeNull();
  });

  it('valid modes are assignable to RisuLuaMode', () => {
    const result = parseRisuLuaMode(['--risulua-mode', 'classic']);
    if (result.mode !== null) {
      const _typeCheck: RisuLuaMode = result.mode;
      expect(['classic', 'modular']).toContain(_typeCheck);
    }
  });
});

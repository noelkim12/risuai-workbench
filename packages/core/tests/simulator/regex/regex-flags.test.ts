import { describe, expect, it } from 'vitest';
import { parseRisuRegexFlags } from '../../../src/simulator';

describe('parseRisuRegexFlags', () => {
  it('separates native JavaScript flags from RisuAI directives', () => {
    const parsed = parseRisuRegexFlags('gi<cbs><move_top><order 2>');

    expect(parsed.raw).toBe('gi<cbs><move_top><order 2>');
    expect(parsed.jsFlags).toBe('gi');
    expect(parsed.directives.map((directive) => directive.raw)).toEqual([
      '<cbs>',
      '<move_top>',
      '<order 2>',
    ]);
    expect(parsed.directives).toEqual([
      { kind: 'cbs', raw: '<cbs>' },
      { kind: 'move_top', raw: '<move_top>' },
      { kind: 'order', raw: '<order 2>', order: 2 },
    ]);
    expect(parsed.directives[2]).toMatchObject({ order: 2 });
    expect(parsed.unknownTokens).toEqual([]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('reports duplicate flags, unknown tokens, and invalid order directives', () => {
    const parsed = parseRisuRegexFlags('ggz<unknown><order nope>');

    expect(parsed.raw).toBe('ggz<unknown><order nope>');
    expect(parsed.jsFlags).toBe('g');
    expect(parsed.directives).toEqual([]);
    expect(parsed.unknownTokens).toEqual(['z', '<unknown>', '<order nope>']);
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'RISUREGEX_FLAG_DUPLICATE_JS_FLAG',
      'RISUREGEX_FLAG_UNKNOWN_TOKEN',
      'RISUREGEX_FLAG_UNKNOWN_TOKEN',
      'RISUREGEX_FLAG_INVALID_ORDER',
    ]);
  });
});

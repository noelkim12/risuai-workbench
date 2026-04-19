import { describe, expect, it } from 'vitest';

import { extractCBSVarOps } from '../../../src/domain';

describe('extractCBSVarOps', () => {
  it('adds getvar names to reads', () => {
    const result = extractCBSVarOps('{{getvar::varName}}');

    expect(Array.from(result.reads).sort()).toEqual(['varName']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('adds setvar names to writes', () => {
    const result = extractCBSVarOps('{{setvar::varName}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['varName']);
  });

  it('adds addvar names to writes', () => {
    const result = extractCBSVarOps('{{addvar::varName}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['varName']);
  });

  it('adds setdefaultvar names to writes', () => {
    const result = extractCBSVarOps('{{setdefaultvar::varName::fallback}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['varName']);
  });

  it('returns empty read and write sets for an empty string', () => {
    const result = extractCBSVarOps('');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('captures both reads and writes from mixed operations', () => {
    const result = extractCBSVarOps('{{setvar::a}} {{getvar::b}}');

    expect(Array.from(result.reads).sort()).toEqual(['b']);
    expect(Array.from(result.writes).sort()).toEqual(['a']);
  });

  it('ignores getvar without an argument', () => {
    const result = extractCBSVarOps('{{getvar}}');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('collects variable operations from normal block bodies', () => {
    const result = extractCBSVarOps(
      '{{#when::ready}}before {{getvar::inside}} {{setvar::written::1}}{{/}}',
    );

    expect(Array.from(result.reads).sort()).toEqual(['inside']);
    expect(Array.from(result.writes).sort()).toEqual(['written']);
  });

  it('ignores variable operations that appear inside pure-mode block bodies', () => {
    const result = extractCBSVarOps(
      '{{#escape}}before {{getvar::hidden}} {{setvar::ignored::1}}{{/}} {{getvar::visible}}',
    );

    expect(Array.from(result.reads).sort()).toEqual(['visible']);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('ignores dynamic first arguments', () => {
    const result = extractCBSVarOps(
      '{{getvar::{{user}}}} {{setvar::{{bot}}::1}} {{addvar::{{char}}::2}}',
    );

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual([]);
  });

  it('returns best-effort static results without throwing on malformed input', () => {
    expect(() => extractCBSVarOps('{{setvar::safe::1}} {{getvar::')).not.toThrow();

    const result = extractCBSVarOps('{{setvar::safe::1}} {{getvar::');

    expect(Array.from(result.reads).sort()).toEqual([]);
    expect(Array.from(result.writes).sort()).toEqual(['safe']);
  });
});

import { CBSParser } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { ScopeAnalyzer } from '../src/analyzer/scopeAnalyzer';
import { positionToOffset } from '../src/utils/position';

const parser = new CBSParser();
const analyzer = new ScopeAnalyzer();

function analyzeScope(source: string) {
  return analyzer.analyze(parser.parse(source), source);
}

describe('ScopeAnalyzer', () => {
  it('tracks chat, temp, and global variable symbols from fragment-local AST analysis', () => {
    const result = analyzeScope(
      '{{setvar::mood::happy}}{{getvar::mood}}{{addvar::counter::1}}{{settempvar::cache::ok}}{{tempvar::cache}}{{getglobalvar::shared}}',
    );
    const { symbolTable: table, issues } = result;

    expect(table.getVariable('mood', 'chat')).toMatchObject({
      kind: 'chat',
      scope: 'fragment',
      definitionRanges: expect.any(Array),
      references: expect.any(Array),
    });
    expect(table.getVariable('mood', 'chat')?.references).toHaveLength(1);

    expect(table.getVariable('counter', 'chat')?.definitionRanges).toHaveLength(1);
    expect(table.getVariable('counter', 'chat')?.references).toHaveLength(1);

    expect(table.getVariable('cache', 'temp')).toMatchObject({
      kind: 'temp',
      scope: 'fragment',
    });
    expect(table.getVariable('cache', 'temp')?.references).toHaveLength(1);

    expect(table.getVariable('shared', 'global')).toMatchObject({
      kind: 'global',
      scope: 'external',
      definitionRanges: [],
    });
    expect(table.getVariable('shared', 'global')?.references).toHaveLength(1);

    expect(issues.getUndefinedReferences()).toEqual([]);
  });

  it('models #each loop bindings as block-scoped symbols and records orphan slot usage as undefined loop references', () => {
    const result = analyzeScope(
      '{{#each items as item}}{{slot::item}}{{#each others as item}}{{slot::item}}{{/each}}{{slot::item}}{{/each}}{{slot::item}}',
    );
    const { symbolTable: table, issues } = result;

    const loopSymbols = table.getVariables('item', 'loop');

    expect(loopSymbols).toHaveLength(2);
    expect(loopSymbols.map((symbol) => symbol.references.length)).toEqual([2, 1]);
    expect(issues.getUndefinedReferences()).toEqual([
      {
        name: 'item',
        kind: 'loop',
        range: expect.any(Object),
      },
    ]);
    expect(table.getUnusedVariables()).toEqual([]);
  });

  it('records unresolved local references and unused loop bindings from symbol data', () => {
    const result = analyzeScope(
      '{{getvar::missing}}{{gettempvar::cache}}{{#each items as entry}}plain{{/each}}',
    );
    const { symbolTable: table, issues } = result;

    expect(issues.getUndefinedReferences()).toEqual([
      {
        name: 'missing',
        kind: 'chat',
        range: expect.any(Object),
      },
      {
        name: 'cache',
        kind: 'temp',
        range: expect.any(Object),
      },
    ]);

    expect(table.getUnusedVariables()).toEqual([
      expect.objectContaining({
        name: 'entry',
        kind: 'loop',
        scope: 'block',
      }),
    ]);
  });

  it('collects local #func declarations and call:: references in the same fragment', () => {
    const { symbolTable: table } = analyzeScope('{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}');

    expect(table.getFunction('greet')).toMatchObject({
      name: 'greet',
      scope: 'fragment',
      parameters: ['user'],
      definitionRanges: expect.any(Array),
      references: expect.any(Array),
    });
    expect(table.getFunction('greet')?.references).toHaveLength(1);
  });

  it('keeps the active function visible inside nested #each scopes', () => {
    const { issues } = analyzeScope('{{#func greet name}}{{#each users as user}}{{arg::0}}{{/each}}{{/func}}');

    expect(issues.getInvalidArgumentReferences()).toEqual([]);
  });

  it('trims static argument ranges down to the identifier text', () => {
    const source = '{{getvar::   score   }}';
    const { issues } = analyzeScope(source);
    const [reference] = issues.getUndefinedReferences();

    expect(reference?.name).toBe('score');
    expect(reference).toBeDefined();
    if (!reference) {
      return;
    }

    const startOffset = positionToOffset(source, reference.range.start);
    const endOffset = positionToOffset(source, reference.range.end);
    expect(source.slice(startOffset, endOffset)).toBe('score');
  });
});

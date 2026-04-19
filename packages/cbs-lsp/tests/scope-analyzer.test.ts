import { CBSParser } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { ScopeAnalyzer } from '../src/analyzer/scopeAnalyzer';

const parser = new CBSParser();
const analyzer = new ScopeAnalyzer();

function analyzeScope(source: string) {
  return analyzer.analyze(parser.parse(source), source);
}

describe('ScopeAnalyzer', () => {
  it('tracks chat, temp, and global variable symbols from fragment-local AST analysis', () => {
    const table = analyzeScope(
      '{{setvar::mood::happy}}{{getvar::mood}}{{addvar::counter::1}}{{settempvar::cache::ok}}{{tempvar::cache}}{{getglobalvar::shared}}',
    );

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

    expect(table.getUndefinedReferences()).toEqual([]);
  });

  it('models #each loop bindings as block-scoped symbols and ignores slot usage outside the block', () => {
    const table = analyzeScope(
      '{{#each items as item}}{{slot::item}}{{#each others as item}}{{slot::item}}{{/each}}{{slot::item}}{{/each}}{{slot::item}}',
    );

    const loopSymbols = table.getVariables('item', 'loop');

    expect(loopSymbols).toHaveLength(2);
    expect(loopSymbols.map((symbol) => symbol.references.length)).toEqual([2, 1]);
    expect(table.getUndefinedReferences()).toEqual([]);
    expect(table.getUnusedVariables()).toEqual([]);
  });

  it('records unresolved local references and unused loop bindings from symbol data', () => {
    const table = analyzeScope(
      '{{getvar::missing}}{{gettempvar::cache}}{{#each items as entry}}plain{{/each}}',
    );

    expect(table.getUndefinedReferences()).toEqual([
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
    const table = analyzeScope('{{#func greet user}}Hello{{/func}}{{call::greet::Noel}}');

    expect(table.getFunction('greet')).toMatchObject({
      name: 'greet',
      scope: 'fragment',
      parameters: ['user'],
      definitionRanges: expect.any(Array),
      references: expect.any(Array),
    });
    expect(table.getFunction('greet')?.references).toHaveLength(1);
  });
});

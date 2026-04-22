import { describe, expect, it } from 'vitest';
import { CBSBuiltinRegistry } from 'risu-workbench-core';
import {
  DEFERRED_SCOPE_CONTRACT,
  DIAGNOSTIC_TAXONOMY,
  DiagnosticCode,
} from '../src/analyzer/diagnostics';
import { SymbolTable } from '../src/analyzer/symbolTable';
import { routeDiagnosticsForDocument, mapDocumentToCbsFragments } from '../src/utils/diagnostics-router';
import { DefinitionProvider } from '../src/features/definition';
import { FormattingProvider } from '../src/features/formatting';
import { ReferencesProvider } from '../src/features/references';
import { RenameProvider } from '../src/features/rename';
import { getFixtureCorpusEntry, listMatrixFixtures } from './fixtures/fixture-corpus';

describe('diagnostic taxonomy contract', () => {
  it('freezes exact meanings, owners, and severities for canonical codes', () => {
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnclosedMacro]).toEqual({
      category: 'syntax',
      code: DiagnosticCode.UnclosedMacro,
      severity: 'error',
      owner: 'tokenizer',
      meaning: 'Unclosed CBS macro ({{ without matching }})',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnclosedBlock]).toEqual({
      category: 'syntax',
      code: DiagnosticCode.UnclosedBlock,
      severity: 'error',
      owner: 'parser',
      meaning: 'Unclosed CBS block (missing matching block close)',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnknownFunction]).toEqual({
      category: 'syntax',
      code: DiagnosticCode.UnknownFunction,
      severity: 'error',
      owner: 'parser',
      meaning: 'Unknown CBS function or block keyword',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionOperatorSequence]).toEqual({
      category: 'expression',
      code: DiagnosticCode.CalcExpressionOperatorSequence,
      severity: 'error',
      owner: 'analyzer',
      meaning: 'CBS expression sublanguage has an invalid operator sequence',
    });

    expect(
      DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionUnbalancedParentheses],
    ).toEqual({
      category: 'expression',
      code: DiagnosticCode.CalcExpressionUnbalancedParentheses,
      severity: 'error',
      owner: 'analyzer',
      meaning: 'CBS expression sublanguage has unbalanced parentheses',
    });

    expect(
      DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionIncompleteReferenceToken],
    ).toEqual({
      category: 'expression',
      code: DiagnosticCode.CalcExpressionIncompleteReferenceToken,
      severity: 'error',
      owner: 'analyzer',
      meaning: 'CBS expression sublanguage contains an incomplete variable reference token',
    });

    expect(
      DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionInvalidReferenceIdentifier],
    ).toEqual({
      category: 'expression',
      code: DiagnosticCode.CalcExpressionInvalidReferenceIdentifier,
      severity: 'error',
      owner: 'analyzer',
      meaning: 'CBS expression sublanguage contains an invalid variable reference identifier',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.DeprecatedFunction]).toEqual({
      category: 'compatibility',
      code: DiagnosticCode.DeprecatedFunction,
      severity: 'warning',
      owner: 'analyzer',
      meaning: 'Deprecated CBS function or block',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.LegacyAngleBracket]).toEqual({
      category: 'compatibility',
      code: DiagnosticCode.LegacyAngleBracket,
      severity: 'warning',
      owner: 'analyzer',
      meaning: 'Legacy angle-bracket macro syntax',
    });
  });

  it('keeps router output aligned with the canonical taxonomy', () => {
    for (const entry of listMatrixFixtures('diagnostic-taxonomy')) {
      const diagnostics = routeDiagnosticsForDocument(entry.filePath, entry.text);

      for (const code of entry.expectedDiagnosticCodes) {
        expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
        expect(DIAGNOSTIC_TAXONOMY[code].meaning).toBeDefined();
      }

      expect(
        diagnostics
          .map((diagnostic) => diagnostic.data)
          .filter(
            (data): data is { rule: unknown } =>
              typeof data === 'object' && data !== null && 'rule' in data,
          )
          .map((data) => data.rule),
      ).toEqual(expect.arrayContaining([...entry.expectedDiagnosticRules]));
    }

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnclosedMacro].meaning).toBe(
      'Unclosed CBS macro ({{ without matching }})',
    );
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnclosedBlock].meaning).toBe(
      'Unclosed CBS block (missing matching block close)',
    );
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnknownFunction].meaning).toBe(
      'Unknown CBS function or block keyword',
    );
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionOperatorSequence].meaning).toBe(
      'CBS expression sublanguage has an invalid operator sequence',
    );
    expect(
      DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionUnbalancedParentheses].meaning,
    ).toBe('CBS expression sublanguage has unbalanced parentheses');
    expect(
      DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionIncompleteReferenceToken].meaning,
    ).toBe('CBS expression sublanguage contains an incomplete variable reference token');
    expect(
      DIAGNOSTIC_TAXONOMY[DiagnosticCode.CalcExpressionInvalidReferenceIdentifier].meaning,
    ).toBe('CBS expression sublanguage contains an invalid variable reference identifier');
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.DeprecatedFunction].meaning).toBe(
      'Deprecated CBS function or block',
    );
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.LegacyAngleBracket].meaning).toBe(
      'Legacy angle-bracket macro syntax',
    );
  });

  it('keeps malformed recovery router diagnostics stable across repeated versions of the same input', () => {
    const filePath = '/fixtures/diagnostic-stability.risulorebook';
    const content = [
      '---',
      'name: Stability',
      'activationPercent: 100',
      '---',
      '@@@ CONTENT',
      '{{setvar::mood::1}}{{setvar::mood::2}}{{getvar::missing}}{{user',
    ].join('\n');

    const first = routeDiagnosticsForDocument(filePath, content, {}, {
      uri: 'file:///fixtures/diagnostic-stability.risulorebook',
      version: 1,
    });
    const second = routeDiagnosticsForDocument(filePath, content, {}, {
      uri: 'file:///fixtures/diagnostic-stability.risulorebook',
      version: 2,
    });

    expect(first).toEqual(second);
    expect(first.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticCode.UnusedVariable,
      DiagnosticCode.UndefinedVariable,
      DiagnosticCode.UnclosedMacro,
    ]);
    expect(first[0]?.relatedInformation).toEqual([
      {
        message: 'Additional unused definition #2 for "mood" appears here.',
        location: {
          uri: 'file:///fixtures/diagnostic-stability.risulorebook',
          range: {
            start: { line: 5, character: 29 },
            end: { line: 5, character: 33 },
          },
        },
      },
    ]);
  });

  it('freezes remaining deferred scope and current lua fragment-routing behavior', () => {
    expect(DEFERRED_SCOPE_CONTRACT).toEqual({
      deferredFeatures: ['lua-ast-fragment-routing'],
      featureAvailability: {
        'lua-diagnostics': {
          scope: 'deferred',
          source: 'deferred-scope-contract:lua-diagnostics',
          detail:
            'Lua diagnostics proxy stays deferred until the server forwards LuaLS diagnostics notifications into host `publishDiagnostics` plumbing.',
        },
        'lua-ast-fragment-routing': {
          scope: 'deferred',
          source: 'deferred-scope-contract:lua-ast-fragment-routing',
          detail:
            'Lua AST-specific fragment routing stays deferred while the current contract still uses full-document fragment routing.',
        },
      },
      luaRoutingMode: 'full-document-fragment',
    });

    const symbolTable = new SymbolTable();
    expect(new DefinitionProvider(new CBSBuiltinRegistry()).provide({} as never, undefined)).toBeNull();
    expect(new ReferencesProvider().provide({} as never, undefined)).toEqual([]);
    expect(new RenameProvider().provide({} as never, symbolTable)).toBeNull();
    expect(new FormattingProvider().provide({} as never)).toEqual([]);

    const luaFixture = getFixtureCorpusEntry('lua-basic');
    const fragmentMap = mapDocumentToCbsFragments(luaFixture.filePath, luaFixture.text);

    expect(fragmentMap?.fragments).toHaveLength(1);
    expect(fragmentMap?.fragments[0]).toMatchObject({
      section: 'full',
      content: luaFixture.text,
    });
  });
});

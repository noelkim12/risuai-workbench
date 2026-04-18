import { describe, expect, it } from 'vitest';
import {
  DEFERRED_SCOPE_CONTRACT,
  DIAGNOSTIC_TAXONOMY,
  DiagnosticCode,
} from '../src/analyzer/diagnostics';
import { SymbolTable } from '../src/analyzer/symbolTable';
import { routeDiagnosticsForDocument, mapDocumentToCbsFragments } from '../src/diagnostics-router';
import { DefinitionProvider } from '../src/features/definition';
import { FormattingProvider } from '../src/features/formatting';
import { ReferencesProvider } from '../src/features/references';
import { RenameProvider } from '../src/features/rename';
import { getFixtureCorpusEntry, listMatrixFixtures } from './fixtures/fixture-corpus';

describe('diagnostic taxonomy contract', () => {
  it('freezes exact meanings, owners, and severities for canonical codes', () => {
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnclosedMacro]).toEqual({
      code: DiagnosticCode.UnclosedMacro,
      severity: 'error',
      owner: 'tokenizer',
      meaning: 'Unclosed CBS macro ({{ without matching }})',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnclosedBlock]).toEqual({
      code: DiagnosticCode.UnclosedBlock,
      severity: 'error',
      owner: 'parser',
      meaning: 'Unclosed CBS block (missing matching block close)',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.UnknownFunction]).toEqual({
      code: DiagnosticCode.UnknownFunction,
      severity: 'error',
      owner: 'parser',
      meaning: 'Unknown CBS function or block keyword',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.DeprecatedFunction]).toEqual({
      code: DiagnosticCode.DeprecatedFunction,
      severity: 'warning',
      owner: 'analyzer',
      meaning: 'Deprecated CBS function or block',
    });

    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.LegacyAngleBracket]).toEqual({
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
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.DeprecatedFunction].meaning).toBe(
      'Deprecated CBS function or block',
    );
    expect(DIAGNOSTIC_TAXONOMY[DiagnosticCode.LegacyAngleBracket].meaning).toBe(
      'Legacy angle-bracket macro syntax',
    );
  });

  it('freezes deferred scope and current lua fragment-routing behavior', () => {
    expect(DEFERRED_SCOPE_CONTRACT).toEqual({
      deferredFeatures: [
        'definition',
        'references',
        'rename',
        'formatting',
        'lua-ast-fragment-routing',
      ],
      luaRoutingMode: 'full-document-fragment',
    });

    const symbolTable = new SymbolTable();
    expect(new DefinitionProvider().provide({} as never, symbolTable)).toBeNull();
    expect(new ReferencesProvider().provide({} as never, symbolTable)).toEqual([]);
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

import { describe, expect, it } from 'vitest';
import {
  CBSBuiltinRegistry,
  CBSParser,
  mapToCbsFragments,
  parseCustomExtensionArtifactFromPath,
  type CbsFragment,
} from 'risu-workbench-core';

import { DiagnosticCode, DiagnosticsEngine } from '../src/analyzer/diagnostics';
import { ScopeAnalyzer } from '../src/analyzer/scopeAnalyzer';
import { routeDiagnosticsForDocument } from '../src/diagnostics-router';
import { getFixtureCorpusEntry } from './fixtures/fixture-corpus';

const diagnosticsEngine = new DiagnosticsEngine(new CBSBuiltinRegistry());
const scopeAnalyzer = new ScopeAnalyzer();

function getFixtureFragment(fixtureId: string, section?: string): CbsFragment {
  const entry = getFixtureCorpusEntry(fixtureId);
  const artifact = parseCustomExtensionArtifactFromPath(entry.filePath);
  const fragmentMap = mapToCbsFragments(artifact, entry.text);
  const fragment = section
    ? fragmentMap.fragments.find((candidate) => candidate.section === section)
    : fragmentMap.fragments[0];

  if (!fragment) {
    throw new Error(`Fixture ${fixtureId} does not contain fragment ${section ?? '(first)'}`);
  }

  return fragment;
}

function analyzeFixture(fixtureId: string, section?: string) {
  const fragment = getFixtureFragment(fixtureId, section);
  const document = new CBSParser().parse(fragment.content);
  const diagnostics = diagnosticsEngine.analyze(document, fragment.content);

  return {
    fragment,
    diagnostics,
  };
}

describe('DiagnosticsEngine', () => {
  it.each([
    ['prompt-unknown-function', DiagnosticCode.UnknownFunction, 'TEXT'],
    ['lorebook-wrong-argument-count', DiagnosticCode.WrongArgumentCount, 'CONTENT'],
    ['regex-missing-required-argument', DiagnosticCode.MissingRequiredArgument, 'IN'],
    ['regex-deprecated-block', DiagnosticCode.DeprecatedFunction, 'IN'],
    ['prompt-empty-block', DiagnosticCode.EmptyBlock, 'TEXT'],
    ['prompt-legacy-angle', DiagnosticCode.LegacyAngleBracket, 'TEXT'],
  ] as const)('covers %s with diagnostic code %s', (fixtureId, expectedCode, section) => {
    const { diagnostics } = analyzeFixture(fixtureId, section);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(expectedCode);
  });

  it('uses registry argument metadata for wrong argument count messages', () => {
    const { diagnostics } = analyzeFixture('lorebook-wrong-argument-count', 'CONTENT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.WrongArgumentCount,
    );

    expect(diagnostic?.message).toContain('"source"');
    expect(diagnostic?.message).toContain('expects 1 argument, but received 2');
  });

  it('uses registry argument metadata for missing required argument messages', () => {
    const { diagnostics } = analyzeFixture('regex-missing-required-argument', 'IN');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.MissingRequiredArgument,
    );

    expect(diagnostic?.message).toContain('"getvar"');
    expect(diagnostic?.message).toContain('"variableName"');
  });

  it('validates #when operators with parser-owned CBS003 semantics', () => {
    const { diagnostics } = analyzeFixture('prompt-invalid-when-operator', 'TEXT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.UnknownFunction,
    );

    expect(diagnostic?.message).toContain('Invalid #when operator');
  });

  it('validates malformed #each headers as missing required arguments', () => {
    const { diagnostics } = analyzeFixture('prompt-malformed-each-header', 'TEXT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.MissingRequiredArgument,
    );

    expect(diagnostic?.message).toContain('`as <item>`');
  });

  it('validates malformed math expressions with CBS004', () => {
    const { diagnostics } = analyzeFixture('lorebook-invalid-math', 'CONTENT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.WrongArgumentCount,
    );

    expect(diagnostic?.message).toContain('Invalid math expression');
  });

  it('reports alias availability when a shorter canonical alias exists', () => {
    const { diagnostics } = analyzeFixture('prompt-alias-available', 'TEXT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.AliasAvailable,
    );

    expect(diagnostic?.message).toContain('"tempvar"');
    expect(diagnostic?.message).toContain('"gettempvar"');
  });

  it('emits CBS101 and CBS102 from symbol-backed scope analysis', () => {
    const source =
      '{{setvar::used::1}}{{getvar::used}}{{setvar::unused::1}}{{settempvar::temp::x}}{{gettempvar::missing}}{{#each items as entry}}{{slot::entry}}{{/each}}{{#each items as orphan}}plain{{/each}}';
    const document = new CBSParser().parse(source);
    const symbolTable = scopeAnalyzer.analyze(document, source);
    const diagnostics = diagnosticsEngine.analyze(document, source, symbolTable);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticCode.UndefinedVariable,
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticCode.UnusedVariable,
    );
    expect(
      diagnostics.find((diagnostic) => diagnostic.code === DiagnosticCode.UndefinedVariable)
        ?.message,
    ).toContain('missing');
    expect(
      diagnostics
        .filter((diagnostic) => diagnostic.code === DiagnosticCode.UnusedVariable)
        .map((diagnostic) => diagnostic.message),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unused'),
        expect.stringContaining('orphan'),
      ]),
    );
  });

  it('keeps symbol-backed variable diagnostics fragment-local across multi-fragment documents', () => {
    const content = `---
comment: rule
type: plain
---
@@@ IN
{{setvar::mood::happy}}
@@@ OUT
{{getvar::mood}}
`;

    const diagnostics = routeDiagnosticsForDocument('/fixtures/fragment-local.risuregex', content);

    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === DiagnosticCode.UndefinedVariable),
    ).toEqual([
      expect.objectContaining({
        code: DiagnosticCode.UndefinedVariable,
        message: expect.stringContaining('mood'),
      }),
    ]);
  });
});

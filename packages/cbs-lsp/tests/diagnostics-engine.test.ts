import { describe, expect, it } from 'vitest';
import {
  CBSBuiltinRegistry,
  CBSParser,
  mapToCbsFragments,
  parseCustomExtensionArtifactFromPath,
  type CbsFragment,
} from 'risu-workbench-core';

import {
  type DiagnosticMachineData,
  DiagnosticCode,
  DiagnosticsEngine,
} from '../src/analyzer/diagnostics';
import { ScopeAnalyzer } from '../src/analyzer/scopeAnalyzer';
import { routeDiagnosticsForDocument } from '../src/utils/diagnostics-router';
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

function snapshotDiagnostics(source: string, diagnostics: ReturnType<DiagnosticsEngine['analyze']>) {
  void source;
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    range: diagnostic.range,
    data: diagnostic.data,
    relatedInformation: diagnostic.relatedInformation,
  }));
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

  it('attaches registry-backed replacement metadata to deprecated diagnostics with a precise edit range', () => {
    const source = '{{#if true}}fallback{{/if}}';
    const diagnostics = diagnosticsEngine.analyze(new CBSParser().parse(source), source);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.DeprecatedFunction,
    );

    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 2 },
      end: { line: 0, character: 5 },
    });
    expect(diagnostic?.data).toEqual({
      rule: {
        category: 'compatibility',
        code: DiagnosticCode.DeprecatedFunction,
        explanation: {
          reason: 'diagnostic-taxonomy',
          source: 'diagnostic-taxonomy:analyzer:compatibility',
          detail: 'Diagnostic taxonomy metadata from the analyzer stage for the compatibility rule category.',
        },
        owner: 'analyzer',
        severity: 'warning',
        meaning: 'Deprecated CBS function or block',
      },
      fixes: [
        {
          title: 'Replace with "#when"',
          editKind: 'replace',
          explanation: {
            reason: 'diagnostic-taxonomy',
            source: 'registry-deprecated:#if:#when',
            detail: 'Registry deprecation metadata marks #if as replaceable with #when.',
          },
          replacement: '#when',
        },
      ],
    });
  });

  it('uses registry argument metadata for missing required argument messages', () => {
    const { diagnostics } = analyzeFixture('regex-missing-required-argument', 'IN');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.MissingRequiredArgument,
    );

    expect(diagnostic?.message).toContain('Callable CBS builtin "getvar"');
    expect(diagnostic?.message).toContain('"variableName"');
  });

  it('uses documentation-only wording for docOnly builtin diagnostics', () => {
    const slotSource = '{{slot::name::extra}}';
    const slotDiagnostics = diagnosticsEngine.analyze(new CBSParser().parse(slotSource), slotSource);
    const slotDiagnostic = slotDiagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.WrongArgumentCount,
    );

    expect(slotDiagnostic?.message).toContain('Contextual CBS syntax entry "slot"');

    const whenSource = '{{#when}}body{{/when}}';
    const whenDiagnostics = diagnosticsEngine.analyze(new CBSParser().parse(whenSource), whenSource);
    const whenDiagnostic = whenDiagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.MissingRequiredArgument,
    );

    expect(whenDiagnostic?.message).toContain('Documentation-only CBS block syntax "#when"');

    const escapeSource = '{{#escape}}{{/escape}}';
    const escapeDiagnostics = diagnosticsEngine.analyze(
      new CBSParser().parse(escapeSource),
      escapeSource,
    );
    const escapeDiagnostic = escapeDiagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.EmptyBlock,
    );

    expect(escapeDiagnostic?.message).toContain(
      'Documentation-only CBS block syntax "#escape" has an empty body',
    );
  });

  it('validates #when operators with parser-owned CBS003 semantics', () => {
    const { diagnostics } = analyzeFixture('prompt-invalid-when-operator', 'TEXT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.UnknownFunction,
    );

    expect(diagnostic?.message).toContain('Invalid #when operator');
  });

  it('adds suggestion metadata to unknown builtin diagnostics from the shared registry', () => {
    const source = '{{us}}';
    const diagnostics = diagnosticsEngine.analyze(new CBSParser().parse(source), source);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.UnknownFunction,
    );
    const machineData = diagnostic?.data as DiagnosticMachineData | undefined;

    expect(machineData?.rule).toEqual({
      category: 'syntax',
      code: DiagnosticCode.UnknownFunction,
      explanation: {
        reason: 'diagnostic-taxonomy',
        source: 'diagnostic-taxonomy:parser:syntax',
        detail: 'Diagnostic taxonomy metadata from the parser stage for the syntax rule category.',
      },
      owner: 'parser',
      severity: 'error',
      meaning: 'Unknown CBS function or block keyword',
    });
    expect(machineData?.fixes).toHaveLength(1);
    expect(machineData?.fixes?.[0]).toMatchObject({
      title: 'Replace with a known CBS builtin',
      editKind: 'replace',
      explanation: {
        reason: 'diagnostic-taxonomy',
        source: expect.stringContaining('registry-suggestion:us:multiple:'),
        detail: expect.stringContaining('Registry suggestions found'),
      },
    });

    const suggestionValues = machineData?.fixes?.[0]?.suggestions?.map(
      (suggestion) => suggestion.value,
    );
    expect(suggestionValues).toEqual([...(suggestionValues ?? [])].sort((left, right) => left.localeCompare(right)));
    expect(suggestionValues).toEqual(
      expect.arrayContaining(['user', 'userhistory']),
    );
  });

  it('validates malformed #each headers as missing required arguments', () => {
    const { diagnostics } = analyzeFixture('prompt-malformed-each-header', 'TEXT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.MissingRequiredArgument,
    );

    expect(diagnostic?.message).toContain('`as <item>`');
  });

  it('classifies malformed math expressions as calc operator sequence errors with an operator range', () => {
    const { diagnostics } = analyzeFixture('lorebook-invalid-math', 'CONTENT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.CalcExpressionOperatorSequence,
    );

    expect(diagnostic?.message).toContain('incomplete operator sequence');
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 6 },
      end: { line: 0, character: 7 },
    });
    expect((diagnostic?.data as DiagnosticMachineData | undefined)?.fixes).toBeUndefined();
  });

  it('classifies malformed calc macro expressions with the same calc taxonomy and a focused range', () => {
    const { diagnostics } = analyzeFixture('lorebook-invalid-calc-macro', 'CONTENT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.CalcExpressionOperatorSequence,
    );

    expect(diagnostic?.message).toContain('incomplete operator sequence');
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 10 },
      end: { line: 0, character: 11 },
    });
  });

  it.each([
    [
      'empty-expression',
      '{{? }}',
      '{{calc::}}',
      DiagnosticCode.CalcExpressionEmpty,
      'CBS expression sublanguage cannot be empty',
    ],
    [
      'operator-sequence',
      '{{? 1 + }}',
      '{{calc::1 + }}',
      DiagnosticCode.CalcExpressionOperatorSequence,
      'CBS expression sublanguage ends with an incomplete operator sequence after "+"',
    ],
    [
      'unbalanced-parentheses',
      '{{? (1 + 2 }}',
      '{{calc::(1 + 2 }}',
      DiagnosticCode.CalcExpressionUnbalancedParentheses,
      'CBS expression sublanguage has an unmatched opening parenthesis',
    ],
    [
      'unsupported-token',
      '{{? 1 + foo}}',
      '{{calc::1 + foo}}',
      DiagnosticCode.CalcExpressionUnsupportedToken,
      'CBS expression sublanguage contains unsupported token "foo"',
    ],
    [
      'incomplete-chat-reference',
      '{{? $ + 1}}',
      '{{calc::$ + 1}}',
      DiagnosticCode.CalcExpressionIncompleteReferenceToken,
      'CBS expression sublanguage contains an incomplete chat variable reference token "$". Add an identifier after "$".',
    ],
    [
      'invalid-global-reference-identifier',
      '{{? @1bonus + 1}}',
      '{{calc::@1bonus + 1}}',
      DiagnosticCode.CalcExpressionInvalidReferenceIdentifier,
      'CBS expression sublanguage contains an invalid global variable reference "@1bonus". global variable references must start with a letter or underscore after "@".',
    ],
  ] as const)(
    'uses the same diagnostic taxonomy and message for inline and macro %s errors',
    (_label, inlineSource, macroSource, expectedCode, expectedMessage) => {
      const inlineDiagnostics = diagnosticsEngine.analyze(new CBSParser().parse(inlineSource), inlineSource);
      const macroDiagnostics = diagnosticsEngine.analyze(new CBSParser().parse(macroSource), macroSource);

      const inlineDiagnostic = inlineDiagnostics.find((candidate) => candidate.code === expectedCode);
      const macroDiagnostic = macroDiagnostics.find((candidate) => candidate.code === expectedCode);

      expect(inlineDiagnostic?.message).toBe(expectedMessage);
      expect(macroDiagnostic?.message).toBe(expectedMessage);
    },
  );

  it('keeps validating calc operator structure even when nested macros are embedded in the expression', () => {
    const source = '{{calc::{{getvar::score}} + }}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticCode.CalcExpressionOperatorSequence,
    );
    expect(
      diagnostics.find(
        (diagnostic) => diagnostic.code === DiagnosticCode.CalcExpressionOperatorSequence,
      )
        ?.message,
    ).toContain('incomplete operator sequence');
  });

  it('treats nested macros as operands in inline math diagnostics', () => {
    const source = '{{? {{getvar::ct_Language}} == 1}}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.CalcExpressionUnsupportedToken,
    );
    expect(diagnostics).toEqual([]);
  });

  it('does not flag nested inline math conditions in #if block headers', () => {
    const source = '{{#if {{? {{getvar::ct_Deck_Level}} <= 2}}}}ok{{/if}}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.CalcExpressionUnsupportedToken,
    );
  });

  it('classifies unmatched calc parentheses with a parenthesis-specific diagnostic and range', () => {
    const source = '{{? (1 + 2 }}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.CalcExpressionUnbalancedParentheses,
    );

    expect(diagnostic?.message).toContain('unmatched opening parenthesis');
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 4 },
      end: { line: 0, character: 5 },
    });
  });

  it('classifies unsupported calc tokens with a token-specific diagnostic and range', () => {
    const source = '{{calc::1 + foo}}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.CalcExpressionUnsupportedToken,
    );

    expect(diagnostic?.message).toContain('unsupported token');
    expect(diagnostic?.message).toContain('foo');
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 12 },
      end: { line: 0, character: 15 },
    });
  });

  it('classifies incomplete calc reference markers with a reference-specific diagnostic and range', () => {
    const source = '{{calc::$ + 1}}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.CalcExpressionIncompleteReferenceToken,
    );

    expect(diagnostic?.message).toContain('incomplete chat variable reference token');
    expect(diagnostic?.message).toContain('Add an identifier after "$"');
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 8 },
      end: { line: 0, character: 9 },
    });
  });

  it('classifies invalid calc reference identifiers with a reference-specific diagnostic and range', () => {
    const source = '{{? @1bonus + 1}}';
    const document = new CBSParser().parse(source);
    const diagnostics = diagnosticsEngine.analyze(document, source);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.CalcExpressionInvalidReferenceIdentifier,
    );

    expect(diagnostic?.message).toContain('invalid global variable reference');
    expect(diagnostic?.message).toContain('@1bonus');
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 4 },
      end: { line: 0, character: 11 },
    });
  });

  it('reports alias availability when a shorter canonical alias exists', () => {
    const { diagnostics } = analyzeFixture('prompt-alias-available', 'TEXT');
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.AliasAvailable,
    );

    expect(diagnostic?.message).toContain('"tempvar"');
    expect(diagnostic?.message).toContain('"gettempvar"');
    expect(diagnostic?.data).toEqual(
      expect.objectContaining({
        rule: {
          category: 'quality',
          code: DiagnosticCode.AliasAvailable,
          explanation: {
            reason: 'diagnostic-taxonomy',
            source: 'diagnostic-taxonomy:analyzer:quality',
            detail: 'Diagnostic taxonomy metadata from the analyzer stage for the quality rule category.',
          },
          owner: 'analyzer',
          severity: 'info',
          meaning: 'Shorter CBS alias is available',
        },
        fixes: [
          expect.objectContaining({
            title: 'Replace with shorter alias "tempvar"',
            editKind: 'replace',
            explanation: {
              reason: 'diagnostic-taxonomy',
              source: expect.stringContaining('registry-alias:gettempvar:tempvar:'),
              detail:
                'Builtin alias metadata exposes tempvar as a shorter canonical alias for gettempvar.',
            },
            replacement: 'tempvar',
          }),
        ],
      }),
    );
  });

  it('emits CBS101 and CBS102 from symbol-backed scope analysis', () => {
    const source =
      '{{setvar::used::1}}{{getvar::used}}{{setvar::unused::1}}{{settempvar::temp::x}}{{gettempvar::missing}}{{#each items as entry}}{{slot::entry}}{{/each}}{{#each items as orphan}}plain{{/each}}';
    const document = new CBSParser().parse(source);
    const scopeAnalysis = scopeAnalyzer.analyze(document, source);
    const diagnostics = diagnosticsEngine.analyze(document, source, scopeAnalysis);

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

  it('reports arg::N misuse outside a local #func body', () => {
    const source = '{{arg::0}}{{#func greet user}}{{arg::1}}{{/func}}{{call::greet::Noel}}';
    const document = new CBSParser().parse(source);
    const scopeAnalysis = scopeAnalyzer.analyze(document, source);
    const diagnostics = diagnosticsEngine.analyze(document, source, scopeAnalysis);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: DiagnosticCode.WrongArgumentCount,
        message: expect.stringContaining('only valid inside a local #func body'),
      }),
    );
  });

  it('shares the pure-mode suppression contract for #each and #func bodies', () => {
    const source = [
      '{{#each items as item}}',
      '{{slot::item}}',
      '{{setvar::hidden::1}}',
      '{{/each}}',
      '{{#func greet user}}',
      '{{arg::0}}',
      '{{setvar::shadow::1}}',
      '{{/func}}',
      '{{call::greet::Noel}}',
    ].join('');
    const document = new CBSParser().parse(source);
    const scopeAnalysis = scopeAnalyzer.analyze(document, source);
    const diagnostics = diagnosticsEngine.analyze(document, source, scopeAnalysis);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.UnusedVariable,
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.WrongArgumentCount,
    );
  });

  it('keeps unclosed block diagnostics focused on recovery-safe syntax facts', () => {
    const { diagnostics } = analyzeFixture('lorebook-unclosed-block', 'CONTENT');

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([DiagnosticCode.UnclosedBlock]);
  });

  it('attaches secondary definition ranges to unused variable diagnostics', () => {
    const source = '{{setvar::mood::1}}{{setvar::mood::2}}';
    const document = new CBSParser().parse(source);
    const scopeAnalysis = scopeAnalyzer.analyze(document, source);
    const diagnostics = diagnosticsEngine.analyze(document, source, scopeAnalysis);
    const diagnostic = diagnostics.find(
      (candidate) => candidate.code === DiagnosticCode.UnusedVariable,
    );

    expect(diagnostic?.relatedInformation).toEqual([
      {
        message: 'Additional unused definition #2 for "mood" appears here.',
        range: {
          start: { line: 0, character: 29 },
          end: { line: 0, character: 33 },
        },
        },
      ]);
  });

  it('stabilizes malformed recovery diagnostics ordering, fixes, and related ranges for the same input', () => {
    const source = '{{setvar::mood::1}}{{setvar::mood::2}}{{getvar::missing}}{{user';
    const analyze = () => {
      const document = new CBSParser().parse(source);
      const scopeAnalysis = scopeAnalyzer.analyze(document, source);

      return diagnosticsEngine.analyze(document, source, scopeAnalysis);
    };

    const first = analyze();
    const second = analyze();

    expect(first.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticCode.UnusedVariable,
      DiagnosticCode.UndefinedVariable,
      DiagnosticCode.UnclosedMacro,
    ]);
    expect(first).toEqual(second);
    expect(snapshotDiagnostics(source, first)).toEqual(
      snapshotDiagnostics(source, second),
    );
    expect(first[0]?.relatedInformation).toEqual([
      {
        message: 'Additional unused definition #2 for "mood" appears here.',
        range: {
          start: { line: 0, character: 29 },
          end: { line: 0, character: 33 },
        },
      },
    ]);
  });
});

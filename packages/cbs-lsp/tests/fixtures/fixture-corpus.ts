import type {
  CodeAction,
  CodeLens,
  CompletionItem,
  Diagnostic,
  DocumentSymbol,
  Hover,
  SymbolInformation,
} from 'vscode-languageserver/node';
import {
  DIAGNOSTIC_TAXONOMY,
  DiagnosticCode,
  createDiagnosticRuleExplanation,
  type DiagnosticOwner,
  type DiagnosticRuleCategory,
} from '../../src/analyzer/diagnostics';
import {
  createCbsAgentProtocolMarker,
  type AgentMetadataExplanationContract,
  type CbsAgentProtocolMarker,
} from '../../src/core';
import {
  snapshotLayer1Contracts as createLayer1ContractsSnapshot,
  snapshotLayer3Queries as createLayer3QueriesSnapshot,
  type NormalizedLayer1ContractSnapshot,
  type NormalizedLayer3QuerySnapshot,
} from '../../src/auxiliary/agent-contracts';
import {
  normalizeHostDiagnosticsEnvelopeForSnapshot,
  normalizeHostDiagnosticsForSnapshot,
  type NormalizedHostDiagnosticsEnvelopeSnapshot,
  type NormalizedHostDiagnosticSnapshot,
} from '../../src/utils/diagnostics-router';
import {
  normalizeCompletionItemsForSnapshot,
  type NormalizedCompletionItemSnapshot,
} from '../../src/features/completion';
import {
  normalizeHoverForSnapshot,
  type NormalizedHoverSnapshot,
} from '../../src/features/hover';
import {
  normalizeCodeActionsEnvelopeForSnapshot,
  normalizeCodeActionsForSnapshot,
  type NormalizedCodeActionsEnvelopeSnapshot,
  type NormalizedCodeActionSnapshot,
} from '../../src/features/code-actions-snapshot';
import {
  normalizeDocumentSymbolsEnvelopeForSnapshot,
  normalizeDocumentSymbolsForSnapshot,
  type NormalizedDocumentSymbolsEnvelopeSnapshot,
  type NormalizedDocumentSymbolSnapshot,
} from '../../src/features/documentSymbol';
import {
  normalizeWorkspaceSymbolsEnvelopeForSnapshot,
  normalizeWorkspaceSymbolsForSnapshot,
  type NormalizedWorkspaceSymbolsEnvelopeSnapshot,
  type NormalizedWorkspaceSymbolSnapshot,
} from '../../src/features/workspaceSymbol';
import {
  normalizeCodeLensesEnvelopeForSnapshot,
  normalizeCodeLensesForSnapshot,
  type NormalizedCodeLensesEnvelopeSnapshot,
  type NormalizedCodeLensSnapshot,
} from '../../src/features/codelens';
import {
  normalizeLuaHoverEnvelopeForSnapshot,
  normalizeLuaHoverForSnapshot,
  type NormalizedLuaHoverEnvelopeSnapshot,
} from '../../src/providers/lua/lualsProxy';
import type { LuaLsCompanionRuntime } from '../../src/core';

export interface NormalizedProviderBundleSnapshot extends CbsAgentProtocolMarker {
  codeActions: NormalizedCodeActionSnapshot[];
  codeLenses?: NormalizedCodeLensSnapshot[];
  completion: NormalizedCompletionItemSnapshot[];
  diagnostics: NormalizedHostDiagnosticSnapshot[];
  documentSymbols: NormalizedDocumentSymbolSnapshot[];
  hover: NormalizedHoverSnapshot | null;
}

type Eol = '\n' | '\r\n';

// fixture 아티팩트 종류
// 테스트에서 어떤 확장자/문서 성격을 다루는지 구분하는 값
export type FixtureCorpusArtifact =
  | 'lorebook'
  | 'regex'
  | 'prompt'
  | 'html'
  | 'lua'
  | 'toggle'
  | 'variable';

export type FixtureCorpusSourceKind = 'inline-document';
export type FixtureCorpusKind = 'representative' | 'excluded' | 'edge-case';
export type FixtureMatrixArea = 'service' | 'remap' | 'locator' | 'diagnostic-taxonomy';
export type FormattingContractCoverage = 'single-fragment' | 'multi-fragment' | 'pure-mode' | 'malformed' | 'unicode';

export interface FixtureExpectedDiagnosticRule {
  category: DiagnosticRuleCategory;
  code: DiagnosticCode;
  explanation: AgentMetadataExplanationContract;
  meaning: string;
  owner: DiagnosticOwner;
  severity: 'error' | 'warning' | 'info';
}

// fixture 한 건의 최종 형태
// 테스트가 바로 꺼내 쓸 수 있게 uri, filePath, 기대값까지 포함한 구조
export interface FixtureCorpusEntry {
  id: string;
  label: string;
  kind: FixtureCorpusKind;
  artifact: FixtureCorpusArtifact;
  cbsBearing: boolean;
  sourceKind: FixtureCorpusSourceKind;
  relativePath: string;
  filePath: string;
  uri: string;
  expectedSections: readonly string[];
  expectedDiagnosticCodes: readonly DiagnosticCode[];
  expectedDiagnosticRules: readonly FixtureExpectedDiagnosticRule[];
  features: readonly string[];
  text: string;
}

export interface FormattingContractFixtureCase {
  coverage: FormattingContractCoverage;
  entry: FixtureCorpusEntry;
}

interface FixtureCorpusSeed {
  id: string;
  label: string;
  kind: FixtureCorpusKind;
  artifact: FixtureCorpusArtifact;
  cbsBearing: boolean;
  sourceKind: FixtureCorpusSourceKind;
  relativePath: string;
  expectedSections: readonly string[];
  expectedDiagnosticCodes?: readonly DiagnosticCode[];
  features: readonly string[];
  text: string;
}

/**
 * lorebookDocument 함수.
 * lorebook fixture 문자열을 만들고, frontmatter와 CONTENT 섹션을 한 번에 묶음.
 *
 * @param bodyLines - CONTENT 섹션에 넣을 본문 줄 목록
 * @param options - 줄바꿈 방식, CONTENT 섹션 포함 여부, 엔트리 이름 같은 문서 옵션
 * @returns lorebook 테스트 문서 전체 문자열
 */
function lorebookDocument(
  bodyLines: readonly string[],
  options: {
    eol?: Eol;
    includeContentSection?: boolean;
    name?: string;
  } = {},
): string {
  const { eol = '\n', includeContentSection = true, name = 'entry' } = options;
  const lines = ['---', `name: ${name}`, '---'];

  if (includeContentSection) {
    lines.push('@@@ CONTENT', ...bodyLines);
  }

  lines.push('');
  return lines.join(eol);
}

/**
 * activationLorebookDocument 함수.
 * activation-chain/CodeLens 테스트용 canonical lorebook 문서를 조립함.
 *
 * @param options - lorebook 이름, 키워드, selective/secondary/content 같은 activation 시드
 * @returns activation-chain fixture로 재사용할 `.risulorebook` 문서 문자열
 */
function activationLorebookDocument(options: {
  content: string;
  keys: readonly string[];
  name: string;
  secondaryKeys?: readonly string[];
  selective?: boolean;
}): string {
  return [
    '---',
    `name: ${options.name}`,
    `comment: ${options.name}`,
    'constant: false',
    `selective: ${String(options.selective ?? false)}`,
    'enabled: true',
    'insertion_order: 0',
    'case_sensitive: false',
    'use_regex: false',
    '---',
    '@@@ KEYS',
    ...options.keys,
    ...(options.secondaryKeys ? ['@@@ SECONDARY_KEYS', ...options.secondaryKeys] : []),
    '@@@ CONTENT',
    options.content,
    '',
  ].join('\n');
}

/**
 * regexDocument 함수.
 * regex fixture 문자열을 만들고, IN/OUT 조합을 고정된 형태로 묶음.
 *
 * @param inputLines - IN 섹션에 넣을 본문 줄 목록
 * @param outputLines - OUT 섹션에 넣을 본문 줄 목록, 없으면 OUT 섹션 생략
 * @param options - 줄바꿈 방식, comment 값, type 값 같은 문서 옵션
 * @returns regex 테스트 문서 전체 문자열
 */
function regexDocument(
  inputLines: readonly string[],
  outputLines: readonly string[] | null,
  options: {
    eol?: Eol;
    comment?: string;
    type?: string;
  } = {},
): string {
  const { eol = '\n', comment = 'rule', type = 'plain' } = options;
  const lines = ['---', `comment: ${comment}`, `type: ${type}`, '---', '@@@ IN', ...inputLines];

  if (outputLines) {
    lines.push('@@@ OUT', ...outputLines);
  }

  lines.push('');
  return lines.join(eol);
}

/**
 * promptDocument 함수.
 * prompt fixture 문자열을 만들고, 필요한 섹션만 골라서 하나의 문서로 묶음.
 *
 * @param sections - TEXT, INNER_FORMAT, DEFAULT_TEXT 중 실제로 넣을 섹션 값 모음
 * @param options - 줄바꿈 방식과 prompt type 같은 문서 옵션
 * @returns prompt 테스트 문서 전체 문자열
 */
function promptDocument(
  sections: Partial<Record<'TEXT' | 'INNER_FORMAT' | 'DEFAULT_TEXT', string>>,
  options: {
    eol?: Eol;
    type?: string;
  } = {},
): string {
  const { eol = '\n', type = 'plain' } = options;
  const lines = ['---', `type: ${type}`, '---'];

  for (const sectionName of ['TEXT', 'INNER_FORMAT', 'DEFAULT_TEXT'] as const) {
    const value = sections[sectionName];
    if (!value) {
      continue;
    }

    lines.push(`@@@ ${sectionName}`, value);
  }

  lines.push('');
  return lines.join(eol);
}

// fixture seed 모음
// 테스트 원본 데이터만 담고, filePath/uri 같은 런타임 메타데이터는 아래에서 붙임
const fixtureCorpusSeeds: readonly FixtureCorpusSeed[] = [
  // 대표 fixture 묶음
  // 각 아티팩트의 정상 동작 기준점으로 쓰는 케이스
  {
    id: 'lorebook-basic',
    label: 'Representative lorebook CONTENT fragment',
    kind: 'representative',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'happy-entry.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['happy-path', 'lf'],
    text: lorebookDocument(['Hello {{user}}']),
  },
  {
    id: 'regex-basic',
    label: 'Representative regex IN/OUT fragments',
    kind: 'representative',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'happy-script.risuregex',
    expectedSections: ['IN', 'OUT'],
    features: ['happy-path', 'multi-fragment'],
    text: regexDocument(['Hello {{user}}'], ['Hi {{char}}']),
  },
  {
    id: 'prompt-basic',
    label: 'Representative prompt TEXT/DEFAULT_TEXT fragments',
    kind: 'representative',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'happy-prompt.risuprompt',
    expectedSections: ['TEXT', 'DEFAULT_TEXT'],
    features: ['happy-path', 'multi-fragment', 'locator-argument'],
    text: promptDocument({
      TEXT: 'System: {{getvar::persona}}',
      DEFAULT_TEXT: 'fallback',
    }),
  },
  {
    id: 'html-basic',
    label: 'Representative html full-document fragment',
    kind: 'representative',
    artifact: 'html',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'happy-background.risuhtml',
    expectedSections: ['full'],
    features: ['happy-path', 'full-document-fragment'],
    text: '<div>{{user}}</div>',
  },
  {
    id: 'lua-basic',
    label: 'Representative lua full-document fragment',
    kind: 'representative',
    artifact: 'lua',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'happy-script.risulua',
    expectedSections: ['full'],
    features: ['happy-path', 'full-document-fragment'],
    text: 'local userName = "{{user}}"\nprint(userName)',
  },

  // 제외 fixture 묶음
  // CBS를 태우지 않아야 하는 파일 타입을 명시적으로 고정하는 케이스
  {
    id: 'toggle-excluded',
    label: 'Excluded toggle artifact',
    kind: 'excluded',
    artifact: 'toggle',
    cbsBearing: false,
    sourceKind: 'inline-document',
    relativePath: 'ignored-toggle.risutoggle',
    expectedSections: [],
    features: ['excluded'],
    text: 'enabled=true',
  },
  {
    id: 'variable-excluded',
    label: 'Excluded variable artifact',
    kind: 'excluded',
    artifact: 'variable',
    cbsBearing: false,
    sourceKind: 'inline-document',
    relativePath: 'ignored-vars.risuvar',
    expectedSections: [],
    features: ['excluded'],
    text: 'hp=100',
  },

  // edge-case fixture 묶음
  // 비정상 입력, 경계 조건, 진단 분류 같은 까다로운 조건을 고정하는 케이스
  {
    id: 'lorebook-empty-document',
    label: 'Empty lorebook document',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-empty.risulorebook',
    expectedSections: [],
    features: ['empty', 'no-fragment'],
    text: '',
  },
  {
    id: 'lorebook-no-content-section',
    label: 'Lorebook without CONTENT section',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-no-content.risulorebook',
    expectedSections: [],
    features: ['no-fragment'],
    text: lorebookDocument([], { includeContentSection: false }),
  },
  {
    id: 'lorebook-activation-alpha',
    label: 'Lorebook activation summary seed with possible, partial, and blocked outgoing edges',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'activation-alpha.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['activation-chain', 'codelens', 'possible', 'partial', 'blocked', 'cycle'],
    text: activationLorebookDocument({
      name: 'Alpha',
      keys: ['alpha'],
      content: 'beta wakes the main chain, gamma only partially matches, and delta is blocked.',
    }),
  },
  {
    id: 'lorebook-activation-beta',
    label: 'Lorebook activation cycle partner',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'activation-beta.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['activation-chain', 'codelens', 'possible', 'cycle'],
    text: activationLorebookDocument({
      name: 'Beta',
      keys: ['beta'],
      content: 'alpha closes the cycle.',
    }),
  },
  {
    id: 'lorebook-activation-gamma',
    label: 'Selective lorebook activation partial-match seed',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'activation-gamma.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['activation-chain', 'codelens', 'partial', 'selective'],
    text: activationLorebookDocument({
      name: 'Gamma',
      keys: ['gamma'],
      secondaryKeys: ['omega'],
      selective: true,
      content: 'Gamma lore body.',
    }),
  },
  {
    id: 'lorebook-activation-delta',
    label: 'Lorebook activation blocked seed via no_recursive_search',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'activation-delta.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['activation-chain', 'codelens', 'blocked'],
    text: activationLorebookDocument({
      name: 'Delta',
      keys: ['delta'],
      content: '@@no_recursive_search\nDelta lore body.',
    }),
  },
  {
    id: 'lorebook-puredisplay-formatting',
    label: 'Lorebook puredisplay formatting contract fixture',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'format-puredisplay.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['pure-mode', 'formatting'],
    text: lorebookDocument(['{{#puredisplay}}  {{ user }}', '{{/}}']),
  },
  {
    id: 'lorebook-unclosed-macro',
    label: 'Malformed lorebook with unclosed macro',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-unclosed-macro.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.UnclosedMacro],
    features: ['malformed', 'taxonomy'],
    text: lorebookDocument(['Hello {{user']),
  },
  {
    id: 'lorebook-unclosed-block',
    label: 'Malformed lorebook with unclosed block',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-unclosed-block.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.UnclosedBlock],
    features: ['malformed', 'taxonomy'],
    text: lorebookDocument(['{{#when::true}}Hello']),
  },
  {
    id: 'lorebook-unknown-function',
    label: 'Lorebook with unknown function diagnostic',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-unknown-function.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.UnknownFunction],
    features: ['taxonomy'],
    text: lorebookDocument(['{{unknown_function::arg}}']),
  },
  {
    id: 'lorebook-deprecated-block',
    label: 'Lorebook with deprecated block diagnostic',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-deprecated-block.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.DeprecatedFunction],
    features: ['taxonomy'],
    text: lorebookDocument(['{{#if true}}fallback{{/if}}']),
  },
  {
    id: 'lorebook-legacy-angle',
    label: 'Lorebook with legacy angle-bracket diagnostic',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-legacy-angle.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.LegacyAngleBracket],
    features: ['taxonomy'],
    text: lorebookDocument(['Hello <user>']),
  },
  {
    id: 'lorebook-wrong-argument-count',
    label: 'Lorebook with wrong argument count diagnostic',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-wrong-argument-count.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.WrongArgumentCount],
    features: ['taxonomy', 'analyzer-arguments'],
    text: lorebookDocument(['{{source::user::char}}']),
  },
  {
    id: 'lorebook-invalid-math',
    label: 'Lorebook with invalid math expression diagnostic',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-invalid-math.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.CalcExpressionOperatorSequence],
    features: ['taxonomy', 'analyzer-math'],
    text: lorebookDocument(['{{? 1 + }}']),
  },
  {
    id: 'lorebook-invalid-calc-macro',
    label: 'Lorebook with invalid calc macro argument',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-invalid-calc-macro.risulorebook',
    expectedSections: ['CONTENT'],
    expectedDiagnosticCodes: [DiagnosticCode.CalcExpressionOperatorSequence],
    features: ['taxonomy', 'analyzer-math', 'calc-zone'],
    text: lorebookDocument(['{{calc::1 + }}']),
  },
  {
    id: 'lorebook-calc-expression-context',
    label: 'Lorebook with shared calc expression context fixtures',
    kind: 'representative',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'representative-calc-expression.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['calc-zone', 'completion', 'hover'],
    text: lorebookDocument([
      '{{setvar::score::4}}',
      '{{getglobalvar::bonus}}',
      '{{? $score + @bonus}}',
      '{{calc::$score + @bonus}}',
    ]),
  },
  {
    id: 'lorebook-crlf',
    label: 'Lorebook with CRLF line endings',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-crlf.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['crlf'],
    text: lorebookDocument(['First line', '{{user}}'], { eol: '\r\n' }),
  },
  {
    id: 'lorebook-utf16',
    label: 'Lorebook with UTF-16 surrogate pairs',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-utf16.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['utf16', 'surrogate-pair'],
    text: lorebookDocument(['🙂{{user}}']),
  },
  {
    id: 'lorebook-utf16-formatting',
    label: 'Lorebook UTF-16 formatting contract fixture',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'format-utf16.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['utf16', 'surrogate-pair', 'formatting'],
    text: lorebookDocument(['🙂{{ user }}']),
  },
  {
    id: 'regex-duplicate-fragments',
    label: 'Regex with duplicate fragment text in IN/OUT',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-duplicate.risuregex',
    expectedSections: ['IN', 'OUT'],
    features: ['duplicate-fragment-text', 'multi-fragment'],
    text: regexDocument(['{{user}}'], ['{{user}}']),
  },
  {
    id: 'regex-recover-out-with-malformed-in-header',
    label: 'Regex recovers OUT after malformed IN header',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-recover-out-only.risuregex',
    expectedSections: ['OUT'],
    expectedDiagnosticCodes: [DiagnosticCode.UnclosedMacro],
    features: ['malformed-section', 'recovery', 'taxonomy'],
    text: ['---', 'comment: recovery', 'type: plain', '---', '@@ IN', 'broken header', '@@@ OUT', '{{user'].join('\n'),
  },
  {
    id: 'regex-missing-required-argument',
    label: 'Regex with missing required argument diagnostic',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-missing-required-argument.risuregex',
    expectedSections: ['IN', 'OUT'],
    expectedDiagnosticCodes: [DiagnosticCode.MissingRequiredArgument],
    features: ['taxonomy', 'analyzer-arguments', 'multi-fragment'],
    text: regexDocument(['{{getvar}}'], ['fallback']),
  },
  {
    id: 'regex-deprecated-block',
    label: 'Regex with deprecated block diagnostic',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-deprecated-block.risuregex',
    expectedSections: ['IN', 'OUT'],
    expectedDiagnosticCodes: [DiagnosticCode.DeprecatedFunction],
    features: ['taxonomy', 'multi-fragment'],
    text: regexDocument(['{{#if true}}legacy{{/if}}'], ['fallback']),
  },
  {
    id: 'regex-foldable-block',
    label: 'Regex with multi-line foldable #when block',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-foldable-block.risuregex',
    expectedSections: ['IN', 'OUT'],
    features: ['happy-path', 'multi-fragment', 'folding'],
    text: regexDocument(['{{#when::true}}', 'win', '{{/}}'], ['fallback']),
  },
  {
    id: 'lorebook-setvar-macro',
    label: 'Lorebook setvar macro for locator coverage',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'locator-setvar.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['locator-macro-name'],
    text: lorebookDocument(['Hello {{setvar::mood::happy}}']),
  },
  {
    id: 'lorebook-settempvar-macro',
    label: 'Lorebook settempvar macro for temp variable namespace coverage',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'locator-settempvar.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['locator-macro-name', 'temp-variable'],
    text: lorebookDocument(['{{settempvar::counter::1}}']),
  },
  {
    id: 'lorebook-signature-happy',
    label: 'Lorebook with setvar/getvar happy-path signature coverage',
    kind: 'edge-case',
    artifact: 'lorebook',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-signature-happy.risulorebook',
    expectedSections: ['CONTENT'],
    features: ['happy-path', 'signature'],
    text: lorebookDocument(['Hello {{setvar::mood::happy}}{{getvar::mood}}']),
  },
  {
    id: 'regex-block-header',
    label: 'Regex block header locator fixture',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'locator-block-header.risuregex',
    expectedSections: ['IN', 'OUT'],
    features: ['locator-block-header', 'multi-fragment'],
    text: regexDocument(['{{#when::score::is::10}}win{{/}}'], ['fallback']),
  },
  {
    id: 'regex-block-else',
    label: 'Regex else locator fixture',
    kind: 'edge-case',
    artifact: 'regex',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'locator-block-else.risuregex',
    expectedSections: ['IN', 'OUT'],
    features: ['locator-block-else', 'multi-fragment'],
    text: regexDocument(['plain'], ['{{#when::ready}}yes{{:else}}no{{/}}']),
  },
  {
    id: 'prompt-unknown-function',
    label: 'Prompt with unknown function diagnostic',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-unknown-function.risuprompt',
    expectedSections: ['TEXT'],
    expectedDiagnosticCodes: [DiagnosticCode.UnknownFunction],
    features: ['taxonomy'],
    text: promptDocument({
      TEXT: '{{mystery}}',
    }),
  },
  {
    id: 'prompt-builtin-basic',
    label: 'Prompt with builtin macro and no diagnostics',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-builtin-basic.risuprompt',
    expectedSections: ['TEXT'],
    features: ['happy-path', 'semantic-tokens'],
    text: promptDocument({
      TEXT: 'System: {{user}}',
    }),
  },
  {
    id: 'prompt-empty-block',
    label: 'Prompt with empty block diagnostic',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-empty-block.risuprompt',
    expectedSections: ['TEXT'],
    expectedDiagnosticCodes: [DiagnosticCode.EmptyBlock],
    features: ['taxonomy', 'analyzer-empty-block'],
    text: promptDocument({
      TEXT: '{{#when::ready}}{{/}}',
    }),
  },
  {
    id: 'prompt-legacy-angle',
    label: 'Prompt with legacy angle-bracket diagnostic',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-legacy-angle.risuprompt',
    expectedSections: ['TEXT'],
    expectedDiagnosticCodes: [DiagnosticCode.LegacyAngleBracket],
    features: ['taxonomy'],
    text: promptDocument({
      TEXT: 'Legacy <user>',
    }),
  },
  {
    id: 'prompt-invalid-when-operator',
    label: 'Prompt with invalid #when operator diagnostic',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-invalid-when-operator.risuprompt',
    expectedSections: ['TEXT'],
    expectedDiagnosticCodes: [DiagnosticCode.UnknownFunction],
    features: ['taxonomy', 'analyzer-when'],
    text: promptDocument({
      TEXT: '{{#when::score::wat::10}}bad{{/}}',
    }),
  },
  {
    id: 'prompt-malformed-each-header',
    label: 'Prompt with #each header without alias',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-malformed-each-header.risuprompt',
    expectedSections: ['TEXT'],
    expectedDiagnosticCodes: [],
    features: ['taxonomy', 'analyzer-each'],
    text: promptDocument({
      TEXT: '{{#each items}}{{slot::item}}{{/each}}',
    }),
  },
  {
    id: 'prompt-alias-available',
    label: 'Prompt with alias availability info diagnostic',
    kind: 'edge-case',
    artifact: 'prompt',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-alias-available.risuprompt',
    expectedSections: ['TEXT'],
    expectedDiagnosticCodes: [DiagnosticCode.AliasAvailable],
    features: ['taxonomy', 'analyzer-alias'],
    text: promptDocument({
      TEXT: '{{gettempvar::cache}}',
    }),
  },
  {
    id: 'html-unclosed-macro',
    label: 'HTML with unclosed macro diagnostic',
    kind: 'edge-case',
    artifact: 'html',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-unclosed-macro.risuhtml',
    expectedSections: ['full'],
    expectedDiagnosticCodes: [DiagnosticCode.UnclosedMacro],
    features: ['malformed', 'taxonomy', 'full-document-fragment'],
    text: '<div>{{user</div>',
  },
  {
    id: 'lua-unclosed-macro',
    label: 'Lua with unclosed macro diagnostic',
    kind: 'edge-case',
    artifact: 'lua',
    cbsBearing: true,
    sourceKind: 'inline-document',
    relativePath: 'edge-unclosed-macro.risulua',
    expectedSections: ['full'],
    expectedDiagnosticCodes: [DiagnosticCode.UnclosedMacro],
    features: ['malformed', 'taxonomy', 'full-document-fragment'],
    text: 'local userName = "{{user"\nprint(userName)',
  },
];

// 최종 fixture corpus
// seed에 가상 경로와 URI를 붙여서 테스트가 실제 문서처럼 다루게 만드는 구간
export const CBS_LSP_FIXTURE_CORPUS: readonly FixtureCorpusEntry[] = Object.freeze(
  fixtureCorpusSeeds.map((entry) => {
    const filePath = `/fixtures/${entry.relativePath}`;
    const expectedDiagnosticCodes = entry.expectedDiagnosticCodes ?? [];

    return {
      ...entry,
      filePath,
      uri: `file://${filePath}`,
      expectedDiagnosticCodes,
      expectedDiagnosticRules: expectedDiagnosticCodes.map((code) => {
        const definition = DIAGNOSTIC_TAXONOMY[code];

        return {
          category: definition.category,
          code: definition.code,
          explanation: createDiagnosticRuleExplanation(definition.owner, definition.category),
          meaning: definition.meaning,
          owner: definition.owner,
          severity: definition.severity,
        } satisfies FixtureExpectedDiagnosticRule;
      }),
    };
  }),
);

const FORMATTING_CONTRACT_FIXTURE_IDS = [
  ['single-fragment', 'lorebook-basic'],
  ['multi-fragment', 'regex-basic'],
  ['pure-mode', 'lorebook-puredisplay-formatting'],
  ['malformed', 'lorebook-unclosed-macro'],
  ['unicode', 'lorebook-utf16-formatting'],
] as const satisfies readonly [FormattingContractCoverage, string][];

// red test matrix
// 어떤 fixture가 어떤 테스트 축을 대표하는지 고정하는 표
const fixtureRedTestMatrix: Record<FixtureMatrixArea, readonly string[]> = {
  service: [
    'lorebook-basic',
    'regex-basic',
    'regex-recover-out-with-malformed-in-header',
    'prompt-basic',
    'html-basic',
    'lua-basic',
    'toggle-excluded',
    'variable-excluded',
    'lorebook-empty-document',
    'lorebook-no-content-section',
  ],
  remap: ['lorebook-basic', 'lorebook-crlf', 'lorebook-utf16', 'regex-duplicate-fragments'],
  locator: ['lorebook-setvar-macro', 'prompt-basic', 'regex-block-header', 'regex-block-else'],
  'diagnostic-taxonomy': [
    'lorebook-unclosed-macro',
    'lorebook-unclosed-block',
    'lorebook-unknown-function',
    'lorebook-deprecated-block',
    'lorebook-legacy-angle',
  ],
};

export const FIXTURE_RED_TEST_MATRIX = Object.freeze(fixtureRedTestMatrix);

/**
 * listFixtureCorpusEntries 함수.
 * fixture corpus 전체를 반환하거나, kind에 맞는 fixture만 골라서 반환함.
 *
 * @param kind - representative, excluded, edge-case 중 필터링할 fixture 종류
 * @returns 조건에 맞는 fixture 목록
 */
export function listFixtureCorpusEntries(kind?: FixtureCorpusKind): readonly FixtureCorpusEntry[] {
  if (!kind) {
    return CBS_LSP_FIXTURE_CORPUS;
  }

  return CBS_LSP_FIXTURE_CORPUS.filter((entry) => entry.kind === kind);
}

/**
 * listMatrixFixtures 함수.
 * service, remap, locator 같은 테스트 축 이름으로 대표 fixture들을 꺼냄.
 *
 * @param area - 조회할 red test matrix 영역 이름
 * @returns 해당 테스트 축을 대표하는 fixture 목록
 */
export function listMatrixFixtures(area: FixtureMatrixArea): readonly FixtureCorpusEntry[] {
  return FIXTURE_RED_TEST_MATRIX[area].map((id) => getFixtureCorpusEntry(id));
}

/**
 * listFormattingContractFixtures 함수.
 * formatting golden test에서 공통 invariants를 검증할 fixture matrix를 반환함.
 *
 * @returns coverage 라벨과 fixture entry를 함께 담은 formatting contract fixture 목록
 */
export function listFormattingContractFixtures(): readonly FormattingContractFixtureCase[] {
  return FORMATTING_CONTRACT_FIXTURE_IDS.map(([coverage, id]) => ({
    coverage,
    entry: getFixtureCorpusEntry(id),
  }));
}

/**
 * getFixtureCorpusEntry 함수.
 * fixture id 하나로 corpus 안의 fixture 한 건을 바로 찾음.
 *
 * @param id - 찾고 싶은 fixture id
 * @returns id와 일치하는 fixture 한 건
 */
export function getFixtureCorpusEntry(id: string): FixtureCorpusEntry {
  const entry = CBS_LSP_FIXTURE_CORPUS.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Unknown cbs-lsp fixture corpus entry: ${id}`);
  }

  return entry;
}

/**
 * createFixtureRequest 함수.
 * fixture 한 건을 FragmentAnalysisService나 provider 테스트에 바로 넣을 요청 형태로 변환함.
 *
 * @param entry - 요청으로 바꿀 fixture 한 건
 * @param version - 테스트에서 사용할 문서 버전 값
 * @returns uri, version, filePath, text를 담은 테스트 요청 객체
 */
export function createFixtureRequest(
  entry: FixtureCorpusEntry,
  version: number | string = 1,
): {
  uri: string;
  version: number | string;
  filePath: string;
  text: string;
} {
  return {
    uri: entry.uri,
    version,
    filePath: entry.filePath,
    text: entry.text,
  };
}

/**
 * snapshotCompletionItems 함수.
 * completion 목록을 deterministic ordering의 normalized JSON view로 변환함.
 *
 * @param items - snapshot/golden 비교용으로 정규화할 completion 목록
 * @returns stable ordering과 stable field names를 가진 completion snapshot 배열
 */
export function snapshotCompletionItems(
  items: readonly CompletionItem[],
): NormalizedCompletionItemSnapshot[] {
  return normalizeCompletionItemsForSnapshot(items);
}

/**
 * snapshotHoverResult 함수.
 * hover 결과 하나를 snapshot-friendly normalized JSON view로 변환함.
 *
 * @param hover - 정규화할 hover payload
 * @returns stable field names를 가진 hover snapshot 또는 null
 */
export function snapshotHoverResult(hover: Hover | null): NormalizedHoverSnapshot | null {
  return normalizeHoverForSnapshot(hover);
}

/**
 * snapshotLuaHoverResult 함수.
 * live Lua hover payload를 deterministic ordering의 normalized snapshot으로 정규화함.
 *
 * @param hover - 정규화할 Lua hover 결과
 * @returns stable Lua hover snapshot
 */
export function snapshotLuaHoverResult(hover: Hover | null) {
  return normalizeLuaHoverForSnapshot(hover);
}

/**
 * snapshotLuaHoverEnvelope 함수.
 * Lua hover snapshot에 shared availability/provenance envelope를 붙임.
 *
 * @param hover - 정규화할 Lua hover 결과
 * @param lualsRuntime - snapshot에 반영할 LuaLS runtime 상태
 * @returns schema/version과 availability/provenance를 포함한 Lua hover snapshot view
 */
export function snapshotLuaHoverEnvelope(
  hover: Hover | null,
  lualsRuntime: LuaLsCompanionRuntime,
): NormalizedLuaHoverEnvelopeSnapshot {
  return normalizeLuaHoverEnvelopeForSnapshot(hover, lualsRuntime);
}

/**
 * snapshotHostDiagnostics 함수.
 * host LSP diagnostics 배열을 deterministic ordering의 normalized JSON view로 변환함.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns stable ordering과 relatedInformation shape를 가진 diagnostic snapshot 배열
 */
export function snapshotHostDiagnostics(
  diagnostics: readonly Diagnostic[],
): NormalizedHostDiagnosticSnapshot[] {
  return normalizeHostDiagnosticsForSnapshot(diagnostics);
}

/**
 * snapshotHostDiagnosticsEnvelope 함수.
 * host diagnostics snapshot에 runtime availability contract를 함께 묶음.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns diagnostics + availability를 함께 담은 snapshot view
 */
export function snapshotHostDiagnosticsEnvelope(
  diagnostics: readonly Diagnostic[],
  lualsRuntime?: LuaLsCompanionRuntime,
): NormalizedHostDiagnosticsEnvelopeSnapshot {
  return normalizeHostDiagnosticsEnvelopeForSnapshot(diagnostics, lualsRuntime);
}

/**
 * snapshotCodeActions 함수.
 * code action 목록을 deterministic ordering의 normalized JSON view로 변환함.
 *
 * @param actions - 정규화할 code action 목록
 * @returns linked diagnostic/edit/no-op 정보를 포함한 stable snapshot 배열
 */
export function snapshotCodeActions(
  actions: readonly CodeAction[],
): NormalizedCodeActionSnapshot[] {
  return normalizeCodeActionsForSnapshot(actions);
}

/**
 * snapshotCodeActionsEnvelope 함수.
 * code action snapshot에 runtime availability contract를 함께 묶음.
 *
 * @param actions - 정규화할 code action 목록
 * @returns code action + availability를 함께 담은 snapshot view
 */
export function snapshotCodeActionsEnvelope(
  actions: readonly CodeAction[],
): NormalizedCodeActionsEnvelopeSnapshot {
  return normalizeCodeActionsEnvelopeForSnapshot(actions);
}

/**
 * snapshotDocumentSymbols 함수.
 * document symbol 결과를 agent/golden 친화적인 stable tree로 정규화함.
 *
 * @param symbols - 정규화할 outline symbol 목록
 * @returns deterministic ordering을 가진 normalized symbol tree
 */
export function snapshotDocumentSymbols(
  symbols: readonly DocumentSymbol[],
): NormalizedDocumentSymbolSnapshot[] {
  return normalizeDocumentSymbolsForSnapshot(symbols);
}

/**
 * snapshotDocumentSymbolsEnvelope 함수.
 * document symbol snapshot에 shared availability/provenance envelope를 붙임.
 *
 * @param symbols - 정규화할 outline symbol 목록
 * @returns schema/version과 availability/provenance를 포함한 snapshot view
 */
export function snapshotDocumentSymbolsEnvelope(
  symbols: readonly DocumentSymbol[],
): NormalizedDocumentSymbolsEnvelopeSnapshot {
  return normalizeDocumentSymbolsEnvelopeForSnapshot(symbols);
}

/**
 * snapshotWorkspaceSymbols 함수.
 * workspace symbol 결과를 deterministic ordering의 normalized snapshot 배열로 변환함.
 *
 * @param symbols - 정규화할 workspace symbol 목록
 * @returns stable workspace symbol snapshot 배열
 */
export function snapshotWorkspaceSymbols(
  symbols: readonly SymbolInformation[],
): NormalizedWorkspaceSymbolSnapshot[] {
  return normalizeWorkspaceSymbolsForSnapshot(symbols);
}

/**
 * snapshotWorkspaceSymbolsEnvelope 함수.
 * workspace symbol snapshot에 shared availability/provenance envelope를 붙임.
 *
 * @param symbols - 정규화할 workspace symbol 목록
 * @returns schema/version과 availability/provenance를 포함한 snapshot view
 */
export function snapshotWorkspaceSymbolsEnvelope(
  symbols: readonly SymbolInformation[],
): NormalizedWorkspaceSymbolsEnvelopeSnapshot {
  return normalizeWorkspaceSymbolsEnvelopeForSnapshot(symbols);
}

/**
 * snapshotProviderBundle 함수.
 * 같은 문서 상태에서 여러 provider 결과를 snapshot/golden 친화적인 하나의 JSON shape로 묶음.
 *
 * @param bundle - completion/hover/diagnostics/code action 원본 payload 묶음
 * @returns stable field names와 deterministic ordering을 가진 provider bundle snapshot
 */
export function snapshotProviderBundle(bundle: {
  codeActions: readonly CodeAction[];
  codeLenses?: readonly CodeLens[];
  completion: readonly CompletionItem[];
  diagnostics: readonly Diagnostic[];
  documentSymbols: readonly DocumentSymbol[];
  hover: Hover | null;
}): NormalizedProviderBundleSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    codeActions: snapshotCodeActions(bundle.codeActions),
    ...(bundle.codeLenses ? { codeLenses: snapshotCodeLenses(bundle.codeLenses) } : {}),
    completion: snapshotCompletionItems(bundle.completion),
    diagnostics: snapshotHostDiagnostics(bundle.diagnostics),
    documentSymbols: snapshotDocumentSymbols(bundle.documentSymbols),
    hover: snapshotHoverResult(bundle.hover),
  };
}

/**
 * snapshotCodeLenses 함수.
 * CodeLens 결과를 deterministic ordering의 normalized snapshot 배열로 변환함.
 *
 * @param lenses - 정규화할 CodeLens 목록
 * @returns count/command/cycle semantics를 포함한 stable CodeLens snapshot 배열
 */
export function snapshotCodeLenses(
  lenses: readonly CodeLens[],
): NormalizedCodeLensSnapshot[] {
  return normalizeCodeLensesForSnapshot(lenses);
}

/**
 * snapshotCodeLensesEnvelope 함수.
 * CodeLens snapshot에 shared availability/provenance envelope를 붙임.
 *
 * @param lenses - 정규화할 CodeLens 목록
 * @returns schema/version과 availability/provenance를 포함한 CodeLens snapshot view
 */
export function snapshotCodeLensesEnvelope(
  lenses: readonly CodeLens[],
): NormalizedCodeLensesEnvelopeSnapshot {
  return normalizeCodeLensesEnvelopeForSnapshot(lenses);
}

/**
 * serializeCodeLensesEnvelopeForGolden 함수.
 * CodeLens envelope snapshot을 deterministic JSON 문자열로 직렬화함.
 *
 * @param snapshot - 직렬화할 CodeLens envelope snapshot
 * @returns golden 비교용 deterministic JSON 문자열
 */
export function serializeCodeLensesEnvelopeForGolden(
  snapshot: NormalizedCodeLensesEnvelopeSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * serializeDocumentSymbolsEnvelopeForGolden 함수.
 * document symbol envelope snapshot을 deterministic JSON 문자열로 직렬화함.
 *
 * @param snapshot - 직렬화할 document symbol envelope
 * @returns golden 비교용 deterministic JSON 문자열
 */
export function serializeDocumentSymbolsEnvelopeForGolden(
  snapshot: NormalizedDocumentSymbolsEnvelopeSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * serializeWorkspaceSymbolsEnvelopeForGolden 함수.
 * workspace symbol envelope snapshot을 deterministic JSON 문자열로 직렬화함.
 *
 * @param snapshot - 직렬화할 workspace symbol envelope
 * @returns golden 비교용 deterministic JSON 문자열
 */
export function serializeWorkspaceSymbolsEnvelopeForGolden(
  snapshot: NormalizedWorkspaceSymbolsEnvelopeSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * snapshotLayer1Contracts 함수.
 * Layer 1 registry/graph public contract를 fixture/golden 친화적인 JSON shape로 묶음.
 *
 * @param registry - Layer 1 ElementRegistry snapshot
 * @param graph - Layer 1 UnifiedVariableGraph snapshot
 * @returns Layer 1 public contract bundle
 */
export function snapshotLayer1Contracts(
  registry: NormalizedLayer1ContractSnapshot['registry'],
  graph: NormalizedLayer1ContractSnapshot['graph'],
): NormalizedLayer1ContractSnapshot {
  return createLayer1ContractsSnapshot(registry, graph);
}

/**
 * snapshotLayer3Queries 함수.
 * Layer 3 variable-flow/activation query 결과를 fixture/golden 친화적인 JSON shape로 묶음.
 *
 * @param bundle - Layer 3 query payload 묶음
 * @returns Layer 3 public contract bundle
 */
export function snapshotLayer3Queries(bundle: {
  activationChain: NormalizedLayer3QuerySnapshot['activationChain'];
  variableFlow: NormalizedLayer3QuerySnapshot['variableFlow'];
}): NormalizedLayer3QuerySnapshot {
  return createLayer3QueriesSnapshot(bundle);
}

/**
 * serializeAgentContractForGolden 함수.
 * Layer 1/3 public contract bundle을 deterministic JSON 문자열로 직렬화함.
 *
 * @param contract - 직렬화할 Layer 1/3 contract snapshot
 * @returns golden 비교용 deterministic JSON 문자열
 */
export function serializeAgentContractForGolden(
  contract: NormalizedLayer1ContractSnapshot | NormalizedLayer3QuerySnapshot,
): string {
  return JSON.stringify(contract, null, 2);
}

/**
 * serializeProviderBundleForGolden 함수.
 * normalized provider bundle을 stable indentation의 JSON 문자열로 직렬화함.
 *
 * @param bundle - 직렬화할 normalized provider bundle snapshot
 * @returns golden 비교용 deterministic JSON 문자열
 */
export function serializeProviderBundleForGolden(
  bundle: NormalizedProviderBundleSnapshot,
): string {
  return JSON.stringify(bundle, null, 2);
}

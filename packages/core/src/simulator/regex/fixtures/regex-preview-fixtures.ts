/**
 * Regex preview simulator parity fixture corpus.
 * @file packages/core/src/simulator/regex/fixtures/regex-preview-fixtures.ts
 */
import type { SimulatorSafetyLimits } from '../shared';
import { DEFAULT_SIMULATOR_SAFETY_LIMITS } from '../shared';
import type { RegexPreviewConfidence } from '../types';

/**
 * RegexPreviewFixture 인터페이스.
 * High-level regex preview simulator가 검증할 입력과 기대 출력을 묶음.
 */
export interface RegexPreviewFixture {
  /** Stable fixture id used in tests and evidence. */
  id: string;
  /** Human-readable fixture name for diagnostics. */
  name: string;
  /** Raw `.risuregex` document parsed by the preview simulator. */
  rawDocument: string;
  /** Sample input used by native match and replacement preview. */
  sampleInput: string;
  /** Exact match texts expected from native preview collection. */
  expectedMatchTexts: string[];
  /** Exact replacement preview output expected for the sample input. */
  expectedReplacementOutput: string;
  /** Expected directive parity confidence for the replacement plan. */
  expectedConfidence: RegexPreviewConfidence;
}

/** Default regex preview fixture safety limits. */
export const DEFAULT_LIMITS: SimulatorSafetyLimits = {
  ...DEFAULT_SIMULATOR_SAFETY_LIMITS,
};

/** Shared regex preview fixtures covering verified native and simulated directive paths. */
export const REGEX_PREVIEW_FIXTURES: readonly RegexPreviewFixture[] = [
  {
    id: 'js-global-capture-replacement',
    name: 'JavaScript global capture replacement',
    rawDocument: createRisuRegexDocument({
      comment: 'js-global-capture-replacement',
      flag: 'g',
      input: 'HP:(\\d+)',
      output: 'HP=$1',
    }),
    sampleInput: 'HP:12 MP:7',
    expectedMatchTexts: ['HP:12'],
    expectedReplacementOutput: 'HP=12 MP:7',
    expectedConfidence: 'verified',
  },
  {
    id: 'move-top-directive-starts-simulated',
    name: 'Move-top directive starts simulated',
    rawDocument: createRisuRegexDocument({
      comment: 'move-top-directive-starts-simulated',
      flag: 'g<move_top>',
      input: '\\[status\\]',
      output: 'STATUS',
    }),
    sampleInput: 'hello [status]',
    expectedMatchTexts: ['[status]'],
    expectedReplacementOutput: 'hello STATUS',
    expectedConfidence: 'simulated',
  },
] as const;

/**
 * createRisuRegexDocument 함수.
 * Fixture 한 건을 canonical `.risuregex` raw document로 변환함.
 *
 * @param options - frontmatter flag와 IN/OUT section 값
 * @returns parseRegexContent가 읽을 수 있는 raw document
 */
function createRisuRegexDocument(options: {
  comment: string;
  flag: string;
  input: string;
  output: string;
}): string {
  return [
    '---',
    `comment: ${options.comment}`,
    'type: editprocess',
    'ableFlag: true',
    `flag: ${JSON.stringify(options.flag)}`,
    '---',
    '@@@ IN',
    options.input,
    '@@@ OUT',
    options.output,
    '',
  ].join('\n');
}

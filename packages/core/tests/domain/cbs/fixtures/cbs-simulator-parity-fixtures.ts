/**
 * CBS simulator parity 테스트에서 공유하는 upstream intent fixture corpus.
 * @file packages/core/tests/domain/cbs/fixtures/cbs-simulator-parity-fixtures.ts
 */
import {
  CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
  createUnsupportedMacroIntent,
  type CbsSupportClass,
} from '../../../../src/domain';

export type CbsSimulatorParityPriority = 'P0' | 'P1';

export interface CbsSimulatorParityFixture {
  /** Fixture를 식별하는 안정적인 이름. */
  name: string;
  /** Upstream parity 우선순위. */
  priority: CbsSimulatorParityPriority;
  /** 실행하지 않고 문서화하는 CBS input source. */
  source: string;
  /** 이후 evaluator task가 검증할 예상 출력 의도. */
  expectedOutput?: string;
  /** Fixture가 주로 커버하는 support class. */
  supportClass: CbsSupportClass;
  /** Upstream test text reference. Source code import 없이 경로/라인만 기록함. */
  upstreamRefs: string[];
  /** Deterministic providers/context hints. */
  context?: Record<string, unknown>;
  /** Dry-run simulator가 기록해야 하는 side effects. */
  expectedEffects?: Array<{ type: string; key: string; value: string }>;
  /** Unsupported macro 보존/진단 의도. */
  unsupportedIntent?: ReturnType<typeof createUnsupportedMacroIntent>;
}

export const CBS_SIMULATOR_FIXED_CLOCK_ISO = '2026-05-05T00:00:00.000Z';
export const CBS_SIMULATOR_FIXED_CLOCK_TIME = '00:00:00';
export const CBS_SIMULATOR_RANDOM_SEQUENCE = [0.1, 0.9] as const;

/**
 * CBS_SIMULATOR_PARITY_FIXTURES 상수.
 * P0/P1 upstream parity 의도를 실행 코드 없이 source fixture로 고정함.
 */
export const CBS_SIMULATOR_PARITY_FIXTURES: readonly CbsSimulatorParityFixture[] = [
  {
    name: 'unknown macro preserves source',
    priority: 'P0',
    source: 'Hello {{not_a_macro::x}}',
    expectedOutput: 'Hello {{not_a_macro::x}}',
    supportClass: 'unsupported',
    upstreamRefs: ['risu-pork/src/ts/parser/parser.svelte unknown matcher fallback behavior'],
    unsupportedIntent: createUnsupportedMacroIntent(
      'Hello {{not_a_macro::x}}',
      '{{not_a_macro::x}}',
      'not_a_macro',
    ),
  },
  {
    name: 'nested equal resolves user identity',
    priority: 'P0',
    source: '{{equal::{{user}}::Noel}}',
    expectedOutput: '1',
    supportClass: 'supported',
    upstreamRefs: ['risu-pork/src/ts/parser/tests/cbs/conditionals.test.ts equality operator intent'],
    context: { user: 'Noel' },
  },
  {
    name: 'variable precedence uses chat before character and template defaults',
    priority: 'P0',
    source: '{{getvar::mood}}',
    expectedOutput: 'calm',
    supportClass: 'supported',
    upstreamRefs: ['local simulator Task 4 variable precedence contract'],
    context: {
      chatVariables: { mood: 'calm' },
      characterDefaultVariables: { mood: 'angry' },
      templateDefaultVariables: { mood: 'sad' },
    },
  },
  {
    name: 'variable precedence missing value returns null intent',
    priority: 'P1',
    source: '{{getvar::missing_mood}}',
    expectedOutput: 'null',
    supportClass: 'supported',
    upstreamRefs: ['local simulator Task 4 missing variable fallback contract'],
    context: {
      chatVariables: {},
      characterDefaultVariables: {},
      templateDefaultVariables: {},
    },
  },
  {
    name: '#when truthy renders body',
    priority: 'P0',
    source: '{{#when::1}}yes{{/}}',
    expectedOutput: 'yes',
    supportClass: 'supported',
    upstreamRefs: ['risu-pork/src/ts/parser/tests/cbs/conditionals.test.ts:167'],
  },
  {
    name: '#when false renders else body',
    priority: 'P0',
    source: '{{#when::0}}yes{{:else}}no{{/}}',
    expectedOutput: 'no',
    supportClass: 'supported',
    upstreamRefs: ['risu-pork/src/ts/parser/tests/cbs/conditionals.test.ts:323'],
  },
  {
    name: '#each array literal binds slot item',
    priority: 'P0',
    source: '{{#each ["a","b"] as item}}{{slot::item}}{{/}}',
    expectedOutput: 'ab',
    supportClass: 'supported',
    upstreamRefs: ['risu-pork/src/ts/parser/tests/cbs/loop.test.ts:60'],
  },
  {
    name: 'fixed clock uses injected provider',
    priority: 'P1',
    source: '{{isotime}}',
    expectedOutput: CBS_SIMULATOR_FIXED_CLOCK_TIME,
    supportClass: 'supported',
    upstreamRefs: ['local simulator deterministic provider requirement'],
    context: { clockIso: CBS_SIMULATOR_FIXED_CLOCK_ISO },
  },
  {
    name: 'random sequence uses injected rng values',
    priority: 'P1',
    source: '{{random::a::b}} {{random::a::b}}',
    expectedOutput: 'a b',
    supportClass: 'supported',
    upstreamRefs: ['risu-pork/src/ts/parser/tests/cbs/strings.test.ts random choice pattern'],
    context: { randomSequence: CBS_SIMULATOR_RANDOM_SEQUENCE },
  },
  {
    name: 'setvar records effect only',
    priority: 'P0',
    source: '{{setvar::mood::calm}}',
    expectedOutput: '',
    supportClass: 'effect-only',
    upstreamRefs: ['local simulator dry-run side-effect requirement'],
    expectedEffects: [{ type: 'setvar', key: 'mood', value: 'calm' }],
  },
];

/**
 * getCbsSimulatorParityFixture 함수.
 * 안정적인 fixture name으로 parity intent fixture를 조회함.
 *
 * @param name - 조회할 fixture 이름
 * @returns fixture 또는 undefined
 */
export function getCbsSimulatorParityFixture(
  name: string,
): CbsSimulatorParityFixture | undefined {
  return CBS_SIMULATOR_PARITY_FIXTURES.find((fixture) => fixture.name === name);
}

export { CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE };

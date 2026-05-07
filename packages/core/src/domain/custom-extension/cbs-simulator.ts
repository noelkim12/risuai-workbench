/**
 * custom-extension CBS fragment 시뮬레이션 어댑터.
 * @file packages/core/src/domain/custom-extension/cbs-simulator.ts
 */
import { simulateCbsText } from '../cbs/simulator';
import type {
  CbsSimulationContext,
  CbsSimulationDiagnostic,
  CbsSimulationEffect,
  CbsSimulationOptions,
  CbsSimulationResult,
  CbsSimulationStatus,
  CbsSimulationTraceEvent,
  CbsSimulatorCoverage,
} from '../cbs/simulator';
import type { Range } from '../cbs/parser/tokens';
import type { CustomExtensionArtifact } from './contracts';
import { CbsFragmentMappingError, mapToCbsFragments } from './cbs-fragments';
import type { CbsFragment, CbsFragmentMap } from './cbs-fragments';

/** 각 fragment 시뮬레이션 실행에 전달되는 옵션. */
export interface CustomExtensionCbsSimulationOptions {
  /** 각 fragment에 대해 `simulateCbsText`가 사용하는 런타임 컨텍스트. */
  context?: Partial<CbsSimulationContext>;
  /** 각 fragment에 대해 `simulateCbsText`가 사용하는 예산(budget) 및 프로바이더 재정의(overrides). */
  simulationOptions?: Partial<CbsSimulationOptions>;
}

/** CBS fragment와 해당 fragment의 독립적인 시뮬레이터 결과. */
export interface CustomExtensionCbsFragmentSimulationDetail {
  /** 집계된 이벤트를 다시 해당 fragment로 연결하기 위한 고유 식별자. */
  id: string;
  /** `mapToCbsFragments`에서 전달된 원본 fragment 순서. */
  index: number;
  /** custom-extension 매퍼의 fragment 섹션 이름. */
  section: string;
  /** 원본 custom-extension 문서 내의 fragment 시작 오프셋. */
  start: number;
  /** 원본 custom-extension 문서 내의 fragment 끝 오프셋. */
  end: number;
  /** `simulateCbsText`에 전달된 정확한 CBS 포함 fragment 내용. */
  content: string;
  /** 집계 범위 조정 전의 이 fragment에 대한 구조화된 시뮬레이터 결과. */
  result: CbsSimulationResult;
}

/** 집계된 custom-extension fragment 시뮬레이션 결과. */
export interface CustomExtensionCbsSimulationResult {
  /** 어댑터에 전달된 artifact. */
  artifact: CustomExtensionArtifact;
  /** 모든 fragment에 걸친 최종적인 보수적 집계 상태. */
  status: CbsSimulationStatus;
  /** `mapToCbsFragments`가 반환한 fragment 맵. */
  fragmentMap: CbsFragmentMap;
  /** 순서대로 정렬된 fragment별 시뮬레이션 상세 정보. */
  fragments: CustomExtensionCbsFragmentSimulationDetail[];
  /** fragment 식별자와 문서 상대 좌표 범위가 포함된 집계된 진단 정보. */
  diagnostics: CbsSimulationDiagnostic[];
  /** fragment 식별자와 문서 상대 좌표 범위가 포함된 집계된 드라이런(dry-run) 효과. */
  effects: CbsSimulationEffect[];
  /** fragment 식별자와 문서 상대 좌표 범위가 포함된 집계된 추적(trace) 정보. */
  trace: CbsSimulationTraceEvent[];
  /** 모든 fragment에 걸친 집계된 매크로 커버리지. */
  coverage: CbsSimulatorCoverage;
}

const EMPTY_COVERAGE: CbsSimulatorCoverage = {
  totalMacros: 0,
  bySupportClass: {},
  unknownMacros: [],
  byMacroName: {},
};

/**
 * simulateCustomExtensionCbsFragments 함수.
 * custom-extension artifact를 CBS fragments로 매핑한 뒤 각 fragment를 독립적으로 dry-run simulation함.
 *
 * @param artifact - simulation 대상 custom-extension artifact 종류
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @param options - fragment별 simulator context/options
 * @returns fragment metadata와 aggregate simulator 결과
 */
export function simulateCustomExtensionCbsFragments(
  artifact: CustomExtensionArtifact,
  rawContent: string,
  options: CustomExtensionCbsSimulationOptions = {},
): CustomExtensionCbsSimulationResult {
  let fragmentMap: CbsFragmentMap;

  try {
    fragmentMap = mapToCbsFragments(artifact, rawContent);
  } catch (error) {
    return createMappingErrorResult(artifact, rawContent, error);
  }

  const lineStarts = buildLineStarts(rawContent);
  const fragments = fragmentMap.fragments.map((fragment, index) => {
    const result = simulateCbsText(fragment.content, options.context, options.simulationOptions);
    return createFragmentDetail(fragment, index, result);
  });

  return {
    artifact,
    status: aggregateStatus(fragments.map((fragment) => fragment.result.status)),
    fragmentMap,
    fragments,
    diagnostics: fragments.flatMap((fragment) =>
      fragment.result.diagnostics.map((diagnostic) => annotateDiagnostic(diagnostic, fragment, lineStarts)),
    ),
    effects: fragments.flatMap((fragment) =>
      fragment.result.effects.map((effect) => annotateEffect(effect, fragment, lineStarts)),
    ),
    trace: fragments.flatMap((fragment) =>
      fragment.result.trace.map((event) => annotateTraceEvent(event, fragment, lineStarts)),
    ),
    coverage: aggregateCoverage(fragments.map((fragment) => fragment.result.coverage)),
  };
}

/**
 * createFragmentDetail 함수.
 * mapper fragment metadata와 simulation result를 caller-facing detail 형태로 고정함.
 *
 * @param fragment - `mapToCbsFragments`가 반환한 원본 fragment
 * @param index - 원본 fragments 배열 순서
 * @param result - 해당 fragment의 simulator 결과
 * @returns per-fragment simulation detail
 */
function createFragmentDetail(
  fragment: CbsFragment,
  index: number,
  result: CbsSimulationResult,
): CustomExtensionCbsFragmentSimulationDetail {
  return {
    id: createFragmentId(fragment, index),
    index,
    section: fragment.section,
    start: fragment.start,
    end: fragment.end,
    content: fragment.content,
    result,
  };
}

/**
 * createMappingErrorResult 함수.
 * fragment mapping 실패를 simulator aggregate contract 안의 structured diagnostic으로 변환함.
 *
 * @param artifact - mapping을 시도한 artifact 종류
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @param error - mapper에서 throw된 오류
 * @returns error 상태의 aggregate simulation result
 */
function createMappingErrorResult(
  artifact: CustomExtensionArtifact,
  rawContent: string,
  error: unknown,
): CustomExtensionCbsSimulationResult {
  const message = error instanceof Error ? error.message : 'Unknown CBS fragment mapping error';
  const diagnostic: CbsSimulationDiagnostic = {
    source: 'simulator',
    severity: 'error',
    code: 'CBSSIM_FRAGMENT_MAPPING',
    message,
    range: createFullRange(rawContent),
    data: {
      artifact,
      mapper: error instanceof CbsFragmentMappingError ? 'mapToCbsFragments' : 'unknown',
    },
  };

  return {
    artifact,
    status: 'error',
    fragmentMap: {
      artifact,
      fragments: [],
      fileLength: rawContent.length,
    },
    fragments: [],
    diagnostics: [diagnostic],
    effects: [],
    trace: [
      {
        phase: 'diagnostic',
        message: 'custom-extension CBS fragment mapping failed',
        range: diagnostic.range,
        details: diagnostic.data as Readonly<Record<string, unknown>>,
      },
    ],
    coverage: { ...EMPTY_COVERAGE, bySupportClass: {}, unknownMacros: [], byMacroName: {} },
  };
}

/**
 * aggregateStatus 함수.
 * per-fragment status를 error > aborted > partial > ok 순서로 보수적으로 축약함.
 *
 * @param statuses - fragment별 simulator status 목록
 * @returns aggregate status
 */
function aggregateStatus(statuses: readonly CbsSimulationStatus[]): CbsSimulationStatus {
  if (statuses.includes('error')) {
    return 'error';
  }
  if (statuses.includes('aborted')) {
    return 'aborted';
  }
  if (statuses.includes('partial')) {
    return 'partial';
  }
  return 'ok';
}

/**
 * aggregateCoverage 함수.
 * fragment별 coverage counters를 합산하고 unknown macro 목록은 순서 유지 dedupe함.
 *
 * @param coverages - fragment별 simulator coverage 목록
 * @returns aggregate simulator coverage
 */
function aggregateCoverage(coverages: readonly CbsSimulatorCoverage[]): CbsSimulatorCoverage {
  const coverage: CbsSimulatorCoverage = {
    totalMacros: 0,
    bySupportClass: {},
    unknownMacros: [],
    byMacroName: {},
  };
  const unknownMacroSet = new Set<string>();

  for (const fragmentCoverage of coverages) {
    coverage.totalMacros += fragmentCoverage.totalMacros;

    for (const [supportClass, count] of Object.entries(fragmentCoverage.bySupportClass)) {
      coverage.bySupportClass[supportClass as keyof CbsSimulatorCoverage['bySupportClass']] =
        (coverage.bySupportClass[supportClass as keyof CbsSimulatorCoverage['bySupportClass']] ?? 0) + count;
    }

    for (const macroName of fragmentCoverage.unknownMacros) {
      if (!unknownMacroSet.has(macroName)) {
        unknownMacroSet.add(macroName);
        coverage.unknownMacros.push(macroName);
      }
    }

    for (const [macroName, count] of Object.entries(fragmentCoverage.byMacroName)) {
      coverage.byMacroName[macroName] = (coverage.byMacroName[macroName] ?? 0) + count;
    }
  }

  return coverage;
}

/**
 * annotateDiagnostic 함수.
 * aggregate diagnostics에 fragment id를 부여하고 range를 원본 문서 좌표로 변환함.
 *
 * @param diagnostic - fragment-local simulator diagnostic
 * @param fragment - diagnostic이 발생한 fragment detail
 * @param lineStarts - 원본 문서 line start offsets
 * @returns aggregate diagnostic
 */
function annotateDiagnostic(
  diagnostic: CbsSimulationDiagnostic,
  fragment: CustomExtensionCbsFragmentSimulationDetail,
  lineStarts: readonly number[],
): CbsSimulationDiagnostic {
  return {
    ...diagnostic,
    message: `[${fragment.id}] ${diagnostic.message}`,
    range: translateRange(diagnostic.range, fragment.content, fragment.start, lineStarts),
    relatedInformation: diagnostic.relatedInformation?.map((info) => ({
      ...info,
      range: translateRange(info.range, fragment.content, fragment.start, lineStarts),
    })),
    data: {
      ...(isRecord(diagnostic.data) ? diagnostic.data : {}),
      fragmentId: fragment.id,
      fragmentIndex: fragment.index,
      section: fragment.section,
      start: fragment.start,
      end: fragment.end,
    },
  };
}

/**
 * annotateEffect 함수.
 * aggregate effects에 fragment source metadata와 원본 문서 range를 부여함.
 *
 * @param effect - fragment-local simulator effect
 * @param fragment - effect가 발생한 fragment detail
 * @param lineStarts - 원본 문서 line start offsets
 * @returns aggregate effect
 */
function annotateEffect(
  effect: CbsSimulationEffect,
  fragment: CustomExtensionCbsFragmentSimulationDetail,
  lineStarts: readonly number[],
): CbsSimulationEffect {
  return {
    ...effect,
    range: effect.range ? translateRange(effect.range, fragment.content, fragment.start, lineStarts) : undefined,
    source: effect.source,
    target: effect.target,
    operation: effect.operation,
    fragmentId: fragment.id,
    fragmentIndex: fragment.index,
    section: fragment.section,
    fragmentStart: fragment.start,
    fragmentEnd: fragment.end,
  };
}

/**
 * annotateTraceEvent 함수.
 * aggregate trace events에 fragment id와 document-relative range/details를 부여함.
 *
 * @param event - fragment-local trace event
 * @param fragment - event가 발생한 fragment detail
 * @param lineStarts - 원본 문서 line start offsets
 * @returns aggregate trace event
 */
function annotateTraceEvent(
  event: CbsSimulationTraceEvent,
  fragment: CustomExtensionCbsFragmentSimulationDetail,
  lineStarts: readonly number[],
): CbsSimulationTraceEvent {
  return {
    ...event,
    message: `[${fragment.id}] ${event.message}`,
    range: event.range ? translateRange(event.range, fragment.content, fragment.start, lineStarts) : undefined,
    details: {
      ...(event.details ?? {}),
      fragmentId: fragment.id,
      fragmentIndex: fragment.index,
      section: fragment.section,
      start: fragment.start,
      end: fragment.end,
    },
  };
}

/**
 * translateRange 함수.
 * fragment-local line/character range를 원본 custom-extension 문서 range로 변환함.
 *
 * @param range - fragment-local range
 * @param fragmentContent - fragment source text
 * @param fragmentStart - 원본 문서 내 fragment 시작 offset
 * @param documentLineStarts - 원본 문서 line start offsets
 * @returns document-relative range
 */
function translateRange(
  range: Range,
  fragmentContent: string,
  fragmentStart: number,
  documentLineStarts: readonly number[],
): Range {
  const fragmentLineStarts = buildLineStarts(fragmentContent);
  return {
    start: offsetToPosition(
      fragmentStart + positionToOffset(range.start.line, range.start.character, fragmentLineStarts),
      documentLineStarts,
    ),
    end: offsetToPosition(
      fragmentStart + positionToOffset(range.end.line, range.end.character, fragmentLineStarts),
      documentLineStarts,
    ),
  };
}

/**
 * createFragmentId 함수.
 * section 이름과 순서를 결합한 stable fragment id를 생성함.
 *
 * @param fragment - id에 포함할 섹션 메타데이터
 * @param index - 원본 fragments 배열 순서
 * @returns 고유 fragment 식별자
 */
function createFragmentId(fragment: CbsFragment, index: number): string {
  return `${index + 1}:${fragment.section}`;
}

/**
 * buildLineStarts 함수.
 * UTF-16 문자열 offset 기준 line start offset 배열을 생성함.
 *
 * @param source - 줄 시작 위치를 계산할 소스 텍스트
 * @returns 줄별 시작 오프셋 배열
 */
function buildLineStarts(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}

/**
 * positionToOffset 함수.
 * line/character position을 source-local UTF-16 offset으로 변환함.
 *
 * @param line - 0부터 시작하는 줄 번호
 * @param character - 해당 줄 내의 0부터 시작하는 UTF-16 문자 오프셋
 * @param lineStarts - 소스 줄 시작 오프셋 목록
 * @returns 소스 로컬 UTF-16 오프셋
 */
function positionToOffset(line: number, character: number, lineStarts: readonly number[]): number {
  const lineStart = lineStarts[line] ?? lineStarts[lineStarts.length - 1] ?? 0;
  return lineStart + character;
}

/**
 * offsetToPosition 함수.
 * source UTF-16 offset을 line/character position으로 변환함.
 *
 * @param offset - 소스 로컬 UTF-16 오프셋
 * @param lineStarts - 소스 줄 시작 오프셋 목록
 * @returns 0부터 시작하는 줄/문자 위치
 */
function offsetToPosition(offset: number, lineStarts: readonly number[]): Range['start'] {
  let line = 0;
  for (let index = 0; index < lineStarts.length; index += 1) {
    if (lineStarts[index] > offset) {
      break;
    }
    line = index;
  }
  return {
    line,
    character: offset - (lineStarts[line] ?? 0),
  };
}

/**
 * createFullRange 함수.
 * 전체 raw content를 가리키는 document range를 생성함.
 *
 * @param rawContent - 원본 custom-extension 문서 문자열
 * @returns 문서 전체 범위
 */
function createFullRange(rawContent: string): Range {
  const lineStarts = buildLineStarts(rawContent);
  return {
    start: { line: 0, character: 0 },
    end: offsetToPosition(rawContent.length, lineStarts),
  };
}

/**
 * isRecord 함수.
 * unknown diagnostic data가 spread 가능한 record인지 확인함.
 *
 * @param value - 확인할 값
 * @returns 일반 객체 레코드 여부
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

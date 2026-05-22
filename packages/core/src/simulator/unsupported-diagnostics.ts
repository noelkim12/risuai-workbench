/**
 * CBS simulator의 unsupported macro 진단 의도를 정의하는 헬퍼 모음.
 * @file packages/core/src/domain/cbs/simulator/unsupported-diagnostics.ts
 */
import type { CbsSupportClass } from './support-classification';

/** Unsupported macro를 보존 출력할 때 쓰는 deterministic diagnostic code. */
export const CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE = 'CBSSIM001';

/** Simulator fixture가 기대하는 최소 진단 형태. */
export interface CbsSimulatorDiagnosticIntent {
  /** Deterministic diagnostic code. */
  code: typeof CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE;
  /** 진단 대상 macro name. */
  macroName: string;
  /** 진단 severity. */
  severity: 'warning';
  /** 원본 source 보존 여부. */
  preservesSource: true;
}

/** Unknown macro fixture의 source preservation 의도. */
export interface CbsUnsupportedMacroIntent {
  /** 전체 CBS source. */
  source: string;
  /** 원본 그대로 보존해야 하는 macro source 조각. */
  preservedSource: string;
  /** Coverage에서 사용할 지원 등급 의도. */
  supportClass: Extract<CbsSupportClass, 'unsupported'>;
  /** Unsupported macro 진단 의도. */
  diagnostics: CbsSimulatorDiagnosticIntent[];
}

/**
 * createUnsupportedMacroIntent 함수.
 * Unknown macro의 source preservation과 deterministic diagnostic 의도를 구성함.
 *
 * @param source - 전체 CBS source
 * @param preservedSource - 보존해야 하는 원본 macro source 조각
 * @param macroName - 진단에 기록할 unknown macro 이름
 * @returns unknown macro fixture 의도
 */
export function createUnsupportedMacroIntent(
  source: string,
  preservedSource: string,
  macroName: string,
): CbsUnsupportedMacroIntent {
  return {
    source,
    preservedSource,
    supportClass: 'unsupported',
    diagnostics: [
      {
        code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
        macroName,
        severity: 'warning',
        preservesSource: true,
      },
    ],
  };
}

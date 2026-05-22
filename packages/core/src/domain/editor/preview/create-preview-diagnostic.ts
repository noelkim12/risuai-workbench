/**
 * CBS simulator diagnostic을 preview DTO diagnostic으로 변환하는 공통 helper.
 * @file packages/core/src/domain/editor/preview/create-preview-diagnostic.ts
 */

import type { CbsSimulationDiagnostic } from '../../../simulator';
import type { EditorPreviewDiagnostic } from './types';

/**
 * createPreviewDiagnostic 함수.
 * CBS simulator diagnostic을 editor preview DTO가 쓰는 최소 diagnostic으로 축약합니다.
 *
 * @param diagnostic - format별 preview 평가 중 simulator가 생성한 diagnostic
 * @returns preview 결과에 포함할 diagnostic DTO
 */
export function createPreviewDiagnostic(diagnostic: CbsSimulationDiagnostic): EditorPreviewDiagnostic {
  return {
    severity: diagnostic.severity,
    message: diagnostic.message,
    code: diagnostic.code,
  };
}

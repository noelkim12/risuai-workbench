/**
 * Preview adapter가 공유하는 공통 DTO 타입.
 * @file packages/core/src/domain/editor/preview/types.ts
 */

/** Preview adapter가 반환할 수 있는 실행 상태. */
export type EditorPreviewStatus = 'ok' | 'partial' | 'aborted' | 'error';

/** Preview 결과에 포함할 최소 diagnostic DTO. */
export interface EditorPreviewDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
}

/** Preview 결과 metadata가 반드시 포함하는 format 식별자. */
export interface EditorPreviewMetadataBase {
  format: string;
}

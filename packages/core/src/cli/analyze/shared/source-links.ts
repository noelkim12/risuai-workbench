import type { AnalysisVisualizationDoc, VisualizationSource } from './visualization-types';

/**
 * label/path 조합 기반 stable source ID 생성
 * @param label - source 표시 라벨
 * @param path - source 경로
 * @returns 정규화된 source ID
 */
export function createSourceId(label: string, path?: string): string {
  return `${label}::${path || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'source';
}

/**
 * 중복 source ID 정규화
 * @param sources - source 목록
 * @returns 중복 제거된 source 목록
 */
export function dedupeSources(sources: VisualizationSource[]): VisualizationSource[] {
  const seen = new Map<string, VisualizationSource>();
  for (const source of sources) {
    if (!seen.has(source.id)) {
      seen.set(source.id, source);
    }
  }
  return [...seen.values()];
}

/**
 * source ID 기준 source 조회
 * @param doc - source 목록을 포함한 visualization 문서
 * @param sourceId - 조회할 source ID
 * @returns 찾은 source 또는 null
 */
export function resolveSource(
  doc: Pick<AnalysisVisualizationDoc, 'sources'>,
  sourceId: string,
): VisualizationSource | null {
  return doc.sources.find((source) => source.id === sourceId) ?? null;
}

/**
 * source ID 배열을 읽기 쉬운 라벨 문자열로 변환
 * @param doc - source 목록을 포함한 visualization 문서
 * @param sourceIds - 변환할 source ID 목록
 * @returns 쉼표로 연결된 source 라벨 문자열
 */
export function formatSourceLabels(
  doc: Pick<AnalysisVisualizationDoc, 'sources'>,
  sourceIds: string[],
): string {
  return sourceIds
    .map((sourceId) => resolveSource(doc, sourceId)?.label ?? sourceId)
    .join(', ');
}

/**
 * source 목록에 항목 등록 후 stable ID 반환
 * @param sources - 등록 대상 source 목록
 * @param label - source 표시 라벨
 * @param elementType - source element 타입
 * @param path - source 경로
 * @returns 등록된 source ID
 */
export function registerSource(
  sources: VisualizationSource[],
  label: string,
  elementType: string,
  path?: string,
): string {
  const id = createSourceId(label, path ?? elementType);
  if (!sources.some((source) => source.id === id)) {
    sources.push({ id, label, elementType, path });
  }
  return id;
}

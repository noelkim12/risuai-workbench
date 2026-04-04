import type { VisualizationSource } from './visualization-types';

/** label/path 조합으로 안정적인 source id를 생성한다. */
export function createSourceId(label: string, path?: string): string {
  return `${label}::${path || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'source';
}

/** 동일 id source를 하나로 정규화한다. */
export function dedupeSources(sources: VisualizationSource[]): VisualizationSource[] {
  const seen = new Map<string, VisualizationSource>();
  for (const source of sources) {
    if (!seen.has(source.id)) {
      seen.set(source.id, source);
    }
  }
  return [...seen.values()];
}

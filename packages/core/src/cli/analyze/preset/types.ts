import { type ElementCBSData, type UnifiedVarEntry } from '@/domain';

export type { ElementCBSData, UnifiedVarEntry };

/** 프롬프트 소스 정보. */
export interface PromptSource {
  name: string;
  text: string;
  reads: Set<string>;
  writes: Set<string>;
}

/** Phase 1 (COLLECT) 결과 — preset 디렉토리에서 수집한 데이터. */
export interface PresetCollectResult {
  prompts: PromptSource[];
  promptTemplates: PromptSource[];
  regexCBS: ElementCBSData[];
  metadata: Record<string, unknown>;
  model: Record<string, unknown> | null;
  parameters: Record<string, unknown> | null;
}

/** Markdown/HTML 리포터 공용 입력 데이터. */
export interface PresetReportData {
  presetName: string;
  collected: PresetCollectResult;
  unifiedGraph: Map<string, UnifiedVarEntry>;
}

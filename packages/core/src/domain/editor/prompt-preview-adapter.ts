/**
 * .risuprompt 문서의 Main Editor preview를 생성하는 어댑터입니다.
 * @file packages/core/src/domain/editor/prompt-preview-adapter.ts
 */

import type { CbsSimulationContextInput, CbsSimulationDiagnostic, CbsSimulationTraceEvent } from '../../simulator';
import { simulateCbsText } from '../../simulator';
import type { PromptEditorState } from './document-model-types';
import { getPromptTypeRule, isPromptType, type PromptSectionName, type PromptType } from './prompt-rules';

export interface PromptMainEditorPreviewInput {
  activeSection?: PromptSectionName;
  variables?: CbsSimulationContextInput;
}

export interface PromptMainEditorPreviewResult {
  status: 'ok' | 'partial' | 'aborted' | 'error';
  title: string;
  output: string;
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; code?: string }>;
  trace: CbsSimulationTraceEvent[];
  metadata: {
    format: 'prompt';
    promptType: string;
    activeSection: string;
    sectionless: string;
  };
}

/**
 * createPromptMainEditorPreview 함수.
 * Prompt type/section rule을 검증하고 허용된 section을 CBS preview로 평가합니다.
 *
 * @param state - preview할 prompt type, frontmatter, section 원문을 담은 Main Editor structured state입니다.
 * @param input - 평가할 active section과 simulator 변수 context를 지정하기 위한 입력값입니다.
 * @returns prompt preview panel에 표시할 결과입니다.
 */
export function createPromptMainEditorPreview(
  state: PromptEditorState,
  input: PromptMainEditorPreviewInput = {},
): PromptMainEditorPreviewResult {
  if (!isPromptType(state.type)) {
    return createPromptErrorPreview(state.type ?? '', 'PROMPT_UNKNOWN_TYPE', 'Unsupported .risuprompt type.');
  }

  const type = state.type;
  const rule = getPromptTypeRule(type);
  const forbiddenSections = Object.keys(state.sections).filter((section) => !rule.allowedSections.includes(section as PromptSectionName));
  if (forbiddenSections.length > 0) {
    return createPromptErrorPreview(type, 'PROMPT_FORBIDDEN_SECTION', `Sections not allowed for ${type}: ${forbiddenSections.join(', ')}`);
  }

  const missingFields = rule.requiredFields.filter((field) => !state.frontmatter[field]);
  if (missingFields.length > 0) {
    return createPromptErrorPreview(type, 'PROMPT_MISSING_FIELD', `Missing required fields: ${missingFields.join(', ')}`);
  }

  if (rule.sectionless) {
    return createSectionlessPromptPreview(type);
  }

  const activeSection = chooseActivePromptSection(rule.allowedSections, input.activeSection);
  const source = state.sections[activeSection] ?? '';
  const simulation = simulateCbsText(source, input.variables);

  return {
    status: simulation.status,
    title: `.risuprompt ${type} Preview`,
    output: simulation.output,
    diagnostics: simulation.diagnostics.map(toPromptDiagnostic),
    trace: simulation.trace,
    metadata: {
      format: 'prompt',
      promptType: type,
      activeSection,
      sectionless: 'false',
    },
  };
}

/**
 * chooseActivePromptSection 함수.
 * 요청된 section이 허용 목록에 있으면 사용하고, 아니면 첫 허용 section으로 fallback합니다.
 *
 * @param allowedSections - prompt type rule이 preview를 허용한 section 후보 목록입니다.
 * @param requested - 사용자가 현재 편집 중이라 우선 preview하려는 section 이름입니다.
 * @returns 실제 CBS preview에 사용할 active section 이름입니다.
 */
function chooseActivePromptSection(allowedSections: readonly PromptSectionName[], requested?: PromptSectionName): PromptSectionName {
  if (requested && allowedSections.includes(requested)) return requested;
  return allowedSections[0] ?? 'TEXT';
}

/**
 * createSectionlessPromptPreview 함수.
 * CBS section이 없는 prompt type에 대해 편집 안내용 preview 결과를 만듭니다.
 *
 * @param type - sectionless 안내 문구를 선택하기 위한 prompt type입니다.
 * @returns sectionless prompt 안내를 담은 preview 결과입니다.
 */
function createSectionlessPromptPreview(type: PromptType): PromptMainEditorPreviewResult {
  const detail = type === 'chat'
    ? 'chat prompts are generated from chat history range_start/range_end and do not contain editable CBS sections.'
    : 'cache prompts describe context cache metadata and do not contain editable CBS sections.';
  return {
    status: 'ok',
    title: `.risuprompt ${type} Guidance`,
    output: `Sectionless ${type} prompt. ${detail}`,
    diagnostics: [],
    trace: [],
    metadata: {
      format: 'prompt',
      promptType: type,
      activeSection: '',
      sectionless: 'true',
    },
  };
}

/**
 * createPromptErrorPreview 함수.
 * prompt rule 검증 실패를 Main Editor preview error payload로 변환합니다.
 *
 * @param type - 오류 metadata에 남길 prompt type 원문입니다.
 * @param code - diagnostics에서 원인을 식별하기 위한 오류 코드입니다.
 * @param message - 사용자에게 preview output과 diagnostics로 보여줄 오류 메시지입니다.
 * @returns error 상태의 prompt preview 결과입니다.
 */
function createPromptErrorPreview(type: string, code: string, message: string): PromptMainEditorPreviewResult {
  return {
    status: 'error',
    title: '.risuprompt Preview',
    output: message,
    diagnostics: [{ severity: 'error', code, message }],
    trace: [],
    metadata: {
      format: 'prompt',
      promptType: type,
      activeSection: '',
      sectionless: 'false',
    },
  };
}

/**
 * toPromptDiagnostic 함수.
 * CBS simulator diagnostic을 prompt preview DTO가 쓰는 최소 형태로 축약합니다.
 *
 * @param diagnostic - prompt section 평가 중 simulator가 생성한 diagnostic입니다.
 * @returns prompt preview 결과에 포함할 diagnostic DTO입니다.
 */
function toPromptDiagnostic(diagnostic: CbsSimulationDiagnostic): { severity: 'error' | 'warning' | 'info'; message: string; code?: string } {
  return {
    severity: diagnostic.severity,
    message: diagnostic.message,
    code: diagnostic.code,
  };
}

import { analyzeVariableFlow } from './variable-flow';
import type { ElementCBSData } from './correlation';
import type { VarFlowResult } from './variable-flow-types';

/** composition conflict 종류 */
export type CompositionConflictType =
  | 'variable-name-collision'
  | 'variable-overwrite-race'
  | 'regex-order-conflict'
  | 'lorebook-keyword-collision'
  | 'cbs-function-deprecation'
  | 'namespace-missing';

/** composition conflict 항목 */
export interface CompositionConflict {
  type: CompositionConflictType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sources: Array<{ artifact: string; element: string }>;
  detail?: string;
}

/** 단일 artifact 입력 */
export interface ArtifactInput {
  name: string;
  type: 'charx' | 'module' | 'preset';
  elements: ElementCBSData[];
  defaultVariables: Record<string, string>;
  lorebookKeywords?: Record<string, string[]>;
  regexPatterns?: Array<{ name: string; in: string; order?: number }>;
  namespace?: string;
}

/** composition analyzer 입력 */
export interface CompositionInput {
  charx?: ArtifactInput;
  modules: ArtifactInput[];
  preset?: ArtifactInput;
}

/** composition analyzer 결과 */
export interface CompositionResult {
  artifacts: Array<{ type: string; name: string }>;
  conflicts: CompositionConflict[];
  mergedVariableFlow: VarFlowResult;
  summary: {
    totalConflicts: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    compatibilityScore: number;
  };
}

/** analyzeComposition detects multi-artifact compatibility risks */
export function analyzeComposition(input: CompositionInput): CompositionResult {
  const allArtifacts = [
    ...(input.charx ? [input.charx] : []),
    ...input.modules,
    ...(input.preset ? [input.preset] : []),
  ];

  const conflicts: CompositionConflict[] = [];
  detectVariableCollisions(allArtifacts, conflicts);
  detectKeywordCollisions(allArtifacts, conflicts);
  detectRegexConflicts(allArtifacts, conflicts);

  for (const moduleArtifact of input.modules) {
    if (!moduleArtifact.namespace && moduleArtifact.elements.some((element) => element.writes.size > 0)) {
      conflicts.push({
        type: 'namespace-missing',
        severity: 'warning',
        message: `Module "${moduleArtifact.name}" writes global variables without a namespace prefix. This may conflict with other modules.`,
        sources: [{ artifact: moduleArtifact.name, element: 'module' }],
      });
    }
  }

  const allElements = allArtifacts.flatMap((artifact) => artifact.elements);
  const mergedDefaults = Object.assign({}, ...allArtifacts.map((artifact) => artifact.defaultVariables));
  const mergedVariableFlow = analyzeVariableFlow(allElements, mergedDefaults);
  detectOverwriteRaces(mergedVariableFlow, allArtifacts, conflicts);

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const conflict of conflicts) {
    byType[conflict.type] = (byType[conflict.type] ?? 0) + 1;
    bySeverity[conflict.severity] = (bySeverity[conflict.severity] ?? 0) + 1;
  }

  const compatibilityScore = Math.max(
    0,
    100 - (bySeverity.error ?? 0) * 20 - (bySeverity.warning ?? 0) * 5 - (bySeverity.info ?? 0),
  );

  return {
    artifacts: allArtifacts.map((artifact) => ({ type: artifact.type, name: artifact.name })),
    conflicts,
    mergedVariableFlow,
    summary: {
      totalConflicts: conflicts.length,
      byType,
      bySeverity,
      compatibilityScore,
    },
  };
}

function detectVariableCollisions(
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const varWriters = new Map<string, Array<{ artifact: string; defaultValue: string | undefined; elements: string[] }>>();

  for (const artifact of artifacts) {
    for (const element of artifact.elements) {
      for (const varName of element.writes) {
        const existing = varWriters.get(varName) ?? [];
        const current = existing.find((entry) => entry.artifact === artifact.name);
        if (current) {
          if (!current.elements.includes(element.elementName)) {
            current.elements.push(element.elementName);
          }
        } else {
          existing.push({
            artifact: artifact.name,
            defaultValue: artifact.defaultVariables[varName],
            elements: [element.elementName],
          });
        }
        varWriters.set(varName, existing);
      }
    }
  }

  for (const [varName, writers] of varWriters.entries()) {
    if (writers.length < 2) continue;
    const defaults = [...new Set(writers.map((writer) => writer.defaultValue).filter((value): value is string => value !== undefined))];
    if (defaults.length >= 2) {
      conflicts.push({
        type: 'variable-name-collision',
        severity: 'warning',
        message: `Variable "${varName}" is written by ${writers.length} artifacts with different default values: ${defaults.join(', ')}.`,
        sources: writers.flatMap((writer) => writer.elements.map((element) => ({ artifact: writer.artifact, element }))),
      });
    }
  }
}

function detectKeywordCollisions(
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const keywordMap = new Map<string, Array<{ artifact: string; entries: string[] }>>();

  for (const artifact of artifacts) {
    if (!artifact.lorebookKeywords) continue;
    for (const [keyword, entries] of Object.entries(artifact.lorebookKeywords)) {
      const existing = keywordMap.get(keyword) ?? [];
      existing.push({ artifact: artifact.name, entries });
      keywordMap.set(keyword, existing);
    }
  }

  for (const [keyword, sources] of keywordMap.entries()) {
    if (sources.length < 2) continue;
    conflicts.push({
      type: 'lorebook-keyword-collision',
      severity: 'info',
      message: `Lorebook keyword "${keyword}" exists in multiple artifacts: ${sources.map((source) => source.artifact).join(', ')}.`,
      sources: sources.flatMap((source) => source.entries.map((entry) => ({ artifact: source.artifact, element: entry }))),
    });
  }
}

function detectRegexConflicts(
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const patternMap = new Map<string, Array<{ artifact: string; name: string; order?: number }>>();

  for (const artifact of artifacts) {
    if (!artifact.regexPatterns) continue;
    for (const regexPattern of artifact.regexPatterns) {
      const existing = patternMap.get(regexPattern.in) ?? [];
      existing.push({ artifact: artifact.name, name: regexPattern.name, order: regexPattern.order });
      patternMap.set(regexPattern.in, existing);
    }
  }

  for (const [pattern, sources] of patternMap.entries()) {
    if (sources.length < 2) continue;
    conflicts.push({
      type: 'regex-order-conflict',
      severity: 'warning',
      message: `Regex pattern "${pattern}" exists in multiple artifacts: ${sources.map((source) => `${source.artifact}/${source.name}`).join(', ')}.`,
      sources: sources.map((source) => ({ artifact: source.artifact, element: source.name })),
    });
  }
}

function detectOverwriteRaces(
  mergedVariableFlow: VarFlowResult,
  artifacts: ArtifactInput[],
  conflicts: CompositionConflict[],
): void {
  const artifactByElement = new Map<string, string>();
  for (const artifact of artifacts) {
    for (const element of artifact.elements) {
      artifactByElement.set(element.elementName, artifact.name);
    }
  }

  for (const variable of mergedVariableFlow.variables) {
    const overwriteIssue = variable.issues.find((issue) => issue.type === 'overwrite-conflict');
    if (!overwriteIssue) continue;

    const sources = overwriteIssue.events
      .map((event) => ({ artifact: artifactByElement.get(event.elementName) ?? event.elementType, element: event.elementName }))
      .filter((value, index, array) => array.findIndex((item) => item.artifact === value.artifact && item.element === value.element) === index);

    const uniqueArtifacts = new Set(sources.map((source) => source.artifact));
    if (uniqueArtifacts.size < 2) continue;

    conflicts.push({
      type: 'variable-overwrite-race',
      severity: 'error',
      message: `Variable "${variable.varName}" is overwritten by multiple artifacts in the merged runtime flow.`,
      sources,
    });
  }
}

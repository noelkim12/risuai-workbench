/**
 * Pure deterministic helpers for creative ideation generation tools.
 * @file packages/risuai-workbench-mcp/src/creative/ideation-tools.ts
 */

import {
  createIdea,
  createIdeationEnvelope,
  type Idea,
  type IdeationEnvelope,
  type IdeationMethodRef,
} from '../contracts/creative';
import type { WorkbenchDiagnostic } from '../contracts/diagnostics';

export type IdeationToolName =
  | 'workbench.creative.brainstorm_scamper'
  | 'workbench.creative.create_matrix'
  | 'workbench.creative.generate_combinations'
  | 'workbench.creative.extract_contradictions'
  | 'workbench.creative.suggest_contradiction_resolutions';

export interface IdeationIdea extends Idea {
  method: IdeationMethodRef;
  confidence: 'low' | 'medium';
  sourceContext: readonly string[];
}

export interface MatrixValue {
  id: string;
  label: string;
  evidence: readonly string[];
  assumptions: readonly string[];
}

export interface MatrixDimension {
  id: string;
  label: string;
  values: readonly MatrixValue[];
}

export interface CreativeMatrix {
  id: string;
  method: IdeationMethodRef;
  dimensions: readonly MatrixDimension[];
}

export interface IdeationToolResult extends IdeationEnvelope {
  ideas: readonly IdeationIdea[];
  diagnostics: readonly WorkbenchDiagnostic[];
  nextActions: readonly string[];
  readOnly: true;
  sourceWrites: readonly [];
  sessionWrites: readonly [];
  mutationCalls: readonly [];
  matrix?: CreativeMatrix;
}

interface ContextCardLike {
  id: string;
  kind: string;
  title: string;
  whyUseful: string;
  evidence: readonly string[];
  assumptions: readonly string[];
  resourceLinks: readonly string[];
}

interface NormalizedContext {
  artifactKey: string;
  cards: readonly ContextCardLike[];
  diagnostics: readonly WorkbenchDiagnostic[];
  hasRichContext: boolean;
  resourceLinks: readonly string[];
  targetArtifacts: readonly string[];
  theme?: string;
}

interface IdeaDraft {
  assumptions: readonly string[];
  candidateMutations: readonly string[];
  contextCards: readonly ContextCardLike[];
  confidence: 'low' | 'medium';
  evidence?: readonly string[];
  nextActions: readonly string[];
  seed: string;
  summary: string;
  title: string;
}

const MAX_CONTEXT_CARDS = 6;
const MAX_EVIDENCE = 5;
const MAX_ASSUMPTIONS = 5;
const MAX_NEXT_ACTIONS = 6;
const MAX_TEXT = 180;

const METHOD_BY_TOOL: Record<IdeationToolName, IdeationMethodRef> = {
  'workbench.creative.brainstorm_scamper': {
    id: 'scamper',
    resourceUri: 'risuai-workbench://methods/scamper',
  },
  'workbench.creative.create_matrix': {
    id: 'morphological-analysis',
    resourceUri: 'risuai-workbench://methods/morphological-analysis',
  },
  'workbench.creative.generate_combinations': {
    id: 'morphological-analysis',
    resourceUri: 'risuai-workbench://methods/morphological-analysis',
  },
  'workbench.creative.extract_contradictions': {
    id: 'triz',
    resourceUri: 'risuai-workbench://methods/triz',
  },
  'workbench.creative.suggest_contradiction_resolutions': {
    id: 'triz',
    resourceUri: 'risuai-workbench://methods/triz',
  },
};

const BASE_NEXT_ACTIONS = [
  'workbench.creative.rank_ideas',
  'workbench.creative.critique_six_hats',
  'workbench.creative.preview_creative_impact',
] as const;

const CONTEXT_NEXT_ACTIONS = [
  'workbench.creative.gather_context',
  'workbench.creative.search_context',
  'workbench.refresh_analyze_snapshot',
] as const;

const SCAMPER_LENSES = [
  ['substitute', 'Substitute', 'Swap one trigger, state variable, or prompt surface for a safer equivalent.'],
  ['combine', 'Combine', 'Join two supplied context signals into one coherent candidate.'],
  ['adapt', 'Adapt', 'Reuse a working pattern from the supplied context in a new artifact position.'],
  ['modify', 'Modify', 'Change intensity, timing, ordering, or token footprint while preserving source safety.'],
  ['put-to-another-use', 'Put to another use', 'Repurpose an existing variable, lorebook cue, or graph link as creative scaffolding.'],
  ['eliminate', 'Eliminate', 'Remove a risky dependency or redundant surface before patch planning.'],
  ['reverse-rearrange', 'Reverse/Rearrange', 'Invert order, dependency direction, or trigger priority for a new option.'],
] as const;

/**
 * buildBrainstormScamperResult 함수.
 * Supplied context에서 SCAMPER 후보를 deterministic ideation envelope로 만든다.
 */
export function buildBrainstormScamperResult(input: unknown): IdeationToolResult {
  const toolName = 'workbench.creative.brainstorm_scamper' as const;
  const context = normalizeContext(input, toolName);
  const ideas = context.hasRichContext
    ? SCAMPER_LENSES.map(([key, label, intent], index) => buildIdea(input, toolName, context, {
      assumptions: [`${label} lens is a deterministic structural variation; inspect source context before patch planning.`],
      candidateMutations: candidateMutationsForLens(key),
      confidence: 'medium',
      contextCards: selectContextCards(context.cards, index),
      nextActions: [...BASE_NEXT_ACTIONS, 'workbench.creative.turn_idea_into_patch_plan'],
      seed: `scamper:${key}:${index}`,
      summary: `${intent} Focus: ${contextFocus(context, index)}.`,
      title: `${label}: ${contextFocus(context, index)}`,
    }))
    : [buildLowContextIdea(input, toolName, context, 'Gather analyze/wiki/graph context before SCAMPER brainstorming.')];

  return buildIdeationResult(input, toolName, context, ideas);
}

/**
 * buildCreateMatrixResult 함수.
 * Morphological dimensions/options를 deterministic matrix와 ideation candidates로 구조화한다.
 */
export function buildCreateMatrixResult(input: unknown): IdeationToolResult {
  const toolName = 'workbench.creative.create_matrix' as const;
  const context = normalizeContext(input, toolName);
  const matrix = buildMatrix(input, toolName, context);
  const ideas = matrix.dimensions.map((dimension, index) => buildIdea(input, toolName, context, {
    assumptions: [`Matrix dimension "${dimension.label}" is derived from caller input or compact context; validate values before ranking.`],
    candidateMutations: ['validation_only', 'edit_frontmatter', 'edit_order'],
    confidence: context.hasRichContext || dimension.values.some((value) => value.evidence.length > 0) ? 'medium' : 'low',
    contextCards: selectContextCards(context.cards, index),
    evidence: dimension.values.flatMap((value) => value.evidence),
    nextActions: ['workbench.creative.generate_combinations', 'workbench.creative.rank_ideas', 'workbench.creative.critique_six_hats'],
    seed: `matrix:${dimension.id}:${index}`,
    summary: `Explore ${dimension.values.map((value) => value.label).join(' / ')} as bounded values for ${dimension.label}.`,
    title: `Matrix dimension: ${dimension.label}`,
  }));

  return buildIdeationResult(input, toolName, context, ideas.length > 0 ? ideas : [buildLowContextIdea(input, toolName, context, 'Define at least one matrix dimension or gather context.')], matrix);
}

/**
 * buildGenerateCombinationsResult 함수.
 * Matrix dimensions에서 bounded deterministic combinations를 만든다.
 */
export function buildGenerateCombinationsResult(input: unknown): IdeationToolResult {
  const toolName = 'workbench.creative.generate_combinations' as const;
  const context = normalizeContext(input, toolName);
  const matrix = buildMatrix(input, toolName, context);
  const combinations = buildCombinations(matrix.dimensions);
  const ideas = combinations.map((combination, index) => buildIdea(input, toolName, context, {
    assumptions: [
      'Combination was generated deterministically from bounded matrix values, not from persisted session state.',
      ...combination.flatMap((value) => value.assumptions).slice(0, 2),
    ],
    candidateMutations: ['create_artifact', 'edit_frontmatter', 'edit_order'],
    confidence: combination.some((value) => value.evidence.length > 0) ? 'medium' : 'low',
    contextCards: selectContextCards(context.cards, index),
    evidence: combination.flatMap((value) => value.evidence),
    nextActions: ['workbench.creative.rank_ideas', 'workbench.creative.critique_idea_with_analyze', 'workbench.creative.preview_creative_impact'],
    seed: `combination:${combination.map((value) => value.id).join('+')}:${index}`,
    summary: `Candidate combines ${combination.map((value) => value.label).join(' + ')} while deferring all writes to later preview tools.`,
    title: `Combination: ${combination.map((value) => value.label).join(' + ')}`,
  }));

  return buildIdeationResult(input, toolName, context, ideas.length > 0 ? ideas : [buildLowContextIdea(input, toolName, context, 'Create a matrix before generating combinations.')], matrix);
}

/**
 * buildExtractContradictionsResult 함수.
 * Supplied context에서 TRIZ-style contradiction candidates를 뽑는다.
 */
export function buildExtractContradictionsResult(input: unknown): IdeationToolResult {
  const toolName = 'workbench.creative.extract_contradictions' as const;
  const context = normalizeContext(input, toolName);
  const contradictions = explicitContradictions(input);
  const seeds = contradictions.length > 0 ? contradictions : defaultContradictions(context);
  const ideas = seeds.map((contradiction, index) => buildIdea(input, toolName, context, {
    assumptions: ['Contradiction is a planning frame only; inspect evidence before turning it into a resolution or patch preview.'],
    candidateMutations: ['validation_only', 'edit_order', 'edit_frontmatter'],
    confidence: context.hasRichContext || contradictions.length > 0 ? 'medium' : 'low',
    contextCards: selectContextCards(context.cards, index),
    nextActions: ['workbench.creative.suggest_contradiction_resolutions', 'workbench.creative.critique_six_hats', 'workbench.creative.rank_ideas'],
    seed: `contradiction:${contradiction}:${index}`,
    summary: `Trade-off to resolve without mutation: ${contradiction}.`,
    title: `Contradiction: ${contradiction}`,
  }));

  return buildIdeationResult(input, toolName, context, ideas);
}

/**
 * buildSuggestContradictionResolutionsResult 함수.
 * Contradiction input을 separation/substitution/staged-preview resolution ideas로 변환한다.
 */
export function buildSuggestContradictionResolutionsResult(input: unknown): IdeationToolResult {
  const toolName = 'workbench.creative.suggest_contradiction_resolutions' as const;
  const context = normalizeContext(input, toolName);
  const contradiction = firstString(recordOf(input)?.contradiction, recordOf(input)?.contradictionId, explicitContradictions(input)[0]) ?? 'creative impact vs source-safety constraints';
  const resolutionPatterns = [
    ['separate-context', 'Separate by context', 'Keep the creative cue conditional so the high-impact behavior appears only in the relevant context.'],
    ['substitute-surface', 'Substitute surface', 'Move the idea to a lower-risk artifact surface before previewing source edits.'],
    ['stage-preview', 'Stage preview', 'Prototype the smallest validation-only slice before any source artifact write.'],
  ] as const;
  const ideas = resolutionPatterns.map(([key, title, summary], index) => buildIdea(input, toolName, context, {
    assumptions: [`Resolution addresses "${contradiction}" as a planning option only.`],
    candidateMutations: candidateMutationsForResolution(key),
    confidence: context.hasRichContext ? 'medium' : 'low',
    contextCards: selectContextCards(context.cards, index),
    nextActions: ['workbench.creative.rank_ideas', 'workbench.creative.critique_idea_with_analyze', 'workbench.creative.preview_creative_impact'],
    seed: `resolution:${key}:${contradiction}:${index}`,
    summary: `${summary} Target contradiction: ${contradiction}.`,
    title: `${title}: ${contradiction}`,
  }));

  return buildIdeationResult(input, toolName, context, ideas);
}

function buildIdeationResult(
  input: unknown,
  toolName: IdeationToolName,
  context: NormalizedContext,
  ideas: readonly IdeationIdea[],
  matrix?: CreativeMatrix,
): IdeationToolResult {
  const method = METHOD_BY_TOOL[toolName];
  const sessionId = sessionIdFor(input, toolName, method, context);
  const scopedIdeas = ideas.map((idea, index) => ({
    ...idea,
    id: ideaIdFor(sessionId, toolName, idea.id || `${idea.title}:${index}`),
  }));
  const status = context.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'domain_error'
    : context.diagnostics.length > 0 || scopedIdeas.some((idea) => idea.confidence === 'low')
      ? 'domain_warning'
      : 'ok';
  const envelope = createIdeationEnvelope({
    ideas: scopedIdeas,
    method,
    session: {
      mode: 'mutation-capable',
      persistentMemoryWritten: false,
      sessionId,
      sourceArtifactWritten: false,
    },
    status,
    tool: toolName,
  });
  return {
    ...envelope,
    diagnostics: context.diagnostics,
    ideas: scopedIdeas,
    matrix,
    mutationCalls: [],
    nextActions: topLevelNextActions(scopedIdeas, context),
    readOnly: true,
    sessionWrites: [],
    sourceWrites: [],
  };
}

function buildIdea(input: unknown, toolName: IdeationToolName, context: NormalizedContext, draft: IdeaDraft): IdeationIdea {
  const method = METHOD_BY_TOOL[toolName];
  const evidence = compactStringList([
    ...draft.contextCards.flatMap((card) => card.evidence),
    ...draft.contextCards.flatMap((card) => card.resourceLinks),
    ...toStringArray(draft.evidence),
    ...context.resourceLinks.slice(0, 2),
  ], MAX_EVIDENCE);
  const assumptions = compactStringList([
    ...draft.assumptions,
    ...draft.contextCards.flatMap((card) => card.assumptions),
    'Server generated a bounded structured candidate only; prose expansion belongs in client prompts.',
  ], MAX_ASSUMPTIONS);
  const baseIdea = createIdea({
    assumptions,
    candidateMutations: compactStringList(draft.candidateMutations, MAX_EVIDENCE),
    evidence,
    id: stableSlug(`${draft.seed}:${stableStringify(input)}`),
    nextActions: compactStringList(draft.nextActions, MAX_NEXT_ACTIONS),
    summary: compactText(draft.summary),
    title: compactText(draft.title),
  });
  return {
    ...baseIdea,
    confidence: draft.confidence,
    method,
    sourceContext: draft.contextCards.map((card) => card.id),
  };
}

function buildLowContextIdea(input: unknown, toolName: IdeationToolName, context: NormalizedContext, summary: string): IdeationIdea {
  return buildIdea(input, toolName, context, {
    assumptions: ['No rich analyze/wiki/graph context was supplied; this is a low-confidence planning scaffold.'],
    candidateMutations: [],
    confidence: 'low',
    contextCards: [],
    nextActions: [...CONTEXT_NEXT_ACTIONS, 'workbench.creative.gather_context'],
    seed: `low-context:${toolName}`,
    summary,
    title: 'Gather more context before selecting ideas',
  });
}

function normalizeContext(input: unknown, toolName: IdeationToolName): NormalizedContext {
  const record = recordOf(input) ?? {};
  const nestedContext = recordOf(record.context);
  const artifactKey = firstString(record.artifactKey, nestedContext?.artifactKey, firstArrayString(record.targetArtifacts)) ?? 'workspace';
  const targetArtifacts = compactStringList([
    ...toStringArray(record.targetArtifacts),
    ...toStringArray(nestedContext?.targetArtifacts),
  ], MAX_CONTEXT_CARDS);
  const explicitCards = normalizeCards([
    ...toArray(record.contextCards),
    ...toArray(record.cards),
    ...toArray(nestedContext?.contextCards),
  ]);
  const cards = compactCards([
    ...explicitCards,
    ...artifactCards(targetArtifacts, artifactKey),
    ...analyzeCards(record, artifactKey),
  ]);
  const hasEvidenceSource = cards.some((card) => card.kind !== 'artifact' && (card.evidence.length > 0 || card.resourceLinks.length > 0));
  const resourceLinks = compactStringList([
    ...toStringArray(record.resourceLinks),
    ...toStringArray(nestedContext?.resourceLinks),
    ...cards.flatMap((card) => card.resourceLinks),
    `risuai-workbench://rubrics/idea-quality`,
    `risuai-workbench://rubrics/artifact-fit`,
  ], 12);
  const diagnostics = contextDiagnostics(toolName, artifactKey, cards, record, hasEvidenceSource);
  return {
    artifactKey,
    cards,
    diagnostics,
    hasRichContext: hasEvidenceSource || resourceLinks.some((link) => !link.includes('/rubrics/') && !link.endsWith('/artifact')),
    resourceLinks,
    targetArtifacts,
    theme: firstString(record.theme, nestedContext?.theme, record.query),
  };
}

function normalizeCards(values: readonly unknown[]): ContextCardLike[] {
  const cards: Array<ContextCardLike | undefined> = values.map((value, index) => {
    const record = recordOf(value);
    if (!record) return undefined;
    const title = firstString(record.title, record.id, `Context ${index + 1}`);
    if (!title) return undefined;
    return {
      assumptions: compactStringList(toStringArray(record.assumptions), MAX_ASSUMPTIONS),
      evidence: compactStringList(toStringArray(record.evidence), MAX_EVIDENCE),
      id: stableSlug(firstString(record.id, title) ?? `context-${index + 1}`),
      kind: stableSlug(firstString(record.kind, 'context') ?? 'context'),
      resourceLinks: compactStringList(toStringArray(record.resourceLinks), MAX_EVIDENCE),
      title: compactText(title),
      whyUseful: compactText(firstString(record.whyUseful, record.summary, 'Caller supplied context card.') ?? 'Caller supplied context card.'),
    };
  });
  return cards.filter((card): card is ContextCardLike => Boolean(card));
}

function artifactCards(targetArtifacts: readonly string[], artifactKey: string): ContextCardLike[] {
  return targetArtifacts.slice(0, 3).map((artifact) => ({
    assumptions: ['Caller supplied artifact scope; ideation helper did not read the source file.'],
    evidence: [`input:artifact:${artifact}`],
    id: `artifact:${stableSlug(artifact)}`,
    kind: 'artifact',
    resourceLinks: [`risuai-workbench://analyze/${encodePathSegment(artifactKey)}/artifact`],
    title: artifact,
    whyUseful: 'Constrains generated candidates to a caller-supplied artifact path.',
  }));
}

function analyzeCards(record: Record<string, unknown>, artifactKey: string): ContextCardLike[] {
  const analyze = recordOf(record.analyze) ?? recordOf(record.analysis);
  if (!analyze) return [];
  const variables = toArray(firstDefined(analyze.variables, recordOf(analyze.variableFlow)?.variables));
  return variables.slice(0, 3).map((variable, index) => {
    const variableRecord = recordOf(variable);
    const name = firstString(variableRecord?.varName, variableRecord?.name, variableRecord?.id, `variable-${index + 1}`) ?? `variable-${index + 1}`;
    return {
      assumptions: ['Variable-flow payload is caller supplied; query_variable should verify it before patch planning.'],
      evidence: compactStringList([...toStringArray(variableRecord?.evidence), `risuai-workbench://analyze/${encodePathSegment(artifactKey)}/variables/${encodePathSegment(name)}`], MAX_EVIDENCE),
      id: `var:${stableSlug(name)}`,
      kind: 'variable',
      resourceLinks: [`risuai-workbench://analyze/${encodePathSegment(artifactKey)}/variables/${encodePathSegment(name)}`],
      title: name,
      whyUseful: 'Variable context can anchor candidate triggers, state changes, or validation checks.',
    };
  });
}

function contextDiagnostics(toolName: IdeationToolName, artifactKey: string, cards: readonly ContextCardLike[], record: Record<string, unknown>, hasEvidenceSource: boolean): WorkbenchDiagnostic[] {
  const diagnostics: WorkbenchDiagnostic[] = [];
  if (cards.length === 0 || !hasEvidenceSource) {
    diagnostics.push({
      category: 'creative-ideation',
      id: 'CREATIVE_IDEATION_CONTEXT_SPARSE',
      message: `${toolName} received sparse analyze/wiki/graph context for ${artifactKey}; returning low-confidence ideas and next actions instead of throwing.`,
      path: null,
      ruleId: 'creative.ideation.context-sparse',
      severity: 'warning',
    });
  }
  for (const source of ['analyze', 'analysis', 'wiki', 'graph', 'relationshipNetwork'] as const) {
    const sourceRecord = recordOf(record[source]);
    const status = firstString(sourceRecord?.status)?.toLowerCase();
    if (status === 'not_found' || status === 'unavailable' || status === 'domain_error' || status === 'missing') {
      diagnostics.push({
        category: 'creative-ideation',
        id: 'CREATIVE_IDEATION_CONTEXT_SOURCE_UNAVAILABLE',
        message: `${source} context is unavailable; ideation remains structured and read-only.`,
        path: null,
        ruleId: `creative.ideation.${source}.unavailable`,
        severity: 'warning',
      });
    }
  }
  return dedupeDiagnostics(diagnostics);
}

function buildMatrix(input: unknown, toolName: IdeationToolName, context: NormalizedContext): CreativeMatrix {
  const method = METHOD_BY_TOOL[toolName];
  const explicit = explicitDimensions(input);
  const dimensions = explicit.length > 0 ? explicit : defaultDimensions(context);
  const sessionId = sessionIdFor(input, toolName, method, context);
  return {
    dimensions,
    id: `matrix:${shortHash(`${sessionId}:${stableStringify(dimensions)}`)}`,
    method,
  };
}

function explicitDimensions(input: unknown): MatrixDimension[] {
  const record = recordOf(input) ?? {};
  const matrix = recordOf(record.matrix);
  const values = toArray(firstDefined(record.dimensions, matrix?.dimensions));
  return values.map((value, index) => {
    if (typeof value === 'string') return dimensionFromLabel(value, index, []);
    const dimension = recordOf(value);
    const label = firstString(dimension?.label, dimension?.name, dimension?.id, `Dimension ${index + 1}`) ?? `Dimension ${index + 1}`;
    const dimensionValues = toArray(firstDefined(dimension?.values, dimension?.options)).map((option, optionIndex) => matrixValueFromUnknown(option, `${stableSlug(label)}-${optionIndex + 1}`));
    return {
      id: stableSlug(firstString(dimension?.id, label) ?? label),
      label: compactText(label),
      values: dimensionValues.length > 0 ? dimensionValues : defaultValuesForLabel(label, []),
    };
  });
}

function defaultDimensions(context: NormalizedContext): MatrixDimension[] {
  const focusValues = context.cards.length > 0
    ? context.cards.slice(0, 3).map((card) => matrixValueFromCard(card))
    : [matrixValueFromText('gathered-context-needed', 'Gathered context needed', [], ['No context cards supplied.'])];
  const artifactValues = context.targetArtifacts.length > 0
    ? context.targetArtifacts.slice(0, 3).map((artifact) => matrixValueFromText(stableSlug(artifact), artifact, [`input:artifact:${artifact}`], ['Caller supplied artifact scope.']))
    : [matrixValueFromText('workspace-scope', context.artifactKey, [], ['Workspace-level scope is a fallback.'])];
  return [
    { id: 'focus-signal', label: 'Focus signal', values: focusValues },
    { id: 'artifact-surface', label: 'Artifact surface', values: artifactValues },
    { id: 'validation-path', label: 'Validation path', values: [
      matrixValueFromText('rank-then-critique', 'rank then critique', [], ['Ranking and critique are later tools, not applied here.']),
      matrixValueFromText('preview-impact', 'preview impact', [], ['Impact preview remains read-only.']),
    ] },
  ];
}

function dimensionFromLabel(label: string, index: number, evidence: readonly string[]): MatrixDimension {
  return {
    id: stableSlug(label) || `dimension-${index + 1}`,
    label: compactText(label),
    values: defaultValuesForLabel(label, evidence),
  };
}

function defaultValuesForLabel(label: string, evidence: readonly string[]): MatrixValue[] {
  return [
    matrixValueFromText(`${stableSlug(label)}-baseline`, `${label} baseline`, evidence, ['Caller did not provide explicit values.']),
    matrixValueFromText(`${stableSlug(label)}-variant`, `${label} variant`, evidence, ['Variant value should be validated against context.']),
  ];
}

function matrixValueFromUnknown(value: unknown, fallbackId: string): MatrixValue {
  if (typeof value === 'string') return matrixValueFromText(stableSlug(value), value, [], []);
  const record = recordOf(value);
  const label = firstString(record?.label, record?.name, record?.id, fallbackId) ?? fallbackId;
  return matrixValueFromText(firstString(record?.id, stableSlug(label)) ?? fallbackId, label, toStringArray(record?.evidence), toStringArray(record?.assumptions));
}

function matrixValueFromCard(card: ContextCardLike): MatrixValue {
  return matrixValueFromText(card.id, card.title, [...card.evidence, ...card.resourceLinks], card.assumptions);
}

function matrixValueFromText(id: string, label: string, evidence: readonly string[], assumptions: readonly string[]): MatrixValue {
  return {
    assumptions: compactStringList(assumptions, MAX_ASSUMPTIONS),
    evidence: compactStringList(evidence, MAX_EVIDENCE),
    id: stableSlug(id),
    label: compactText(label),
  };
}

function buildCombinations(dimensions: readonly MatrixDimension[]): MatrixValue[][] {
  const usable = dimensions.filter((dimension) => dimension.values.length > 0).slice(0, 3);
  if (usable.length === 0) return [];
  const combinations: MatrixValue[][] = [[]];
  for (const dimension of usable) {
    const next: MatrixValue[][] = [];
    for (const existing of combinations) {
      for (const value of dimension.values.slice(0, 2)) {
        next.push([...existing, value]);
      }
    }
    combinations.splice(0, combinations.length, ...next.slice(0, 4));
  }
  return combinations.slice(0, 4);
}

function explicitContradictions(input: unknown): string[] {
  const record = recordOf(input) ?? {};
  return compactStringList([
    ...toStringArray(record.contradictions),
    ...toArray(record.contradictions).map((entry) => {
      const contradiction = recordOf(entry);
      return firstString(contradiction?.title, contradiction?.summary, contradiction?.id);
    }).filter((entry): entry is string => Boolean(entry)),
    firstString(record.contradiction),
  ].filter((entry): entry is string => Boolean(entry)), 5);
}

function defaultContradictions(context: NormalizedContext): string[] {
  const focus = contextFocus(context, 0);
  if (!context.hasRichContext) return ['need creative options vs missing analyze/wiki/graph evidence'];
  return [
    `${focus} impact vs token budget safety`,
    `${focus} novelty vs source artifact stability`,
    `${focus} prompt ordering clarity vs interaction complexity`,
  ];
}

function candidateMutationsForLens(lens: string): string[] {
  if (lens === 'combine' || lens === 'put-to-another-use') return ['create_artifact', 'edit_frontmatter', 'edit_order'];
  if (lens === 'eliminate') return ['edit_order', 'edit_frontmatter', 'validation_only'];
  if (lens === 'reverse-rearrange') return ['edit_order', 'edit_metadata', 'validation_only'];
  return ['edit_frontmatter', 'edit_metadata', 'validation_only'];
}

function candidateMutationsForResolution(pattern: string): string[] {
  if (pattern === 'separate-context') return ['edit_frontmatter', 'validation_only'];
  if (pattern === 'substitute-surface') return ['create_artifact', 'edit_order'];
  return ['validation_only', 'edit_frontmatter'];
}

function topLevelNextActions(ideas: readonly IdeationIdea[], context: NormalizedContext): string[] {
  return compactStringList([
    ...ideas.flatMap((idea) => toStringArray(idea.nextActions)),
    ...(context.hasRichContext ? ['workbench.creative.rank_ideas'] : CONTEXT_NEXT_ACTIONS),
  ], MAX_NEXT_ACTIONS);
}

function selectContextCards(cards: readonly ContextCardLike[], offset: number): ContextCardLike[] {
  if (cards.length === 0) return [];
  const first = cards[offset % cards.length];
  const second = cards[(offset + 1) % cards.length];
  return first.id === second.id ? [first] : [first, second];
}

function contextFocus(context: NormalizedContext, index: number): string {
  const card = context.cards[index % Math.max(context.cards.length, 1)];
  return card?.title ?? context.theme ?? context.targetArtifacts[0] ?? context.artifactKey;
}

function sessionIdFor(input: unknown, toolName: IdeationToolName, method: IdeationMethodRef, context: NormalizedContext): string {
  const record = recordOf(input);
  const supplied = firstString(record?.sessionId, recordOf(record?.session)?.sessionId);
  if (supplied) return stableSlug(supplied);
  const seed = stableStringify({
    artifactKey: context.artifactKey,
    cards: context.cards.map((card) => [card.id, card.title, card.evidence]),
    method: method.id,
    targetArtifacts: context.targetArtifacts,
    theme: context.theme,
    toolName,
  });
  return `creative-session:${shortHash(seed)}`;
}

function ideaIdFor(sessionId: string, toolName: IdeationToolName, seed: string): string {
  return `idea:${shortHash(`${sessionId}:${toolName}:${seed}`)}`;
}

function compactCards(cards: readonly ContextCardLike[]): ContextCardLike[] {
  const seen = new Set<string>();
  const result: ContextCardLike[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    result.push(card);
  }
  return result.slice(0, MAX_CONTEXT_CARDS);
}

function dedupeDiagnostics(diagnostics: readonly WorkbenchDiagnostic[]): WorkbenchDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.id}:${diagnostic.ruleId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

function stableSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%3A/g, ':');
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT - 1)}…` : normalized;
}

function compactStringList(values: readonly string[], max: number): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0).map(compactText))].slice(0, max);
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function firstArrayString(value: unknown): string | undefined {
  return toStringArray(value)[0];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

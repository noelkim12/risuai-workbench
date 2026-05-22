/**
 * Pure helpers for read-only creative ideation context tools.
 * @file packages/risuai-workbench-mcp/src/creative/context-tools.ts
 */

import {
  createCreativeContextEnvelope,
  type ContextCard,
  type CreativeContextEnvelope,
  type CreativeContextEnvelopeStatus,
} from '../contracts/creative';
import {
  createDiagnosticEnvelope,
  type DiagnosticEnvelope,
  type DiagnosticEnvelopeStatus,
  type WorkbenchDiagnostic,
} from '../contracts/diagnostics';

export type CreativeContextToolMode = 'gather' | 'inspect' | 'search';

export interface CreativeContextCard extends ContextCard {
  assumptions: readonly string[];
  resourceLinks: readonly string[];
}

export interface CreativeContextToolData {
  context: CreativeContextEnvelope & { contextCards: readonly CreativeContextCard[] };
  compact: {
    embeddedPayloadPolicy: 'cards-only-links-for-details';
    maxCards: number;
    maxEvidencePerCard: number;
    maxResourceLinks: number;
    returnedCards: number;
    truncated: boolean;
  };
  nextActions: readonly string[];
  readOnly: true;
  sourceWrites: readonly [];
}

interface BuildCreativeContextResultOptions {
  mode: CreativeContextToolMode;
  toolName: string;
}

interface DraftCard {
  assumptions: string[];
  evidence: string[];
  id: string;
  kind: string;
  resourceLinks: string[];
  title: string;
  whyUseful: string;
}

const DEFAULT_ARTIFACT_KEY = 'workspace';
const MAX_CARDS = 8;
const MAX_EVIDENCE_PER_CARD = 4;
const MAX_RESOURCE_LINKS = 12;
const MAX_TEXT = 160;

const CONTEXT_SOURCE_KEYS = ['analyze', 'analysis', 'wiki', 'wikiEntries', 'relationshipNetwork', 'graph', 'contextCards', 'cards', 'artifacts', 'targetArtifacts', 'resourceLinks'] as const;

/**
 * buildCreativeContextToolResult 함수.
 * gather/inspect/search creative context inputs를 compact diagnostic envelope로 정규화함.
 * 이 함수는 filesystem, session store, mutation helper를 호출하지 않는 pure helper다.
 *
 * @param input - MCP tool input 또는 fixture object
 * @param options - tool name과 mode
 * @returns diagnostic envelope with creative.context data payload
 */
export function buildCreativeContextToolResult(input: unknown, options: BuildCreativeContextResultOptions): DiagnosticEnvelope<CreativeContextToolData> {
  const record = toRecord(input) ?? {};
  const artifactKey = firstString(record.artifactKey, firstArrayString(record.targetArtifacts)) ?? DEFAULT_ARTIFACT_KEY;
  const theme = firstString(record.theme, record.query, undefined);
  const diagnostics = collectContextDiagnostics(record, options.toolName);
  const allCards = buildDraftCards(record, artifactKey);
  const filteredCards = filterCardsForMode(allCards, record, options.mode);
  const hasRichContext = hasSuppliedContext(record) && filteredCards.length > 0;

  if (!hasRichContext) {
    diagnostics.push(createMissingContextDiagnostic(options.toolName, artifactKey));
  }

  const compacted = compactCards(filteredCards);
  const resourceLinks = compactStringList([
    ...deriveDefaultResourceLinks(record, artifactKey),
    ...compacted.cards.flatMap((card) => card.resourceLinks),
  ], MAX_RESOURCE_LINKS);
  const nextActions = buildNextActions(record, hasRichContext, diagnostics);
  const status = diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'domain_error'
    : diagnostics.length > 0
      ? 'domain_warning'
      : 'ok';

  const context = createCreativeContextEnvelope({
    artifactKey,
    contextCards: compacted.cards,
    resourceLinks,
    status: status as CreativeContextEnvelopeStatus,
    theme,
    tool: options.toolName,
  }) as CreativeContextEnvelope & { contextCards: readonly CreativeContextCard[] };

  return createDiagnosticEnvelope<CreativeContextToolData>({
    data: {
      compact: {
        embeddedPayloadPolicy: 'cards-only-links-for-details',
        maxCards: MAX_CARDS,
        maxEvidencePerCard: MAX_EVIDENCE_PER_CARD,
        maxResourceLinks: MAX_RESOURCE_LINKS,
        returnedCards: compacted.cards.length,
        truncated: compacted.truncated || resourceLinks.length < uniqueStrings([
          ...deriveDefaultResourceLinks(record, artifactKey),
          ...compacted.cards.flatMap((card) => card.resourceLinks),
        ]).length,
      },
      context,
      nextActions,
      readOnly: true,
      sourceWrites: [],
    },
    diagnostics,
    status: status as DiagnosticEnvelopeStatus,
    tool: options.toolName,
  });
}

function buildDraftCards(record: Record<string, unknown>, artifactKey: string): DraftCard[] {
  const cards: DraftCard[] = [];
  cards.push(...extractExplicitCards(record));
  cards.push(...extractArtifactCards(record, artifactKey));
  cards.push(...extractAnalyzeCards(record, artifactKey));
  cards.push(...extractRelationshipCards(record, artifactKey));
  cards.push(...extractWikiCards(record));
  cards.push(...extractGenericGraphCards(record, artifactKey));
  return dedupeCards(cards);
}

function extractExplicitCards(record: Record<string, unknown>): DraftCard[] {
  return [...toArray(record.contextCards), ...toArray(record.cards)]
    .map((entry) => {
      const card = toRecord(entry);
      if (!card) return null;
      const id = firstString(card.id, undefined);
      const title = firstString(card.title, undefined);
      if (!id || !title) return null;
      return createDraftCard({
        assumptions: toStringArray(card.assumptions),
        evidence: toStringArray(card.evidence),
        id,
        kind: firstString(card.kind, 'context') ?? 'context',
        resourceLinks: toStringArray(card.resourceLinks),
        title,
        whyUseful: firstString(card.whyUseful, card.summary, 'Caller supplied context card.') ?? 'Caller supplied context card.',
      });
    })
    .filter((entry): entry is DraftCard => entry !== null);
}

function extractArtifactCards(record: Record<string, unknown>, artifactKey: string): DraftCard[] {
  const artifacts = [
    ...toStringArray(record.targetArtifacts),
    ...toArray(record.artifacts)
      .map((entry) => {
        const artifact = toRecord(entry);
        return artifact ? firstString(artifact.path, artifact.artifactKey) : undefined;
      })
      .filter((entry): entry is string => Boolean(entry)),
  ];
  return compactStringList(artifacts, 3).map((artifact) => createDraftCard({
    assumptions: artifact === artifactKey ? [] : ['Caller supplied artifact scope; no source file was read by the creative context tool.'],
    evidence: [`input:artifact:${artifact}`],
    id: `artifact:${stableId(artifact)}`,
    kind: 'artifact',
    resourceLinks: [analyzeResource(artifactKey, 'artifact')],
    title: artifact,
    whyUseful: 'Constrains ideation to the caller supplied target artifact without reading or writing source files.',
  }));
}

function extractAnalyzeCards(record: Record<string, unknown>, artifactKey: string): DraftCard[] {
  const analyze = toRecord(record.analyze) ?? toRecord(record.analysis);
  if (!analyze || isUnavailableRecord(analyze)) return [];

  const cards: DraftCard[] = [];
  const variables = toArray(firstDefined(analyze.variables, toRecord(analyze.variableFlow)?.variables));
  for (const variable of variables.slice(0, 4)) {
    const variableRecord = toRecord(variable);
    if (!variableRecord) continue;
    const name = firstString(variableRecord.varName, variableRecord.name, variableRecord.id, undefined);
    if (!name) continue;
    const events = toArray(variableRecord.events);
    const readers = toStringArray(variableRecord.readers).length || events.filter((event) => toRecord(event)?.action === 'read').length;
    const writers = toStringArray(variableRecord.writers).length || events.filter((event) => toRecord(event)?.action === 'write').length;
    cards.push(createDraftCard({
      assumptions: ['Variable-flow details are summarized; inspect the analyze resource link before turning ideas into patches.'],
      evidence: compactStringList([...toStringArray(variableRecord.evidence), analyzeResource(artifactKey, `variables/${name}`)], MAX_EVIDENCE_PER_CARD),
      id: `var:${stableId(name)}`,
      kind: 'variable',
      resourceLinks: [analyzeResource(artifactKey, `variables/${name}`), analyzeResource(artifactKey, 'variables')],
      title: name,
      whyUseful: compactText(`Creative candidates can use this variable as state context (${readers} readers, ${writers} writers in supplied analyze summary).`),
    }));
  }

  const promptChain = toRecord(firstDefined(analyze.promptChain, record.promptChain));
  if (promptChain) {
    const chainCount = toArray(promptChain.chain).length;
    cards.push(createDraftCard({
      assumptions: ['Prompt-chain payload is represented by counts and links only to keep context compact.'],
      evidence: [analyzeResource(artifactKey, 'prompt-chain')],
      id: 'prompt-chain:summary',
      kind: 'prompt-chain',
      resourceLinks: [analyzeResource(artifactKey, 'prompt-chain')],
      title: 'Prompt chain summary',
      whyUseful: compactText(`Shows insertion and ordering context for prompt ideas${chainCount > 0 ? ` across ${chainCount} supplied links` : ''}.`),
    }));
  }

  const tokenBudget = toRecord(firstDefined(analyze.tokenBudget, record.tokenBudget));
  if (tokenBudget) {
    cards.push(createDraftCard({
      assumptions: ['Token budget is a supplied summary; re-run query_token_budget before patch planning if stale.'],
      evidence: [analyzeResource(artifactKey, 'token-budget')],
      id: 'token-budget:summary',
      kind: 'token-budget',
      resourceLinks: [analyzeResource(artifactKey, 'token-budget')],
      title: 'Token budget summary',
      whyUseful: compactText(firstString(tokenBudget.summary, tokenBudget.status, 'Flags token constraints for candidate ideas.') ?? 'Flags token constraints for candidate ideas.'),
    }));
  }

  return cards;
}

function extractRelationshipCards(record: Record<string, unknown>, artifactKey: string): DraftCard[] {
  const analyze = toRecord(record.analyze) ?? toRecord(record.analysis);
  const relationship = toRecord(firstDefined(record.relationshipNetwork, analyze?.relationshipNetwork));
  if (!relationship || isUnavailableRecord(relationship)) return [];
  const nodes = toArray(relationship.nodes).length;
  const edges = toArray(relationship.edges).length;
  return [createDraftCard({
    assumptions: ['Relationship-network details are linked, not embedded; use the resource for graph traversal.'],
    evidence: [analyzeResource(artifactKey, 'relationship-network')],
    id: 'relationship-network:summary',
    kind: 'relationship-network',
    resourceLinks: [analyzeResource(artifactKey, 'relationship-network')],
    title: 'Relationship network',
    whyUseful: compactText(`Surfaces weak ties and impact neighborhood for ideation (${nodes} nodes, ${edges} edges in supplied summary).`),
  })];
}

function extractWikiCards(record: Record<string, unknown>): DraftCard[] {
  const wikiEntries = toArray(firstDefined(record.wiki, record.wikiEntries));
  return wikiEntries.filter((entry) => {
    const wiki = toRecord(entry);
    return !wiki || !isUnavailableRecord(wiki);
  }).slice(0, 3).map((entry, index) => {
    const wiki = toRecord(entry);
    const textEntry = typeof entry === 'string' ? entry : undefined;
    const title = compactText(firstString(wiki?.title, wiki?.path, textEntry, `Wiki reference ${index + 1}`) ?? `Wiki reference ${index + 1}`);
    const uri = firstString(wiki?.uri, wiki?.resourceUri, wiki?.path ? wikiResource(String(wiki.path)) : undefined, textEntry?.startsWith('risuai-workbench://') ? textEntry : undefined) ?? wikiResource(title);
    return createDraftCard({
      assumptions: ['Wiki content is referenced by URI/path; large documentation text is intentionally not embedded.'],
      evidence: compactStringList([...toStringArray(wiki?.evidence), uri], MAX_EVIDENCE_PER_CARD),
      id: `wiki:${stableId(title)}`,
      kind: 'wiki',
      resourceLinks: [uri],
      title,
      whyUseful: compactText(firstString(wiki?.summary, wiki?.whyUseful, 'Documentation constraint or reference for creative ideas.') ?? 'Documentation constraint or reference for creative ideas.'),
    });
  });
}

function extractGenericGraphCards(record: Record<string, unknown>, artifactKey: string): DraftCard[] {
  const graph = toRecord(record.graph);
  if (!graph || isUnavailableRecord(graph)) return [];
  const nodes = toArray(graph.nodes).length;
  const edges = toArray(graph.edges).length;
  return [createDraftCard({
    assumptions: ['Graph payload is summarized to avoid embedding large graph data.'],
    evidence: [analyzeResource(artifactKey, 'graph')],
    id: 'graph:summary',
    kind: 'graph',
    resourceLinks: [analyzeResource(artifactKey, 'graph')],
    title: 'Graph summary',
    whyUseful: compactText(`Provides structural context for idea search (${nodes} nodes, ${edges} edges supplied).`),
  })];
}

function isUnavailableRecord(record: Record<string, unknown>): boolean {
  const status = firstString(record.status, undefined)?.toLowerCase();
  return status === 'not_found' || status === 'unavailable' || status === 'domain_error' || status === 'missing';
}

function filterCardsForMode(cards: readonly DraftCard[], record: Record<string, unknown>, mode: CreativeContextToolMode): DraftCard[] {
  const include = new Set(toStringArray(record.include).map((item) => item.toLowerCase()));
  let filtered = include.size > 0 ? cards.filter((card) => include.has(card.kind.toLowerCase()) || include.has(card.id.split(':')[0].toLowerCase())) : [...cards];

  if (mode === 'inspect') {
    const contextId = firstString(record.contextId, record.cardId, undefined);
    if (contextId) {
      filtered = filtered.filter((card) => card.id === contextId || card.id.includes(contextId) || card.kind === contextId);
    }
  }

  if (mode === 'search') {
    const query = firstString(record.query, undefined)?.toLowerCase();
    if (query) {
      filtered = filtered.filter((card) => [card.id, card.kind, card.title, card.whyUseful, ...card.evidence, ...card.assumptions].some((value) => value.toLowerCase().includes(query)));
    }
  }

  return filtered;
}

function collectContextDiagnostics(record: Record<string, unknown>, toolName: string): WorkbenchDiagnostic[] {
  const diagnostics: WorkbenchDiagnostic[] = [];
  collectSourceHealthDiagnostics(diagnostics, record.analyze, toolName, 'analyze');
  collectSourceHealthDiagnostics(diagnostics, record.analysis, toolName, 'analyze');
  collectSourceHealthDiagnostics(diagnostics, record.wiki, toolName, 'wiki');
  collectSourceHealthDiagnostics(diagnostics, record.wikiEntries, toolName, 'wiki');
  collectSourceHealthDiagnostics(diagnostics, record.relationshipNetwork, toolName, 'relationship-network');
  collectSourceHealthDiagnostics(diagnostics, record.graph, toolName, 'graph');
  return dedupeDiagnostics(diagnostics);
}

function collectSourceHealthDiagnostics(diagnostics: WorkbenchDiagnostic[], value: unknown, toolName: string, source: string): void {
  for (const entry of Array.isArray(value) ? value : [value]) {
    const record = toRecord(entry);
    if (!record) continue;
    const status = firstString(record.status, undefined)?.toLowerCase();
    const unavailable = status === 'not_found' || status === 'unavailable' || status === 'domain_error' || status === 'missing';
    if (unavailable) {
      diagnostics.push({
        category: 'creative-context',
        id: 'CREATIVE_CONTEXT_SOURCE_UNAVAILABLE',
        message: `${source} context is unavailable or missing for ${toolName}; returning compact warnings instead of throwing.`,
        path: null,
        ruleId: `creative.context.${source}.unavailable`,
        severity: 'warning',
      });
    }

    const snapshot = toRecord(record.snapshot);
    if (record.stale === true || snapshot?.stale === true) {
      diagnostics.push({
        category: 'creative-context',
        id: 'CREATIVE_CONTEXT_SOURCE_STALE',
        message: `${source} context is stale; refresh analyze/wiki/graph context before patch planning.`,
        path: null,
        ruleId: `creative.context.${source}.stale`,
        severity: 'warning',
      });
    }
  }
}

function createMissingContextDiagnostic(toolName: string, artifactKey: string): WorkbenchDiagnostic {
  return {
    category: 'creative-context',
    id: 'CREATIVE_CONTEXT_MISSING_SOURCE',
    message: `${toolName} needs analyze/wiki/graph context for ${artifactKey}; returning nextActions instead of throwing.`,
    path: null,
    ruleId: 'creative.context.missing-source',
    severity: 'warning',
  };
}

function buildNextActions(record: Record<string, unknown>, hasRichContext: boolean, diagnostics: readonly WorkbenchDiagnostic[]): string[] {
  const callerActions = toStringArray(record.nextActions);
  const actions = [...callerActions];
  if (!hasRichContext || diagnostics.some((diagnostic) => diagnostic.id === 'CREATIVE_CONTEXT_MISSING_SOURCE')) {
    actions.push('workbench.refresh_analyze_snapshot', 'workbench.query_relationship_network', 'workbench.search_wiki');
  }
  if (diagnostics.some((diagnostic) => diagnostic.id === 'CREATIVE_CONTEXT_SOURCE_STALE')) {
    actions.push('workbench.refresh_analyze_snapshot');
  }
  if (hasRichContext) {
    actions.push('workbench.creative.brainstorm_scamper');
  }
  return compactStringList(actions, 8);
}

function deriveDefaultResourceLinks(record: Record<string, unknown>, artifactKey: string): string[] {
  const links = [...toStringArray(record.resourceLinks), analyzeResource(artifactKey, 'relationship-network')];
  const method = firstString(record.method, undefined);
  if (method) links.push(`risuai-workbench://methods/${encodePathSegment(method)}`);
  links.push('risuai-workbench://rubrics/idea-quality', 'risuai-workbench://rubrics/artifact-fit');
  return links;
}

function compactCards(cards: readonly DraftCard[]): { cards: CreativeContextCard[]; truncated: boolean } {
  const compacted = cards.slice(0, MAX_CARDS).map((card) => ({
    assumptions: compactStringList(card.assumptions.map(compactText), MAX_EVIDENCE_PER_CARD),
    evidence: compactStringList(card.evidence.map(compactText), MAX_EVIDENCE_PER_CARD),
    id: compactText(card.id),
    kind: compactText(card.kind),
    resourceLinks: compactStringList(card.resourceLinks.map(compactText), MAX_EVIDENCE_PER_CARD),
    title: compactText(card.title),
    whyUseful: compactText(card.whyUseful),
  }));
  return { cards: compacted, truncated: cards.length > compacted.length };
}

function createDraftCard(input: DraftCard): DraftCard {
  return {
    assumptions: compactStringList(input.assumptions, MAX_EVIDENCE_PER_CARD),
    evidence: compactStringList(input.evidence, MAX_EVIDENCE_PER_CARD),
    id: input.id,
    kind: input.kind,
    resourceLinks: compactStringList(input.resourceLinks, MAX_EVIDENCE_PER_CARD),
    title: input.title,
    whyUseful: input.whyUseful,
  };
}

function dedupeCards(cards: readonly DraftCard[]): DraftCard[] {
  const seen = new Set<string>();
  const result: DraftCard[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    result.push(card);
  }
  return result;
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

function hasSuppliedContext(record: Record<string, unknown>): boolean {
  return CONTEXT_SOURCE_KEYS.some((key) => {
    const value = record[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null;
  });
}

function analyzeResource(artifactKey: string, suffix: string): string {
  return `risuai-workbench://analyze/${encodePathSegment(artifactKey)}/${suffix.split('/').map(encodePathSegment).join('/')}`;
}

function wikiResource(pathValue: string): string {
  const normalized = pathValue.replace(/^risuai-workbench:\/\/wiki\//, '').replace(/^wiki\//, '').replace(/^\/+/, '');
  return `risuai-workbench://wiki/${normalized.split('/').map(encodePathSegment).join('/')}`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%3A/g, ':');
}

function stableId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '') || 'context';
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT - 1)}…` : normalized;
}

function compactStringList(values: readonly string[], max: number): string[] {
  return uniqueStrings(values.filter((value) => value.trim().length > 0).map(compactText)).slice(0, max);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
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

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

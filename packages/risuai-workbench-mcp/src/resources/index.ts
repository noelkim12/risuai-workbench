/**
 * Read-only MCP resource registration and handlers for workbench context surfaces.
 * @file packages/risuai-workbench-mcp/src/resources/index.ts
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import { buildRegistrySnapshot, WORKBENCH_REGISTRY, type WorkbenchResourceRegistryEntry } from '../registry';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath } from '../project/safe-path';
import type { PatchPlanStore } from '../mutation/patch-store';
import { readCbsResource } from './cbs-reference';
import { readRisuLuaResource } from './risulua-reference';

interface ResourcePayload {
  schema: 'risuai-workbench-mcp.resource';
  schemaVersion: '0.2.0';
  resource: string;
  uri: string;
  status: 'ok' | 'not_found' | 'unavailable';
  summary: string;
  data: Record<string, unknown>;
}

interface CreativeReferenceCard {
  id: string;
  title: string;
  purpose: string;
  useWhen: string[];
  workflow: string[];
  safety: string[];
  source: {
    path: typeof CREATIVE_KB_REFERENCE;
    lines: string;
  };
}

const JSON_MIME = 'application/json' as const;
const TEXT_MIME = 'text/plain' as const;
const CREATIVE_KB_REFERENCE = 'docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md' as const;

const CREATIVE_SAFETY = [
  'Read resources as knowledge-base references only; resource reads never mutate files.',
  'Divergent creative steps must not write source artifacts.',
  'Only a selected idea can become a patch plan, and application requires preview, explicit confirmation, gated mutation tools, and post-validation.',
] as const;

const CREATIVE_METHOD_CARDS: Record<string, CreativeReferenceCard> = {
  'morphological-analysis': {
    id: 'morphological-analysis',
    purpose: 'Explore combinations across artifact dimensions such as trigger, variable, lorebook entry, prompt position, and validation path.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 731-741', path: CREATIVE_KB_REFERENCE },
    title: 'Morphological analysis',
    useWhen: ['You need a broad option matrix.', 'The design space has several independent dimensions.'],
    workflow: ['Name dimensions and values.', 'Generate bounded combinations.', 'Rank combinations by evidence, feasibility, risk, token cost, and patch readiness.'],
  },
  'reverse-brainstorming': {
    id: 'reverse-brainstorming',
    purpose: 'Find failure modes first, then invert them into safer design ideas and test questions.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 731-741', path: CREATIVE_KB_REFERENCE },
    title: 'Reverse brainstorming',
    useWhen: ['A proposal looks risky.', 'You need red-team style checks before patch planning.'],
    workflow: ['List how the concept could fail.', 'Tie each failure to evidence or an assumption.', 'Invert failures into mitigations, validators, or smaller patch previews.'],
  },
  scamper: {
    id: 'scamper',
    purpose: 'Use Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, and Reverse to create artifact-safe variants.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 703-719, 731-741', path: CREATIVE_KB_REFERENCE },
    title: 'SCAMPER',
    useWhen: ['You have an existing lorebook entry, prompt chain, variable flow, or artifact pattern to vary.', 'You need many small candidate ideas before selecting one.'],
    workflow: ['Gather context and separate evidence from assumptions.', 'Generate concise variants under each SCAMPER lens.', 'Select candidates before any patch plan preview.'],
  },
  'six-hats': {
    id: 'six-hats',
    purpose: 'Review an idea through neutral facts, benefits, risks, emotions, alternatives, and process control.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 703-719, 731-741', path: CREATIVE_KB_REFERENCE },
    title: 'Six Hats',
    useWhen: ['An idea needs balanced critique.', 'You need to distinguish evidence, assumptions, risks, and next actions.'],
    workflow: ['Summarize facts and missing context.', 'Evaluate benefits and risks separately.', 'Return next validation or preview steps without applying changes.'],
  },
  triz: {
    id: 'triz',
    purpose: 'Frame contradictions between desired creative impact and constraints such as token budget, ordering, validation, or source safety.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 731-741', path: CREATIVE_KB_REFERENCE },
    title: 'TRIZ',
    useWhen: ['Two requirements conflict.', 'You need a smaller resolution path before creating a patch plan.'],
    workflow: ['State the contradiction plainly.', 'List constraints and evidence.', 'Suggest separation, substitution, or staged preview options.'],
  },
};

const CREATIVE_RUBRIC_CARDS: Record<string, CreativeReferenceCard> = {
  'artifact-fit': {
    id: 'artifact-fit',
    purpose: 'Judge whether an idea fits the target artifact, ownership boundaries, order semantics, and validation path.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 721-741', path: CREATIVE_KB_REFERENCE },
    title: 'Artifact fit rubric',
    useWhen: ['Choosing which idea can become a patch plan.', 'Checking source artifact risk before preview.'],
    workflow: ['Check target artifact ownership.', 'Check affected files and expected diagnostics.', 'Prefer ideas with clear preview and validation steps.'],
  },
  'idea-quality': {
    id: 'idea-quality',
    purpose: 'Score ideas by impact, feasibility, novelty, risk, token cost, and patch readiness while keeping evidence separate from assumptions.',
    safety: [...CREATIVE_SAFETY],
    source: { lines: '612-626, 628-668, 731-741', path: CREATIVE_KB_REFERENCE },
    title: 'Idea quality rubric',
    useWhen: ['Ranking creative candidates.', 'Deciding whether an idea is ready for red-team review or patch planning.'],
    workflow: ['Require evidence and assumptions arrays.', 'Score positives and risks separately.', 'Return next actions such as validation, ranking, or patch preview.'],
  },
};

/**
 * registerWorkbenchResources 함수.
 * proposal resource URI families를 official MCP SDK resource API로 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param workspace - startup에서 계산한 workspace root 상태
 */
export function registerWorkbenchResources(server: McpServer, workspace: WorkspaceRootStatus, patchStore?: PatchPlanStore): void {
  for (const entry of WORKBENCH_REGISTRY.resources) {
    const template = normalizeResourceTemplate(entry.uriTemplate);
    server.registerResource(
      entry.name,
      new ResourceTemplate(template, { list: undefined }),
      {
        description: entry.description,
        mimeType: JSON_MIME,
        title: entry.title,
      },
      async (uri) => readWorkbenchResource(entry, uri, workspace, patchStore),
    );
  }

  server.registerResource(
    'workbench.resource.mutation_journal.collection',
    'risuai-workbench://mutations/journal',
    {
      description: 'Read mutation journal collection view.',
      mimeType: JSON_MIME,
      title: 'Mutation journal collection',
    },
    async (uri) => readWorkbenchResource(findResourceEntry('workbench.resource.mutation_journal'), uri, workspace, patchStore),
  );
}

/**
 * readWorkbenchResource 함수.
 * URI family별 read-only payload를 안정적인 JSON/text resource result로 반환함.
 *
 * @param entry - registry resource entry
 * @param uri - MCP client가 요청한 resource URI
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns MCP read resource result
 */
export async function readWorkbenchResource(
  entry: WorkbenchResourceRegistryEntry,
  uri: URL,
  workspace: WorkspaceRootStatus,
  patchStore?: PatchPlanStore,
): Promise<ReadResourceResult> {
  const uriText = uri.toString();

  if (entry.name === 'workbench.resource.rule_catalog') {
    return jsonResource(uriText, {
      data: { registry: buildRegistrySnapshot().resources },
      resource: entry.name,
      status: 'ok',
      summary: 'Read-only rule catalog resource registry.',
      uri: uriText,
    });
  }

  if (entry.name === 'workbench.resource.schema') {
    return jsonResource(uriText, buildStablePayload(entry.name, uriText, 'not_found', 'Schema content is not materialized yet.', {
      schemaName: decodeLastPathSegment(uri),
    }));
  }

  if (entry.name === 'workbench.resource.wiki') {
    return readWikiResource(entry.name, uri, workspace);
  }

  if (entry.name === 'workbench.resource.cbs_reference') {
    const cbsResult = readCbsResource(uriText);
    if (cbsResult) {
      return cbsResult as ReadResourceResult;
    }
    return jsonResource(uriText, buildStablePayload(entry.name, uriText, 'not_found', 'CBS reference resource was not found.', {
      requestedId: decodeLastPathSegment(uri),
    }));
  }

  if (entry.name === 'workbench.resource.risulua_reference') {
    const risuLuaResult = readRisuLuaResource(uriText);
    if (risuLuaResult) {
      return risuLuaResult as ReadResourceResult;
    }
    return jsonResource(uriText, buildStablePayload(entry.name, uriText, 'not_found', 'RisuLua reference resource was not found.', {
      requestedId: decodeLastPathSegment(uri),
    }));
  }

  if (entry.name.startsWith('workbench.creative.resource.')) {
    return readCreativeResource(entry, uri, patchStore);
  }

  return jsonResource(uriText, buildStablePayload(entry.name, uriText, 'not_found', `${entry.title} is not materialized yet.`, {
    requestedId: decodeLastPathSegment(uri),
    readOnly: true,
  }));
}

/**
 * readCreativeResource 함수.
 * Creative method/rubric reference cards를 반환하고, idea/session data miss는 stable payload로 반환함.
 *
 * @param entry - creative resource registry entry
 * @param uri - 요청 URI
 * @returns MCP read resource result
 */
function readCreativeResource(entry: WorkbenchResourceRegistryEntry, uri: URL, patchStore?: PatchPlanStore): ReadResourceResult {
  const uriText = uri.toString();

  if (entry.name === 'workbench.creative.resource.methods') {
    return jsonResource(uriText, {
      data: {
        methods: Object.values(CREATIVE_METHOD_CARDS).map(({ id, title, purpose, source }) => ({ id, title, purpose, source })),
        safety: CREATIVE_SAFETY,
      },
      resource: entry.name,
      status: 'ok',
      summary: 'Creative method catalog reference cards.',
      uri: uriText,
    });
  }

  const requestedId = decodeLastPathSegment(uri);

  if (entry.name.startsWith('workbench.creative.resource.method.')) {
    const method = CREATIVE_METHOD_CARDS[requestedId];
    if (!method) {
      return creativeNotFoundResource(entry, uriText, requestedId);
    }
    return jsonResource(uriText, {
      data: { method },
      resource: entry.name,
      status: 'ok',
      summary: `${method.title} creative method reference card.`,
      uri: uriText,
    });
  }

  if (entry.name.startsWith('workbench.creative.resource.rubric.')) {
    const rubric = CREATIVE_RUBRIC_CARDS[requestedId];
    if (!rubric) {
      return creativeNotFoundResource(entry, uriText, requestedId);
    }
    return jsonResource(uriText, {
      data: { rubric },
      resource: entry.name,
      status: 'ok',
      summary: `${rubric.title} reference card.`,
      uri: uriText,
    });
  }

  if (entry.name === 'workbench.creative.resource.idea_patch_plan') {
    const ideaId = decodeIdeaIdFromIdeaPatchPlanUri(uri);
    if (ideaId && patchStore) {
      const patchPlan = patchStore.findByIdeaId(ideaId);
      if (patchPlan) {
        const affectedFiles = patchPlan.preview.affectedFiles.map((file) => file.path);
        const operationKinds = [...new Set(patchPlan.operations.map((op) => op.kind))].sort();
        return jsonResource(uriText, {
          data: {
            affectedFiles,
            expectedDiagnostics: patchPlan.expectedDiagnostics.map((d) => ({ category: d.category, id: d.id, severity: d.severity })),
            ideaId,
            operationKinds,
            patchPlanId: patchPlan.patchPlanId,
            patchPlanResource: patchPlan.preview.resourceLinks[0] ?? '',
            preconditions: patchPlan.preconditions.map((p) => ({ kind: p.kind, message: p.message })),
            safety: patchPlan.safety,
          },
          resource: entry.name,
          status: 'ok',
          summary: `Patch plan preview for idea ${ideaId}.`,
          uri: uriText,
        });
      }
    }
    return creativeNotFoundResource(entry, uriText, ideaId ?? requestedId);
  }

  return creativeNotFoundResource(entry, uriText, requestedId);
}

/**
 * creativeNotFoundResource 함수.
 * 아직 materialize되지 않은 creative URI family의 stable not_found payload를 반환함.
 *
 * @param entry - creative resource registry entry
 * @param uriText - 요청 URI 문자열
 * @param requestedId - 요청한 id
 * @returns MCP read resource result
 */
function creativeNotFoundResource(entry: WorkbenchResourceRegistryEntry, uriText: string, requestedId: string): ReadResourceResult {
  return jsonResource(uriText, buildStablePayload(entry.name, uriText, 'not_found', `${entry.title} is not materialized yet.`, {
    requestedId,
    readOnly: true,
    source: CREATIVE_KB_REFERENCE,
  }));
}

/**
 * readWikiResource 함수.
 * workspace 안의 wiki 파일을 읽거나 stable not-found JSON을 반환함.
 *
 * @param resource - resource registry name
 * @param uri - 요청 URI
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns MCP read resource result
 */
async function readWikiResource(resource: string, uri: URL, workspace: WorkspaceRootStatus): Promise<ReadResourceResult> {
  const uriText = uri.toString();
  const wikiPath = decodeWikiPath(uri);

  if (!workspace.ok) {
    return jsonResource(uriText, buildStablePayload(resource, uriText, 'unavailable', 'Workspace root is unavailable.', {
      reason: workspace.reason,
      wikiPath,
    }));
  }

  const safePath = await resolveSafeWorkspacePath({
    inputPath: path.posix.join('wiki', wikiPath),
    intent: 'read-existing',
    workspace,
  });
  if (!safePath.ok) {
    return jsonResource(uriText, buildStablePayload(resource, uriText, 'not_found', 'Wiki resource was not found.', {
      reason: safePath.reason,
      wikiPath,
    }));
  }

  const fileStat = await stat(safePath.absolutePath);
  if (!fileStat.isFile()) {
    return jsonResource(uriText, buildStablePayload(resource, uriText, 'not_found', 'Wiki resource is not a file.', { wikiPath }));
  }

  const text = await readFile(safePath.absolutePath, 'utf8');
  return {
    contents: [
      {
        mimeType: TEXT_MIME,
        text,
        uri: uriText,
      },
    ],
  };
}

/**
 * buildStablePayload 함수.
 * resource miss/unavailable 응답에 사용하는 stable JSON envelope를 만듦.
 *
 * @param resource - resource registry name
 * @param uri - 요청 URI 문자열
 * @param status - resource read 상태
 * @param summary - 사람이 읽을 요약
 * @param data - 추가 stable payload
 * @returns resource JSON payload
 */
function buildStablePayload(
  resource: string,
  uri: string,
  status: ResourcePayload['status'],
  summary: string,
  data: Record<string, unknown>,
): ResourcePayload {
  return {
    data,
    resource,
    schema: 'risuai-workbench-mcp.resource',
    schemaVersion: '0.2.0',
    status,
    summary,
    uri,
  };
}

/**
 * jsonResource 함수.
 * payload를 JSON MCP resource result로 감쌈.
 *
 * @param uri - 요청 URI 문자열
 * @param payload - JSON으로 직렬화할 payload
 * @returns MCP read resource result
 */
function jsonResource(uri: string, payload: Omit<ResourcePayload, 'schema' | 'schemaVersion'> | ResourcePayload): ReadResourceResult {
  const normalized = 'schema' in payload ? payload : { schema: 'risuai-workbench-mcp.resource' as const, schemaVersion: '0.2.0' as const, ...payload };
  return {
    contents: [
      {
        mimeType: JSON_MIME,
        text: `${JSON.stringify(normalized, null, 2)}\n`,
        uri,
      },
    ],
  };
}

/**
 * normalizeResourceTemplate 함수.
 * registry template를 SDK URI template이 이해하는 안정 형식으로 보정함.
 *
 * @param template - registry URI template
 * @returns SDK 등록용 URI template
 */
function normalizeResourceTemplate(template: string): string {
  return template.replace('{mutationId?}', '{mutationId}');
}

/**
 * findResourceEntry 함수.
 * registry resource entry를 이름으로 찾음.
 *
 * @param name - 찾을 resource name
 * @returns registry resource entry
 */
function findResourceEntry(name: string): WorkbenchResourceRegistryEntry {
  const entry = WORKBENCH_REGISTRY.resources.find((resource) => resource.name === name);
  if (!entry) {
    throw new Error(`Missing registry resource: ${name}`);
  }
  return entry;
}

/**
 * decodeLastPathSegment 함수.
 * URI 마지막 path segment를 identifier로 해석함.
 *
 * @param uri - 요청 URI
 * @returns decode된 마지막 segment
 */
function decodeLastPathSegment(uri: URL): string {
  const segments = uri.pathname.split('/').filter(Boolean);
  return decodeURIComponent(segments.at(-1) ?? '');
}

/**
 * decodeIdeaIdFromIdeaPatchPlanUri 함수.
 * `risuai-workbench://ideas/{ideaId}/patch-plan` URI에서 ideaId를 추출함.
 * In Node URL semantics, `ideas` is the host and pathname is `/{ideaId}/patch-plan`.
 *
 * @param uri - 요청 URI
 * @returns ideaId 또는 undefined
 */
function decodeIdeaIdFromIdeaPatchPlanUri(uri: URL): string | undefined {
  // For risuai-workbench://ideas/{ideaId}/patch-plan, host is 'ideas',
  // pathname is '/{ideaId}/patch-plan'.
  const segments = uri.pathname.split('/').filter(Boolean);
  if (uri.host === 'ideas' && segments.length >= 2 && segments.at(-1) === 'patch-plan') {
    return decodeURIComponent(segments[0]);
  }
  // Fallback: also check if host is in path segments (non-standard but defensive)
  if (segments.length >= 3 && segments[0] === 'ideas' && segments.at(-1) === 'patch-plan') {
    return decodeURIComponent(segments[segments.length - 2]);
  }
  return undefined;
}

/**
 * decodeWikiPath 함수.
 * wiki URI host/path를 workspace-relative wiki 하위 경로로 변환함.
 *
 * @param uri - 요청 URI
 * @returns decode된 wiki 하위 경로
 */
function decodeWikiPath(uri: URL): string {
  const pathPart = uri.pathname.replace(/^\//, '');
  return decodeURIComponent(pathPart || 'index.md');
}



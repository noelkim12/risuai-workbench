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

interface ResourcePayload {
  schema: 'risuai-workbench-mcp.resource';
  schemaVersion: '0.2.0';
  resource: string;
  uri: string;
  status: 'ok' | 'not_found' | 'unavailable';
  summary: string;
  data: Record<string, unknown>;
}

const JSON_MIME = 'application/json' as const;
const TEXT_MIME = 'text/plain' as const;

/**
 * registerWorkbenchResources 함수.
 * proposal resource URI families를 official MCP SDK resource API로 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param workspace - startup에서 계산한 workspace root 상태
 */
export function registerWorkbenchResources(server: McpServer, workspace: WorkspaceRootStatus): void {
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
      async (uri) => readWorkbenchResource(entry, uri, workspace),
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
    async (uri) => readWorkbenchResource(findResourceEntry('workbench.resource.mutation_journal'), uri, workspace),
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

  return jsonResource(uriText, buildStablePayload(entry.name, uriText, 'not_found', `${entry.title} is not materialized yet.`, {
    requestedId: decodeLastPathSegment(uri),
    readOnly: true,
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

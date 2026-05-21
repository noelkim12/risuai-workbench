/**
 * Resource URI helpers for RisuAI Workbench MCP read-only resources.
 * @file packages/risuai-workbench-mcp/src/contracts/resource-uri.ts
 */

export const WORKBENCH_RESOURCE_URI_SCHEME = 'risuai-workbench' as const;
export const WORKBENCH_RESOURCE_URI_PREFIX = `${WORKBENCH_RESOURCE_URI_SCHEME}://` as const;

/**
 * encodeResourceSegment 함수.
 * resource URI path segment에 들어갈 id를 percent-encoding함.
 *
 * @param segment - URI segment로 사용할 identifier
 * @returns percent-encoded segment
 */
export function encodeResourceSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * buildMutationJournalCollectionUri 함수.
 * mutation journal collection resource URI를 만듦.
 *
 * @returns mutation journal collection URI
 */
export function buildMutationJournalCollectionUri(): string {
  return `${WORKBENCH_RESOURCE_URI_PREFIX}mutations/journal`;
}

/**
 * buildMutationJournalUri 함수.
 * 단일 mutation journal entry resource URI를 만듦.
 *
 * @param mutationId - journal entry identifier
 * @returns mutation journal entry URI
 */
export function buildMutationJournalUri(mutationId: string): string {
  return `${buildMutationJournalCollectionUri()}/${encodeResourceSegment(mutationId)}`;
}

/**
 * buildPatchPlanUri 함수.
 * patch plan preview resource URI를 만듦.
 *
 * @param patchPlanId - patch plan identifier
 * @returns patch plan resource URI
 */
export function buildPatchPlanUri(patchPlanId: string): string {
  return `${WORKBENCH_RESOURCE_URI_PREFIX}mutations/patch-plans/${encodeResourceSegment(patchPlanId)}`;
}

/**
 * Preview-only patch plan construction helpers for Task 6 MCP tools.
 * @file packages/risuai-workbench-mcp/src/mutation/patch-preview.ts
 */

import { createHash } from 'node:crypto';

import { buildPatchPlanUri } from '../contracts/resource-uri';
import type { AffectedFile, DiagnosticExpectation, PatchOperation, PatchPlan, PatchPrecondition } from '../contracts/patch-plan';

export interface CreatePatchPlanInput {
  workspaceRoot: string;
  intent: string;
  operations: readonly PatchOperation[];
  preconditions: readonly PatchPrecondition[];
  expectedDiagnostics: readonly DiagnosticExpectation[];
  unifiedDiff?: string;
  safety?: Partial<PatchPlan['safety']>;
}

/**
 * createPatchPlan 함수.
 * write 없이 apply 단계가 재검증할 수 있는 PatchPlan envelope를 구성함.
 *
 * @param input - patch intent, operations, preconditions, diagnostics preview
 * @returns resource link와 affectedFiles가 포함된 patch plan
 */
export function createPatchPlan(input: CreatePatchPlanInput): PatchPlan {
  const createdAt = new Date().toISOString();
  const seed = JSON.stringify({ intent: input.intent, operations: input.operations, preconditions: input.preconditions });
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 12);
  const patchPlanId = `patch:${createdAt.slice(0, 10)}:${hash}`;

  return {
    createdAt,
    expectedDiagnostics: input.expectedDiagnostics,
    intent: input.intent,
    operations: input.operations,
    patchPlanId,
    preconditions: input.preconditions,
    preview: {
      affectedFiles: buildAffectedFiles(input.operations),
      resourceLinks: [buildPatchPlanUri(patchPlanId)],
      unifiedDiff: input.unifiedDiff,
    },
    safety: {
      destructive: input.safety?.destructive ?? false,
      touchesGeneratedOnly: input.safety?.touchesGeneratedOnly ?? false,
      touchesSourceArtifacts: input.safety?.touchesSourceArtifacts ?? true,
    },
    schema: 'risuai-workbench-mcp.patch-plan',
    schemaVersion: '0.2.0',
    workspaceRoot: input.workspaceRoot,
  };
}

/**
 * createFileHashPrecondition 함수.
 * patch preview 시점의 source hash precondition을 PatchPlan에 넣을 수 있게 변환함.
 *
 * @param relativePath - workspace-relative target path
 * @param expectedHash - preview 시점의 sha256 hash
 * @returns file.hash precondition
 */
export function createFileHashPrecondition(relativePath: string, expectedHash: string): PatchPrecondition {
  return {
    expectedHash,
    kind: 'file.hash',
    message: `Apply only if ${relativePath} still has hash ${expectedHash}.`,
    path: relativePath,
  };
}

/**
 * createInsideWorkspacePrecondition 함수.
 * apply 단계가 mutation mode와 precondition을 다시 확인해야 함을 명시함.
 *
 * @param relativePath - workspace-relative target path
 * @returns path.inside-workspace precondition
 */
export function createInsideWorkspacePrecondition(relativePath: string): PatchPrecondition {
  return {
    kind: 'path.inside-workspace',
    message: `${relativePath} must resolve inside the workspace at apply time.`,
    path: relativePath,
  };
}

/**
 * createNonexistencePrecondition 함수.
 * create preview가 대상 path 부재를 요구한다는 조건을 표현함.
 *
 * @param relativePath - workspace-relative create target path
 * @returns path.not-exists precondition
 */
export function createNonexistencePrecondition(relativePath: string): PatchPrecondition {
  return {
    kind: 'path.not-exists',
    message: `${relativePath} must not exist at apply time.`,
    path: relativePath,
  };
}

/**
 * buildUnifiedDiff 함수.
 * preview-only 테스트와 agent review에 충분한 작은 unified diff 문자열을 만듦.
 *
 * @param filePath - diff header에 표시할 workspace-relative path
 * @param before - preview 전 내용
 * @param after - preview 후 예상 내용
 * @returns 간단한 unified diff
 */
export function buildUnifiedDiff(filePath: string, before: string, after: string): string {
  return [`--- a/${filePath}`, `+++ b/${filePath}`, '@@ preview @@', ...prefixLines('-', before), ...prefixLines('+', after)].join('\n');
}

/**
 * buildAffectedFiles 함수.
 * operations를 target file별 operation kind 목록으로 집계함.
 *
 * @param operations - patch plan operation 목록
 * @returns affected file summary
 */
function buildAffectedFiles(operations: readonly PatchOperation[]): readonly AffectedFile[] {
  const byPath = new Map<string, Set<PatchOperation['kind']>>();
  for (const operation of operations) {
    for (const filePath of getOperationPaths(operation)) {
      const kinds = byPath.get(filePath) ?? new Set<PatchOperation['kind']>();
      kinds.add(operation.kind);
      byPath.set(filePath, kinds);
    }
  }

  return [...byPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, kinds]) => ({
      operationKinds: [...kinds].sort() as PatchOperation['kind'][],
      path: filePath,
    }));
}

/**
 * getOperationPaths 함수.
 * operation 종류별 affected path를 추출함.
 *
 * @param operation - patch operation
 * @returns operation이 건드릴 workspace-relative path 목록
 */
function getOperationPaths(operation: PatchOperation): readonly string[] {
  if (operation.kind === 'order.insert' || operation.kind === 'order.move' || operation.kind === 'order.remove') {
    return operation.orderPath ? [operation.orderPath] : [];
  }
  if (operation.kind === 'file.move') {
    return [operation.from, operation.to];
  }
  return 'path' in operation ? [operation.path] : [];
}

/**
 * prefixLines 함수.
 * diff body line에 변경 prefix를 붙임.
 *
 * @param prefix - diff line prefix
 * @param text - 원문 block
 * @returns prefix가 붙은 line 목록
 */
function prefixLines(prefix: '-' | '+', text: string): string[] {
  return text.split('\n').map((line) => `${prefix}${line}`);
}

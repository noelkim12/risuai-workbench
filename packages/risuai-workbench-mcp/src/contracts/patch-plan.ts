/**
 * Mutation preview and patch plan contracts for the MCP roadmap surface.
 * @file packages/risuai-workbench-mcp/src/contracts/patch-plan.ts
 */

export type MutationMode = 'preview' | 'commit';

export interface ApplyPatchPlanOptions {
  postValidate?: boolean;
  createBackup?: boolean;
  rollbackOnValidationError?: boolean;
}

export interface ApplyPatchPlanInput {
  patchPlanId: string;
  options?: ApplyPatchPlanOptions;
}

export type PatchOperation =
  | { kind: 'text.replace'; path: string; startOffset: number; endOffset: number; text: string }
  | { kind: 'file.create'; path: string; content: string; overwrite?: false }
  | { kind: 'file.delete'; path: string; expectedHash: string }
  | { kind: 'file.move'; from: string; to: string; expectedHash: string }
  | { kind: 'json.set'; path: string; jsonPointer: string; value: unknown }
  | { kind: 'json.remove'; path: string; jsonPointer: string }
  | { kind: 'order.insert'; orderPath?: string; entry: string; index?: number }
  | { kind: 'order.remove'; orderPath?: string; entry: string }
  | { kind: 'order.move'; orderPath?: string; entry: string; toIndex: number }
  | { kind: 'frontmatter.set'; path: string; key: string; value: string }
  | { kind: 'frontmatter.remove'; path: string; key: string };

export interface PatchPrecondition {
  kind: 'file.hash' | 'path.inside-workspace' | 'path.not-exists' | 'mode.allowed';
  path?: string;
  expectedHash?: string;
  message: string;
}

export interface DiagnosticExpectation {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
}

export interface AffectedFile {
  path: string;
  operationKinds: readonly PatchOperation['kind'][];
}

export interface PatchPlan {
  schema: 'risuai-workbench-mcp.patch-plan';
  schemaVersion: '0.2.0';
  patchPlanId: string;
  createdAt: string;
  workspaceRoot: string;
  intent: string;
  operations: readonly PatchOperation[];
  preconditions: readonly PatchPrecondition[];
  expectedDiagnostics: readonly DiagnosticExpectation[];
  preview: {
    unifiedDiff?: string;
    affectedFiles: readonly AffectedFile[];
    resourceLinks: readonly string[];
  };
  safety: {
    destructive: boolean;
    touchesSourceArtifacts: boolean;
    touchesGeneratedOnly: boolean;
  };
}

/**
 * createApplyPatchPlanInput 함수.
 * apply_patch_plan 입력을 proposal field name 그대로 보존한 값으로 고정함.
 *
 * @param input - patch plan 적용 요청 입력
 * @returns 변경 없이 정규화된 apply input
 */
export function createApplyPatchPlanInput(input: ApplyPatchPlanInput): ApplyPatchPlanInput {
  return {
    options: input.options,
    patchPlanId: input.patchPlanId,
  };
}

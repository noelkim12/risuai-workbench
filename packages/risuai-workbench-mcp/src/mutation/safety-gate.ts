/**
 * Central mutation safety gate for downstream mutating MCP handlers.
 * @file packages/risuai-workbench-mcp/src/mutation/safety-gate.ts
 */

import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath, type SafePathIntent } from '../project/safe-path';

import { evaluateConfirmationPolicy, type MutationConfirmation, type MutationRisk } from './confirmation';
import { verifyFileHashPrecondition } from './file-hash';
import type { MutationMode } from './mode';
import { isGeneratedMutationAllowedPath } from './validation-allowlist';

export interface MutationSafetyTarget {
  expectedHash?: string;
  intent: SafePathIntent;
  path: string;
}

export type MutationSafetyGateStatus = 'failed-precondition' | 'previewed' | 'rejected';

export type MutationSafetyGateResult =
  | {
      ok: true;
      status: 'previewed';
      targets: Array<{ absolutePath: string; relativePath: string }>;
    }
  | {
      ok: false;
      reason: string;
      status: MutationSafetyGateStatus;
    };

export interface EvaluateMutationSafetyGateOptions {
  confirmation?: MutationConfirmation;
  expectedConfirmationText?: string;
  mode: MutationMode;
  risk?: MutationRisk;
  targets: MutationSafetyTarget[];
  toolName: string;
  workspace: WorkspaceRootStatus;
}

/**
 * evaluateMutationSafetyGate 함수.
 * mode, path boundary, generated-only allowlist, confirmation, hash precondition을 한 곳에서 평가함.
 *
 * @param options - downstream mutating handler가 전달하는 안전성 평가 입력
 * @returns transport exception 없이 반환 가능한 mutation safety 결과
 */
export async function evaluateMutationSafetyGate(
  options: EvaluateMutationSafetyGateOptions,
): Promise<MutationSafetyGateResult> {
  void options.toolName;

  if (options.mode === 'preview-only') {
    return { ok: false, reason: 'mutation-mode-preview-only', status: 'rejected' };
  }

  const resolvedTargets: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const target of options.targets) {
    const safePath = await resolveSafeWorkspacePath({
      inputPath: target.path,
      intent: target.intent,
      workspace: options.workspace,
    });
    if (!safePath.ok) {
      return { ok: false, reason: safePath.reason, status: 'rejected' };
    }

    if (options.mode === 'generated-only' && !isGeneratedMutationAllowedPath(safePath.relativePath)) {
      return { ok: false, reason: 'generated-only-target-rejected', status: 'rejected' };
    }

    if (target.expectedHash !== undefined) {
      const hashResult = await verifyFileHashPrecondition({
        expectedHash: target.expectedHash,
        operation: target.intent === 'create-missing' ? 'create' : 'update',
        targetPath: safePath.absolutePath,
      });
      if (!hashResult.ok) {
        return { ok: false, reason: hashResult.reason, status: 'failed-precondition' };
      }
    }

    resolvedTargets.push({ absolutePath: safePath.absolutePath, relativePath: safePath.relativePath });
  }

  if (options.risk) {
    const confirmationResult = evaluateConfirmationPolicy({
      confirmation: options.confirmation,
      expectedText: options.expectedConfirmationText,
      risk: options.risk,
    });
    if (!confirmationResult.ok) {
      return { ok: false, reason: confirmationResult.reason, status: 'rejected' };
    }
  }

  return { ok: true, status: 'previewed', targets: resolvedTargets };
}

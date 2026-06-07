/**
 * Mutation target resolver for downstream mutating MCP handlers.
 * @file packages/risuai-workbench-mcp/src/mutation/safety-gate.ts
 */

import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath, type SafePathIntent } from '../project/safe-path';

import type { MutationMode } from './mode';

export interface MutationSafetyTarget {
  expectedHash?: string;
  intent: SafePathIntent;
  path: string;
}

export type MutationSafetyGateStatus = 'failed-precondition' | 'rejected' | 'resolved';
export type MutationSafetyGateFailureStatus = Exclude<MutationSafetyGateStatus, 'resolved'>;

export type MutationSafetyGateResult =
  | {
      ok: true;
      status: 'resolved';
      targets: Array<{ absolutePath: string; relativePath: string }>;
    }
  | {
      ok: false;
      reason: string;
      status: MutationSafetyGateFailureStatus;
    };

export interface EvaluateMutationSafetyGateOptions {
  mode: MutationMode;
  targets: MutationSafetyTarget[];
  toolName: string;
  workspace: WorkspaceRootStatus;
}

/**
 * evaluateMutationSafetyGate 함수.
 * mutation gate를 적용하지 않고 target path만 resolve함.
 *
 * @param options - downstream mutating handler가 전달하는 안전성 평가 입력
 * @returns transport exception 없이 반환 가능한 mutation safety 결과
 */
export async function evaluateMutationSafetyGate(
  options: EvaluateMutationSafetyGateOptions,
): Promise<MutationSafetyGateResult> {
  void options.mode;
  void options.toolName;

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

    resolvedTargets.push({ absolutePath: safePath.absolutePath, relativePath: safePath.relativePath });
  }

  return { ok: true, status: 'resolved', targets: resolvedTargets };
}

/**
 * Confirmation policy helpers for mutation risk levels.
 * @file packages/risuai-workbench-mcp/src/mutation/confirmation.ts
 */

export type MutationRisk = 'high' | 'low' | 'medium';

export interface MutationConfirmation {
  accepted?: boolean;
  confirmationText?: string;
}

export type ConfirmationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: 'confirmation-missing' | 'confirmation-text-mismatch';
    };

export interface EvaluateConfirmationPolicyOptions {
  confirmation?: MutationConfirmation;
  expectedText?: string;
  risk: MutationRisk;
}

/**
 * evaluateConfirmationPolicy 함수.
 * mutation risk에 맞는 accepted flag와 exact confirmation text를 검사함.
 *
 * @param options - 위험도와 사용자 confirmation 입력
 * @returns confirmation 통과 여부와 실패 사유
 */
export function evaluateConfirmationPolicy(options: EvaluateConfirmationPolicyOptions): ConfirmationResult {
  const { confirmation, expectedText, risk } = options;

  if (!confirmation?.accepted) {
    return { ok: false, reason: 'confirmation-missing' };
  }

  if (risk === 'high' && confirmation.confirmationText !== expectedText) {
    return { ok: false, reason: 'confirmation-text-mismatch' };
  }

  return { ok: true };
}

/**
 * In-memory patch plan store shared by preview and apply tools.
 * @file packages/risuai-workbench-mcp/src/mutation/patch-store.ts
 */

import type { PatchPlan } from '../contracts/patch-plan';

export interface PatchPlanStore {
  getPatchPlan(patchPlanId: string): PatchPlan | null;
  savePatchPlan(patchPlan: PatchPlan): void;
  findByIdeaId(ideaId: string): PatchPlan | null;
}

/**
 * InMemoryPatchPlanStore 클래스.
 * MCP server process 안에서 preview가 만든 PatchPlan을 apply 단계까지 보존함.
 */
export class InMemoryPatchPlanStore implements PatchPlanStore {
  private readonly patchPlans = new Map<string, PatchPlan>();

  /**
   * savePatchPlan 함수.
   * preview handler가 생성한 원본 PatchPlan envelope를 id 기준으로 저장함.
   *
   * @param patchPlan - 저장할 patch plan envelope
   */
  savePatchPlan(patchPlan: PatchPlan): void {
    this.patchPlans.set(patchPlan.patchPlanId, patchPlan);
  }

  /**
   * getPatchPlan 함수.
   * apply 요청이 지정한 patchPlanId와 정확히 일치하는 저장 계획을 조회함.
   *
   * @param patchPlanId - preview가 반환한 patch plan id
   * @returns 저장된 patch plan 또는 null
   */
  getPatchPlan(patchPlanId: string): PatchPlan | null {
    return this.patchPlans.get(patchPlanId) ?? null;
  }

  /**
   * findByIdeaId 함수.
   * intent에 포함된 ideaId로 저장된 PatchPlan을 찾음.
   *
   * @param ideaId - 찾을 idea id
   * @returns 매칭되는 patch plan 또는 null
   */
  findByIdeaId(ideaId: string): PatchPlan | null {
    for (const patchPlan of this.patchPlans.values()) {
      if (patchPlan.intent.includes(ideaId)) return patchPlan;
    }
    return null;
  }
}

/**
 * createPatchPlanStore 함수.
 * server/test가 공유할 최소 in-memory patch store를 생성함.
 *
 * @returns empty patch plan store
 */
export function createPatchPlanStore(): PatchPlanStore {
  return new InMemoryPatchPlanStore();
}

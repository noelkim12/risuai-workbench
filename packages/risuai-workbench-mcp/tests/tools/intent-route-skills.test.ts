/**
 * Intent route tests for authoring skill workflow recommendations.
 * @file packages/risuai-workbench-mcp/tests/tools/intent-route-skills.test.ts
 */

import { describe, expect, it } from 'vitest';

import { handleRouteIntent } from '../../src/tools/intent-route';

describe('handleRouteIntent authoring skills', () => {
  it('recommends authoring skill actions for new RisuAI system design requests', async () => {
    const result = await handleRouteIntent({
      request: 'Help me design a new RisuAI module with Lua, Regex, Lorebook, HTML, and variables.',
    });

    const route = result.data!.route;
    expect(route.recommendedActions).toContain('skills.recommend');
    expect(route.recommendedTools).toEqual(expect.arrayContaining([
      'workbench.catalog',
      'workbench.prepare_action',
      'workbench.run_action',
    ]));
    expect(route.nextStep).toBe('read_resource');
    expect(route.routingSignals).toEqual(expect.arrayContaining(['authoring_skill_candidate', 'approval_required']));
    expect(route.commitAllowed).toBe(false);
    expect(route.blockedTools).toContain('workbench.apply_patch_plan');
  });

  it('does not recommend skill actions for pure validation requests', async () => {
    const result = await handleRouteIntent({
      request: 'Validate this lorebook file',
      target: 'characters/merry/lorebooks/intro.risulorebook',
    });

    const route = result.data!.route;
    expect(route.intent).toBe('artifact.validate');
    expect(route.recommendedActions).not.toContain('skills.recommend');
    expect(route.recommendedTools).not.toContain('workbench.recommend_skills');
  });
});

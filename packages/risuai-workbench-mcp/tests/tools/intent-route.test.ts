/**
 * Tests for the deterministic intent route classifier.
 * @file packages/risuai-workbench-mcp/tests/tools/intent-route.test.ts
 */

import { describe, expect, it } from 'vitest';

import type {
  IntentRouteInput,
  IntentRouteResult,
  RouteMutationMode,
  RouteNextStep,
  RouteRisk,
  RouteStopCondition,
  WorkbenchIntent,
} from '../../src/contracts/intent-route';
import { handleRouteIntent } from '../../src/tools/intent-route';
import { WORKBENCH_REGISTRY } from '../../src/registry';

const ALL_IMPLEMENTED_TOOL_NAMES = WORKBENCH_REGISTRY.tools
  .filter((t) => t.implementationStatus === 'implemented')
  .map((t) => t.name);

function isImplementedTool(name: string): boolean {
  return ALL_IMPLEMENTED_TOOL_NAMES.includes(name);
}

describe('handleRouteIntent', () => {
  describe('read-only', () => {
    it('routes explicit no-write language to read-only with blocked mutations', async () => {
      const result = await handleRouteIntent({
        request: "Inspect the character card but do not modify anything",
        target: "characters/merry",
      });

      expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(result.tool).toBe('workbench.route_intent');
      expect(result.status).toBe('ok');
      expect(result.data).toBeDefined();

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.inspect');
      expect(route.risk).toBe('read_only');
      expect(route.commitAllowed).toBe(false);
      expect(route.mutationRequested).toBe(false);
      expect(route.stopConditions).toContain('mutation_tool_blocked');

      // All blocked tools must be mutation tools
      for (const blocked of route.blockedTools) {
        const tool = WORKBENCH_REGISTRY.tools.find((t) => t.name === blocked);
        expect(tool).toBeDefined();
        expect(tool!.mutates).toBe(true);
      }

      // All allowed tools must be non-mutating
      for (const allowed of route.allowedTools) {
        const tool = WORKBENCH_REGISTRY.tools.find((t) => t.name === allowed);
        expect(tool).toBeDefined();
        expect(tool!.mutates).toBe(false);
      }
    });

    it('blocks mutations for Korean no-write language', async () => {
      const result = await handleRouteIntent({
        request: "캐릭터 카드를 검사하고 수정하지 마세요",
      });

      const route = result.data!.route;
      expect(route.risk).toBe('read_only');
      expect(route.commitAllowed).toBe(false);
      expect(route.blockedTools.length).toBeGreaterThan(0);
    });

    it('allows read-only evidence tools for read-only route', async () => {
      const result = await handleRouteIntent({
        request: "Read only review of the lorebook",
        target: "characters/merry/lorebooks/intro.risulorebook",
      });

      const route = result.data!.route;
      expect(route.allowedTools).toContain('workbench.inspect_path');
      expect(route.allowedTools).toContain('workbench.validate_artifact');
      expect(route.blockedTools).toContain('workbench.apply_patch_plan');
      expect(route.blockedTools).toContain('workbench.edit_order');
    });
  });

  describe('mixed', () => {
    it('routes mixed read/write to preview with stop conditions', async () => {
      const result = await handleRouteIntent({
        request: "Inspect the path and fix any validation errors",
        target: "characters/merry",
      });

      expect(result.status).toBe('ok');
      const route = result.data!.route;

      // Should be a preview route because mutation language is present
      expect(route.intent).toBe('artifact.patch.preview');
      expect(route.mutationRequested).toBe(true);
      expect(route.commitAllowed).toBe(false);
      expect(route.risk).toBe('preview_only');

      // Must include preview_required and confirmation_required
      expect(route.stopConditions).toContain('preview_required');
      expect(route.stopConditions).toContain('confirmation_required');

      // Read-only evidence tools allowed
      expect(route.allowedTools).toContain('workbench.inspect_path');
      expect(route.allowedTools).toContain('workbench.validate_artifact');
      expect(route.allowedTools).toContain('workbench.suggest_patch');

      // Mutation tools blocked
      expect(route.blockedTools).toContain('workbench.apply_patch_plan');
      expect(route.blockedTools).toContain('workbench.edit_order');
    });

    it('routes edit request without preview evidence to frontmatter preview', async () => {
      const result = await handleRouteIntent({
        request: "Edit the frontmatter of the character card",
        target: "characters/merry/character.risuchar",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.frontmatter.preview');
      expect(route.stopConditions).toContain('preview_required');
      expect(route.commitAllowed).toBe(false);
    });
  });

  describe('mixed request guidance', () => {
    it('keeps read-only override authoritative for inspect plus fix language', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the lorebook and fix errors but do not modify anything',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.risk).toBe('read_only');
      expect(route.commitAllowed).toBe(false);
      expect(route.blockedTools).toContain('workbench.apply_patch_plan');
      expect(route.routingSignals).toContain('constraint:no_write');
      expect(route.recommendedTools).toContain('workbench.inspect_path');
    });

    it('routes fix frontmatter to frontmatter preview rather than generic patch preview', async () => {
      const result = await handleRouteIntent({
        request: 'Fix the frontmatter condition',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.frontmatter.preview');
      expect(route.nextStep).toBe('preview');
      expect(route.commitAllowed).toBe(false);
      expect(route.recommendedTools).toEqual(expect.arrayContaining([
        'workbench.inspect_path',
        'workbench.validate_frontmatter',
        'workbench.suggest_frontmatter_patch',
      ]));
      expect(route.blockedTools).toContain('workbench.edit_frontmatter');
    });

    it('recommends inspect and validate tools before preview for mixed read plus fix language', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect and fix the character card',
        target: 'characters/merry/character.risuchar',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.patch.preview');
      expect(route.commitAllowed).toBe(false);
      expect(route.recommendedTools).toEqual(expect.arrayContaining([
        'workbench.inspect_path',
        'workbench.validate_path',
        'workbench.suggest_patch',
      ]));
      expect(route.routingSignals).toEqual(expect.arrayContaining([
        'inspect',
        'mutation',
        'preview_required',
      ]));
    });
  });

  describe('empty/ambiguous', () => {
    it('routes empty request to unknown with missing_request stop', async () => {
      const result = await handleRouteIntent({
        request: "",
      });

      expect(result.status).toBe('ok');
      const route = result.data!.route;
      expect(route.intent).toBe('unknown');
      expect(route.nextStep).toBe('clarify');
      expect(route.confidence).toBe(0.0);
      expect(route.commitAllowed).toBe(false);
      expect(route.stopConditions).toContain('missing_request');
      expect(route.missingInputs).toContain('request');
    });

    it('routes whitespace-only request as empty', async () => {
      const result = await handleRouteIntent({
        request: "   ",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('unknown');
      expect(route.nextStep).toBe('clarify');
      expect(route.stopConditions).toContain('missing_request');
    });

    it('routes ambiguous request to unknown with low confidence', async () => {
      const result = await handleRouteIntent({
        request: "hello",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('unknown');
      expect(route.nextStep).toBe('clarify');
      expect(route.confidence).toBeLessThan(0.5);
      expect(route.stopConditions).toContain('route_low_confidence');
    });
  });

  describe('registry consistency', () => {
    it('only includes implemented registry tool names in allowedTools', async () => {
      const result = await handleRouteIntent({
        request: "Inspect and validate the workspace",
        target: "characters/merry",
      });

      const route = result.data!.route;
      for (const name of route.allowedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
    });

    it('only includes implemented registry tool names in blockedTools', async () => {
      const result = await handleRouteIntent({
        request: "Fix the character card",
        target: "characters/merry",
      });

      const route = result.data!.route;
      for (const name of route.blockedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
    });

    it('has no overlap between allowedTools and blockedTools', async () => {
      const result = await handleRouteIntent({
        request: "Inspect and delete the old file",
        target: "characters/merry",
      });

      const route = result.data!.route;
      const allowedSet = new Set(route.allowedTools);
      for (const blocked of route.blockedTools) {
        expect(allowedSet.has(blocked)).toBe(false);
      }
    });

    it('only includes implemented registry tools in recommendedTools and discouragedTools', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the lorebook frontmatter and suggest a patch',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      for (const name of route.recommendedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
      for (const name of route.discouragedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
    });

    it('keeps recommendedTools out of discouragedTools and blockedTools', async () => {
      const result = await handleRouteIntent({
        request: 'Fix the lorebook frontmatter',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      for (const name of route.recommendedTools) {
        expect(route.discouragedTools).not.toContain(name);
        expect(route.blockedTools).not.toContain(name);
      }
    });

    it('keeps discouragedTools out of blockedTools', async () => {
      const result = await handleRouteIntent({
        request: 'Fix the lorebook frontmatter',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      for (const name of route.discouragedTools) {
        expect(route.blockedTools).not.toContain(name);
      }
    });

    it('keeps recommendedTools short enough to avoid tool-choice noise', async () => {
      const result = await handleRouteIntent({
        request: 'Analyze risulua handler, prompt chain, CBS condition, lorebook frontmatter, and suggest a patch',
        target: 'modules/demo/lua/main.risulua',
      });

      expect(result.data!.route.recommendedTools.length).toBeLessThanOrEqual(7);
    });
  });

  describe('deterministic routeId', () => {
    it('returns the same routeId for identical input', async () => {
      const input = {
        request: "Inspect the lorebook",
        target: "characters/merry/lorebooks",
      };

      const result1 = await handleRouteIntent(input);
      const result2 = await handleRouteIntent(input);

      expect(result1.data!.route.routeId).toBe(result2.data!.route.routeId);
    });

    it('returns different routeId for different request text', async () => {
      const result1 = await handleRouteIntent({ request: "Inspect the lorebook" });
      const result2 = await handleRouteIntent({ request: "Validate the lorebook" });

      expect(result1.data!.route.routeId).not.toBe(result2.data!.route.routeId);
    });

    it('returns different routeId for different target', async () => {
      const result1 = await handleRouteIntent({
        request: "Inspect the path",
        target: "characters/merry",
      });
      const result2 = await handleRouteIntent({
        request: "Inspect the path",
        target: "modules/mymod",
      });

      expect(result1.data!.route.routeId).not.toBe(result2.data!.route.routeId);
    });

    it('formats routeId as route_{shortHash}', async () => {
      const result = await handleRouteIntent({
        request: "Inspect the workspace",
      });

      const routeId = result.data!.route.routeId;
      expect(routeId).toMatch(/^route_[a-f0-9]{8}$/);
    });
  });

  describe('priority rules', () => {
    it('rule 3: patchPlanId + apply language → artifact.patch.apply', async () => {
      const result = await handleRouteIntent({
        request: "Apply the patch plan",
        patchPlanId: "plan-123",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.patch.apply');
      expect(route.targetKind).toBe('patch_plan');
    });

    it('rule 3: patchPlanId without userConfirmed → confirm next step', async () => {
      const result = await handleRouteIntent({
        request: "Apply the patch plan",
        patchPlanId: "plan-123",
      });

      const route = result.data!.route;
      expect(route.nextStep).toBe('confirm');
      expect(route.commitAllowed).toBe(false);
      expect(route.stopConditions).toContain('confirmation_required');
    });

    it('rule 3: patchPlanId with userConfirmed → apply next step', async () => {
      const result = await handleRouteIntent({
        request: "Apply the patch plan",
        patchPlanId: "plan-123",
        userConfirmed: true,
      });

      const route = result.data!.route;
      expect(route.nextStep).toBe('apply');
      expect(route.commitAllowed).toBe(true);
      expect(route.stopConditions).not.toContain('confirmation_required');
    });

    it('rule 4: ideaId + apply language → creative.apply_patch', async () => {
      const result = await handleRouteIntent({
        request: "Apply the idea",
        ideaId: "idea-456",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('creative.apply_patch');
      expect(route.targetKind).toBe('idea');
    });

    it('rule 5: ideaId + preview language → creative.idea_to_patch', async () => {
      const result = await handleRouteIntent({
        request: "Preview the idea patch",
        ideaId: "idea-456",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('creative.idea_to_patch');
      expect(route.nextStep).toBe('preview');
    });

    it('rule 6: variable flow language → analyze.variable_flow', async () => {
      const result = await handleRouteIntent({
        request: "Show me the variable flow",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('analyze.variable_flow');
      expect(route.targetKind).toBe('variable');
    });

    it('rule 7: lua language → analyze.lua_handler', async () => {
      const result = await handleRouteIntent({
        request: "Analyze the lua handler call graph",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('analyze.lua_handler');
      expect(route.targetKind).toBe('lua_handler');
    });

    it('rule 8: order language → artifact.order.preview', async () => {
      const result = await handleRouteIntent({
        request: "Reorder the lorebook entries",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.order.preview');
      expect(route.stopConditions).toContain('preview_required');
    });

    it('rule 9: frontmatter language → artifact.frontmatter.preview', async () => {
      const result = await handleRouteIntent({
        request: "Update the frontmatter fields",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.frontmatter.preview');
      expect(route.stopConditions).toContain('preview_required');
    });

    it('rule 10: wiki language → wiki.refresh.preview', async () => {
      const result = await handleRouteIntent({
        request: "Refresh the wiki",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('wiki.refresh.preview');
      expect(route.stopConditions).toContain('preview_required');
    });

    it('rule 11: docs language without mutation → docs.update', async () => {
      const result = await handleRouteIntent({
        request: "Update the documentation",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('docs.update');
      expect(route.targetKind).toBe('documentation');
    });

    it('rule 12: target + validate language → artifact.validate', async () => {
      const result = await handleRouteIntent({
        request: "Validate this path",
        target: "characters/merry",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.validate');
      expect(route.nextStep).toBe('validate');
    });

    it('rule 13: target + inspect language → artifact.inspect', async () => {
      const result = await handleRouteIntent({
        request: "Inspect this artifact",
        target: "characters/merry",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.inspect');
      expect(route.nextStep).toBe('inspect');
    });
  });

  describe('golden route matrix', () => {
      interface GoldenCase {
      name: string;
      input: IntentRouteInput;
      expectedIntent?: WorkbenchIntent;
      expectedNextStep?: RouteNextStep;
      expectedRisk?: RouteRisk;
      expectedTargetKind?: string;
      expectedCommitAllowed?: boolean;
      expectedMutationRequested?: boolean;
      expectedStopConditions?: RouteStopCondition[];
      expectedMissingInputs?: string[];
      expectedAllowedTools?: string[];
      expectedBlockedTools?: string[];
      expectedNotAllowedTools?: string[];
      expectedNotBlockedTools?: string[];
      expectedExplanation?: string;
      recommendedIncludes?: readonly string[];
      discouragedIncludes?: readonly string[];
      domainTagsInclude?: readonly string[];
      routingSignalsInclude?: readonly string[];
      expectedMutationMode?: RouteMutationMode;
    }

    const cases: GoldenCase[] = [
      {
        name: 'empty request → unknown, clarify, missing request, commit false',
        input: { request: '' },
        expectedIntent: 'unknown',
        expectedNextStep: 'clarify',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedStopConditions: ['missing_request'],
        expectedMissingInputs: ['request'],
      },
      {
        name: 'read-only inspect without modifying → read-only, mutation false, mutation tools blocked',
        input: {
          request: 'Inspect the character card but do not modify anything',
          target: 'characters/merry',
        },
        expectedIntent: 'artifact.inspect',
        expectedRisk: 'read_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedStopConditions: ['mutation_tool_blocked'],
        expectedBlockedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
      },
      {
        name: 'Korean frontmatter request → artifact.frontmatter.preview, inspect/validate allowed, commit/edit blocked',
        input: { request: '프론트매터를 업데이트해주세요' },
        expectedIntent: 'artifact.frontmatter.preview',
        expectedRisk: 'preview_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedStopConditions: ['preview_required'],
        expectedAllowedTools: ['workbench.inspect_path', 'workbench.validate_artifact'],
        expectedBlockedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
      },
      {
        name: 'apply preview without confirmation → artifact.patch.apply, confirm, commit false, confirmation_required',
        input: { request: 'Apply the patch plan', patchPlanId: 'plan-123' },
        expectedIntent: 'artifact.patch.apply',
        expectedNextStep: 'confirm',
        expectedCommitAllowed: false,
        expectedMutationRequested: true,
        expectedStopConditions: ['confirmation_required'],
      },
      {
        name: 'apply preview with userConfirmed and patchPlanId → artifact.patch.apply, apply, commit true',
        input: { request: 'Apply the patch plan', patchPlanId: 'plan-123', userConfirmed: true },
        expectedIntent: 'artifact.patch.apply',
        expectedNextStep: 'apply',
        expectedCommitAllowed: true,
        expectedMutationRequested: true,
        expectedStopConditions: [],
        expectedExplanation: 'Patch plan plan-123 ready for apply. The mutation safety gate remains authoritative.',
      },
      {
        name: 'variable flow request → analyze.variable_flow, mutation blocked',
        input: { request: 'Show me the variable flow' },
        expectedIntent: 'analyze.variable_flow',
        expectedRisk: 'read_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedBlockedTools: ['workbench.apply_patch_plan'],
      },
      {
        name: 'Lua handler call graph request → analyze.lua_handler',
        input: { request: 'Analyze the lua handler call graph' },
        expectedIntent: 'analyze.lua_handler',
        expectedRisk: 'read_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedBlockedTools: ['workbench.apply_patch_plan'],
      },
      {
        name: 'selected idea to patch → creative.idea_to_patch, creative apply blocked',
        input: { request: 'Preview the idea patch', ideaId: 'idea-456' },
        expectedIntent: 'creative.idea_to_patch',
        expectedNextStep: 'preview',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedStopConditions: ['preview_required'],
        expectedBlockedTools: ['workbench.creative.apply_idea_patch'],
      },
      {
        name: 'creative apply without confirmation → creative.apply_patch, confirm, commit false',
        input: { request: 'Apply the idea', ideaId: 'idea-456' },
        expectedIntent: 'creative.apply_patch',
        expectedNextStep: 'confirm',
        expectedCommitAllowed: false,
        expectedMutationRequested: true,
        expectedStopConditions: ['confirmation_required'],
      },
      {
        name: 'mixed review/fix → read-only tools allowed, mutation blocked, preview_required and confirmation_required',
        input: {
          request: 'Inspect the path and fix any validation errors',
          target: 'characters/merry',
        },
        expectedIntent: 'artifact.patch.preview',
        expectedRisk: 'preview_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: true,
        expectedStopConditions: ['preview_required', 'confirmation_required'],
        expectedAllowedTools: ['workbench.inspect_path', 'workbench.validate_artifact'],
        expectedBlockedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
      },
      {
        name: 'docs-only Korean request → docs.update, no mutation allowance',
        input: { request: '문서를 업데이트해주세요' },
        expectedIntent: 'docs.update',
        expectedRisk: 'read_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: false,
        expectedNotAllowedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
      },
      {
        name: 'direct request to call workbench.apply_patch_plan without evidence → mutation requested, apply blocked, commit false',
        input: { request: 'Call workbench.apply_patch_plan' },
        expectedIntent: 'artifact.patch.preview',
        expectedRisk: 'preview_only',
        expectedCommitAllowed: false,
        expectedMutationRequested: true,
        expectedStopConditions: ['preview_required', 'confirmation_required'],
        expectedBlockedTools: ['workbench.apply_patch_plan'],
      },
      {
        name: 'RisuLua analysis path recommends Lua analysis tools',
        input: {
          request: 'Analyze risulua handler call graph',
          target: 'modules/demo/lua/main.risulua',
        },
        expectedIntent: 'analyze.lua_handler',
        expectedNextStep: 'analyze',
        expectedRisk: 'read_only',
        expectedTargetKind: 'lua_handler',
        expectedMutationRequested: false,
        expectedCommitAllowed: false,
        recommendedIncludes: ['workbench.query_lua_analysis', 'workbench.query_lua_call_graph'],
        domainTagsInclude: ['risulua'],
        routingSignalsInclude: ['analyze'],
      },
      {
        name: 'Lorebook frontmatter mutation routes to specific frontmatter preview (classifier: fix wording yields mutationRequested false)',
        input: {
          request: 'Fix lorebook frontmatter condition',
          target: 'characters/merry/lorebooks/intro.risulorebook',
        },
        expectedIntent: 'artifact.frontmatter.preview',
        expectedNextStep: 'preview',
        expectedRisk: 'preview_only',
        expectedTargetKind: 'artifact_root',
        expectedMutationRequested: false,
        expectedCommitAllowed: false,
        expectedStopConditions: ['preview_required', 'confirmation_required'],
        recommendedIncludes: ['workbench.inspect_path', 'workbench.validate_frontmatter', 'workbench.suggest_frontmatter_patch'],
        domainTagsInclude: ['lorebook', 'frontmatter'],
        routingSignalsInclude: ['preview', 'frontmatter'],
      },
      {
        name: 'Mixed analyze and fix request routes to lua analysis (classifier: analyze keyword takes precedence over fix)',
        input: {
          request: 'Analyze the risulua state access and fix issues',
          target: 'modules/demo/lua/main.risulua',
        },
        expectedIntent: 'analyze.lua_handler',
        expectedNextStep: 'analyze',
        expectedRisk: 'read_only',
        expectedTargetKind: 'lua_handler',
        expectedMutationRequested: false,
        expectedCommitAllowed: false,
        expectedStopConditions: ['preview_required', 'confirmation_required'],
        recommendedIncludes: ['workbench.explain_risulua_runtime_api', 'workbench.explain_risulua_workspace', 'workbench.query_lua_analysis', 'workbench.query_lua_call_graph', 'workbench.query_lua_state_access'],
        domainTagsInclude: ['risulua'],
        routingSignalsInclude: ['analyze', 'lua', 'domain:risulua', 'mutation_without_confirmation'],
      },
      {
        name: 'Explicit frontmatter set uses guarded direct mutation guidance',
        input: {
          request: 'Set frontmatter key enabled to false',
          target: 'characters/merry/lorebooks/intro.risulorebook',
        },
        expectedIntent: 'artifact.frontmatter.preview',
        expectedNextStep: 'apply',
        expectedRisk: 'write_modify',
        expectedTargetKind: 'path',
        expectedMutationRequested: true,
        expectedCommitAllowed: false,
        expectedMutationMode: 'guarded_direct',
        recommendedIncludes: ['workbench.edit_frontmatter'],
        domainTagsInclude: ['lorebook', 'frontmatter'],
        routingSignalsInclude: ['direct_structured_edit'],
      },
      {
        name: 'Ambiguous frontmatter fix remains preview required (classifier: fix wording yields mutationRequested false)',
        input: {
          request: 'Fix the lorebook frontmatter condition',
          target: 'characters/merry/lorebooks/intro.risulorebook',
        },
        expectedIntent: 'artifact.frontmatter.preview',
        expectedNextStep: 'preview',
        expectedRisk: 'preview_only',
        expectedTargetKind: 'artifact_root',
        expectedMutationRequested: false,
        expectedCommitAllowed: false,
        expectedMutationMode: 'preview_required',
        recommendedIncludes: ['workbench.inspect_path', 'workbench.suggest_frontmatter_patch', 'workbench.validate_frontmatter'],
        domainTagsInclude: ['lorebook', 'frontmatter'],
        routingSignalsInclude: ['preview', 'frontmatter'],
      },
    ];

    function assertBaseEnvelope(result: Awaited<ReturnType<typeof handleRouteIntent>>) {
      expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
      expect(result.tool).toBe('workbench.route_intent');
      expect(result.status).toBe('ok');
      expect(result.data).toBeDefined();
    }

    function assertRegistryConsistent(route: IntentRouteResult) {
      for (const name of route.allowedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
      for (const name of route.blockedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
      for (const name of route.recommendedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
      for (const name of route.discouragedTools) {
        expect(isImplementedTool(name)).toBe(true);
      }
      const allowedSet = new Set(route.allowedTools);
      for (const blocked of route.blockedTools) {
        expect(allowedSet.has(blocked)).toBe(false);
      }
    }

    it.each(cases)('$name', async (testCase) => {
      const result = await handleRouteIntent(testCase.input);
      assertBaseEnvelope(result);

      const route = result.data!.route;

      if (testCase.expectedIntent !== undefined) {
        expect(route.intent).toBe(testCase.expectedIntent);
      }
      if (testCase.expectedNextStep !== undefined) {
        expect(route.nextStep).toBe(testCase.expectedNextStep);
      }
      if (testCase.expectedRisk !== undefined) {
        expect(route.risk).toBe(testCase.expectedRisk);
      }
      if (testCase.expectedTargetKind !== undefined) {
        expect(route.targetKind).toBe(testCase.expectedTargetKind);
      }
      if (testCase.expectedCommitAllowed !== undefined) {
        expect(route.commitAllowed).toBe(testCase.expectedCommitAllowed);
      }
      if (testCase.expectedMutationRequested !== undefined) {
        expect(route.mutationRequested).toBe(testCase.expectedMutationRequested);
      }
      if (testCase.expectedStopConditions !== undefined) {
        for (const condition of testCase.expectedStopConditions) {
          expect(route.stopConditions).toContain(condition);
        }
      }
      if (testCase.expectedMissingInputs !== undefined) {
        for (const inputName of testCase.expectedMissingInputs) {
          expect(route.missingInputs).toContain(inputName);
        }
      }
      if (testCase.expectedAllowedTools !== undefined) {
        for (const toolName of testCase.expectedAllowedTools) {
          expect(route.allowedTools).toContain(toolName);
        }
      }
      if (testCase.expectedBlockedTools !== undefined) {
        for (const toolName of testCase.expectedBlockedTools) {
          expect(route.blockedTools).toContain(toolName);
        }
      }
      if (testCase.expectedNotAllowedTools !== undefined) {
        for (const toolName of testCase.expectedNotAllowedTools) {
          expect(route.allowedTools).not.toContain(toolName);
        }
      }
      if (testCase.expectedNotBlockedTools !== undefined) {
        for (const toolName of testCase.expectedNotBlockedTools) {
          expect(route.blockedTools).not.toContain(toolName);
        }
      }
      if (testCase.expectedExplanation !== undefined) {
        expect(route.explanation).toBe(testCase.expectedExplanation);
      }
      for (const name of testCase.recommendedIncludes ?? []) {
        expect(route.recommendedTools).toContain(name);
      }
      for (const name of testCase.discouragedIncludes ?? []) {
        expect(route.discouragedTools).toContain(name);
      }
      for (const tag of testCase.domainTagsInclude ?? []) {
        expect(route.domainTags).toContain(tag);
      }
      for (const signal of testCase.routingSignalsInclude ?? []) {
        expect(route.routingSignals).toContain(signal);
      }
      if (testCase.expectedMutationMode) {
        expect(route.mutationMode).toBe(testCase.expectedMutationMode);
      }

      // Case 13: every allowedTools / blockedTools value exists in registry and is implemented
      assertRegistryConsistent(route);
    });

    it('has deterministic routeIds across all golden cases', async () => {
      const results = await Promise.all(cases.map((c) => handleRouteIntent(c.input)));
      const routeIds = results.map((r) => r.data!.route.routeId);
      const uniqueRouteIds = new Set(routeIds);
      expect(uniqueRouteIds.size).toBe(routeIds.length);
      for (const routeId of routeIds) {
        expect(routeId).toMatch(/^route_[a-f0-9]{8}$/);
      }
    });
  });

  describe('direct mutation posture guidance', () => {
    it('allows guarded direct frontmatter edit for explicit field/value requests', async () => {
      const result = await handleRouteIntent({
        request: 'Set frontmatter key enabled to false',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.frontmatter.preview');
      expect(route.mutationMode).toBe('guarded_direct');
      expect(route.mutationRequested).toBe(true);
      expect(route.recommendedTools).toContain('workbench.edit_frontmatter');
      expect(route.blockedTools).not.toContain('workbench.edit_frontmatter');
      expect(route.routingSignals).toEqual(expect.arrayContaining([
        'mutation',
        'direct_structured_edit',
        'frontmatter',
      ]));
    });

    it('keeps ambiguous frontmatter fix on preview path', async () => {
      const result = await handleRouteIntent({
        request: 'Fix the frontmatter condition',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.mutationMode).toBe('preview_required');
      expect(route.recommendedTools).toContain('workbench.suggest_frontmatter_patch');
      expect(route.blockedTools).toContain('workbench.edit_frontmatter');
    });

    it('allows guarded direct order edit only for explicit structured order operations', async () => {
      const result = await handleRouteIntent({
        request: 'Move entry intro before entry prologue in _order.json',
        target: 'characters/merry/lorebooks/_order.json',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.order.preview');
      expect(route.mutationMode).toBe('guarded_direct');
      expect(route.recommendedTools).toContain('workbench.edit_order');
      expect(route.blockedTools).not.toContain('workbench.edit_order');
    });

    it('no-write constraint still blocks direct mutation tools', async () => {
      const result = await handleRouteIntent({
        request: 'Set frontmatter key enabled to false but do not modify anything',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.mutationMode).toBe('blocked');
      expect(route.risk).toBe('read_only');
      expect(route.recommendedTools).not.toContain('workbench.edit_frontmatter');
      expect(route.blockedTools).toContain('workbench.edit_frontmatter');
    });
  });

  describe('RisuAI domain keyword and path detection', () => {
    it('detects lorebook and frontmatter tags from a .risulorebook target', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the lorebook frontmatter',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.inspect');
      expect(route.domainTags).toEqual(expect.arrayContaining(['lorebook', 'frontmatter']));
      expect(route.recommendedTools).toContain('workbench.inspect_path');
      expect(route.recommendedTools).toContain('workbench.validate_frontmatter');
    });

    it('detects RisuLua handler analysis from risulua request text', async () => {
      const result = await handleRouteIntent({
        request: 'Analyze the risulua handler lifecycle',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('analyze.lua_handler');
      expect(route.domainTags).toContain('risulua');
      expect(route.recommendedTools).toEqual(expect.arrayContaining([
        'workbench.query_lua_analysis',
        'workbench.query_lua_call_graph',
      ]));
    });

    it('detects character card path without enabling mutation', async () => {
      const result = await handleRouteIntent({
        request: 'Validate the character card',
        target: 'characters/merry/character.risuchar',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.validate');
      expect(route.domainTags).toEqual(expect.arrayContaining(['character']));
      expect(route.commitAllowed).toBe(false);
      expect(route.blockedTools).toContain('workbench.apply_patch_plan');
    });

    it('detects order path from _order.json target', async () => {
      const result = await handleRouteIntent({
        request: 'Preview the order change',
        target: 'characters/merry/lorebooks/_order.json',
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.order.preview');
      expect(route.domainTags).toEqual(expect.arrayContaining(['order', 'lorebook']));
      expect(route.recommendedTools).toContain('workbench.validate_order');
      expect(route.recommendedTools).toContain('workbench.suggest_order_patch');
    });
  });

  describe('route state invariants', () => {
    it('uses mutationMode none for read-only inspect routes', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the lorebook without changing anything',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.mutationMode).toBe('none');
      expect(route.mutationRequested).toBe(false);
      expect(route.commitAllowed).toBe(false);
    });

    it('blocks mutation recommendations when no-write constraints are present', async () => {
      const result = await handleRouteIntent({
        request: 'Set frontmatter key enabled to false but do not modify anything',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.mutationMode).toBe('blocked');
      expect(route.commitAllowed).toBe(false);
      for (const name of route.recommendedTools) {
        const tool = WORKBENCH_REGISTRY.tools.find((entry) => entry.name === name);
        expect(tool?.mutates).toBe(false);
      }
    });

    it('keeps tool guidance lists disjoint after precedence is applied', async () => {
      const result = await handleRouteIntent({
        request: 'Fix the lorebook frontmatter condition',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      for (const name of route.recommendedTools) {
        expect(route.blockedTools).not.toContain(name);
        expect(route.discouragedTools).not.toContain(name);
      }
      for (const name of route.discouragedTools) {
        expect(route.blockedTools).not.toContain(name);
      }
    });

    it('keeps recommendedTools capped at seven entries', async () => {
      const result = await handleRouteIntent({
        request: 'Analyze risulua handler, prompt chain, CBS condition, lorebook frontmatter, and suggest a patch',
        target: 'modules/demo/lua/main.risulua',
      });

      expect(result.data!.route.recommendedTools.length).toBeLessThanOrEqual(7);
    });

    it('keeps ambiguous mutation requests on preview_required posture', async () => {
      const result = await handleRouteIntent({
        request: 'Clean up and fix the whole lorebook',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.mutationMode).toBe('preview_required');
      expect(route.commitAllowed).toBe(false);
      expect(route.recommendedTools).toContain('workbench.suggest_patch');
    });
  });
});

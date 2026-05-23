/**
 * Tests for the deterministic intent route classifier.
 * @file packages/risuai-workbench-mcp/tests/tools/intent-route.test.ts
 */

import { describe, expect, it } from 'vitest';

import type {
  IntentRouteInput,
  IntentRouteResult,
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

    it('routes edit request without preview evidence to preview_required', async () => {
      const result = await handleRouteIntent({
        request: "Edit the frontmatter of the character card",
        target: "characters/merry/character.risuchar",
      });

      const route = result.data!.route;
      expect(route.intent).toBe('artifact.patch.preview');
      expect(route.stopConditions).toContain('preview_required');
      expect(route.stopConditions).toContain('confirmation_required');
      expect(route.commitAllowed).toBe(false);
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
      expected: {
        intent?: WorkbenchIntent;
        nextStep?: RouteNextStep;
        risk?: RouteRisk;
        commitAllowed?: boolean;
        mutationRequested?: boolean;
        stopConditions?: RouteStopCondition[];
        missingInputs?: string[];
        allowedTools?: string[];
        blockedTools?: string[];
        notAllowedTools?: string[];
        notBlockedTools?: string[];
        explanation?: string;
      };
    }

    const cases: GoldenCase[] = [
      {
        name: 'empty request → unknown, clarify, missing request, commit false',
        input: { request: '' },
        expected: {
          intent: 'unknown',
          nextStep: 'clarify',
          commitAllowed: false,
          mutationRequested: false,
          stopConditions: ['missing_request'],
          missingInputs: ['request'],
        },
      },
      {
        name: 'read-only inspect without modifying → read-only, mutation false, mutation tools blocked',
        input: {
          request: 'Inspect the character card but do not modify anything',
          target: 'characters/merry',
        },
        expected: {
          intent: 'artifact.inspect',
          risk: 'read_only',
          commitAllowed: false,
          mutationRequested: false,
          stopConditions: ['mutation_tool_blocked'],
          blockedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
        },
      },
      {
        name: 'Korean frontmatter request → artifact.frontmatter.preview, inspect/validate allowed, commit/edit blocked',
        input: { request: '프론트매터를 업데이트해주세요' },
        expected: {
          intent: 'artifact.frontmatter.preview',
          risk: 'preview_only',
          commitAllowed: false,
          mutationRequested: false,
          stopConditions: ['preview_required'],
          allowedTools: ['workbench.inspect_path', 'workbench.validate_artifact'],
          blockedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
        },
      },
      {
        name: 'apply preview without confirmation → artifact.patch.apply, confirm, commit false, confirmation_required',
        input: { request: 'Apply the patch plan', patchPlanId: 'plan-123' },
        expected: {
          intent: 'artifact.patch.apply',
          nextStep: 'confirm',
          commitAllowed: false,
          mutationRequested: true,
          stopConditions: ['confirmation_required'],
        },
      },
      {
        name: 'apply preview with userConfirmed and patchPlanId → artifact.patch.apply, apply, commit true',
        input: { request: 'Apply the patch plan', patchPlanId: 'plan-123', userConfirmed: true },
        expected: {
          intent: 'artifact.patch.apply',
          nextStep: 'apply',
          commitAllowed: true,
          mutationRequested: true,
          stopConditions: [],
          explanation: 'Patch plan plan-123 ready for apply. The mutation safety gate remains authoritative.',
        },
      },
      {
        name: 'variable flow request → analyze.variable_flow, mutation blocked',
        input: { request: 'Show me the variable flow' },
        expected: {
          intent: 'analyze.variable_flow',
          risk: 'read_only',
          commitAllowed: false,
          mutationRequested: false,
          blockedTools: ['workbench.apply_patch_plan'],
        },
      },
      {
        name: 'Lua handler call graph request → analyze.lua_handler',
        input: { request: 'Analyze the lua handler call graph' },
        expected: {
          intent: 'analyze.lua_handler',
          risk: 'read_only',
          commitAllowed: false,
          mutationRequested: false,
          blockedTools: ['workbench.apply_patch_plan'],
        },
      },
      {
        name: 'selected idea to patch → creative.idea_to_patch, creative apply blocked',
        input: { request: 'Preview the idea patch', ideaId: 'idea-456' },
        expected: {
          intent: 'creative.idea_to_patch',
          nextStep: 'preview',
          commitAllowed: false,
          mutationRequested: false,
          stopConditions: ['preview_required'],
          blockedTools: ['workbench.creative.apply_idea_patch'],
        },
      },
      {
        name: 'creative apply without confirmation → creative.apply_patch, confirm, commit false',
        input: { request: 'Apply the idea', ideaId: 'idea-456' },
        expected: {
          intent: 'creative.apply_patch',
          nextStep: 'confirm',
          commitAllowed: false,
          mutationRequested: true,
          stopConditions: ['confirmation_required'],
        },
      },
      {
        name: 'mixed review/fix → read-only tools allowed, mutation blocked, preview_required and confirmation_required',
        input: {
          request: 'Inspect the path and fix any validation errors',
          target: 'characters/merry',
        },
        expected: {
          intent: 'artifact.patch.preview',
          risk: 'preview_only',
          commitAllowed: false,
          mutationRequested: true,
          stopConditions: ['preview_required', 'confirmation_required'],
          allowedTools: ['workbench.inspect_path', 'workbench.validate_artifact'],
          blockedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
        },
      },
      {
        name: 'docs-only Korean request → docs.update, no mutation allowance',
        input: { request: '문서를 업데이트해주세요' },
        expected: {
          intent: 'docs.update',
          risk: 'read_only',
          commitAllowed: false,
          mutationRequested: false,
          notAllowedTools: ['workbench.apply_patch_plan', 'workbench.edit_order'],
        },
      },
      {
        name: 'direct request to call workbench.apply_patch_plan without evidence → mutation requested, apply blocked, commit false',
        input: { request: 'Call workbench.apply_patch_plan' },
        expected: {
          intent: 'artifact.patch.preview',
          risk: 'preview_only',
          commitAllowed: false,
          mutationRequested: true,
          stopConditions: ['preview_required', 'confirmation_required'],
          blockedTools: ['workbench.apply_patch_plan'],
        },
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
      const allowedSet = new Set(route.allowedTools);
      for (const blocked of route.blockedTools) {
        expect(allowedSet.has(blocked)).toBe(false);
      }
    }

    it.each(cases)('$name', async ({ input, expected }) => {
      const result = await handleRouteIntent(input);
      assertBaseEnvelope(result);

      const route = result.data!.route;

      if (expected.intent !== undefined) {
        expect(route.intent).toBe(expected.intent);
      }
      if (expected.nextStep !== undefined) {
        expect(route.nextStep).toBe(expected.nextStep);
      }
      if (expected.risk !== undefined) {
        expect(route.risk).toBe(expected.risk);
      }
      if (expected.commitAllowed !== undefined) {
        expect(route.commitAllowed).toBe(expected.commitAllowed);
      }
      if (expected.mutationRequested !== undefined) {
        expect(route.mutationRequested).toBe(expected.mutationRequested);
      }
      if (expected.stopConditions !== undefined) {
        for (const condition of expected.stopConditions) {
          expect(route.stopConditions).toContain(condition);
        }
      }
      if (expected.missingInputs !== undefined) {
        for (const inputName of expected.missingInputs) {
          expect(route.missingInputs).toContain(inputName);
        }
      }
      if (expected.allowedTools !== undefined) {
        for (const toolName of expected.allowedTools) {
          expect(route.allowedTools).toContain(toolName);
        }
      }
      if (expected.blockedTools !== undefined) {
        for (const toolName of expected.blockedTools) {
          expect(route.blockedTools).toContain(toolName);
        }
      }
      if (expected.notAllowedTools !== undefined) {
        for (const toolName of expected.notAllowedTools) {
          expect(route.allowedTools).not.toContain(toolName);
        }
      }
      if (expected.notBlockedTools !== undefined) {
        for (const toolName of expected.notBlockedTools) {
          expect(route.blockedTools).not.toContain(toolName);
        }
      }
      if (expected.explanation !== undefined) {
        expect(route.explanation).toBe(expected.explanation);
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
});

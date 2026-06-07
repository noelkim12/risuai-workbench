/**
 * Failing tests for RisuLua workspace/module guide tools (Task 1).
 * @file packages/risuai-workbench-mcp/tests/tools/risulua-lifecycle-guides.test.ts
 */

import { describe, expect, it } from 'vitest';

import { createMcpServer } from '../../src/server';
import { buildRegistrySnapshot } from '../../src/registry';
import {
  handleExplainContextFeedbackLoop,
  handleExplainLorebookPromptInjection,
  handleExplainRisuLuaRuntimeApi,
  handleExplainRisuLuaWorkspace,
  handleGuideRisuLuaModule,
  handlePlanStructuredOutputLoop,
} from '../../src/tools/analyze/risulua-lifecycle-guides';

describe('RisuLua lifecycle guide tools', () => {
  it('explains source-first split workspace layout without treating dist as the workflow source', async () => {
    const result = await handleExplainRisuLuaWorkspace({ targetName: 'maid' });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.explain_risulua_workspace');
    expect(result.data).toMatchObject({
      sourceFirst: true,
      entrypoint: 'lua/main.risulua',
      sourceGlob: 'lua/**/*.risulua',
      generatedRuntimeArtifact: 'dist/maid.risulua',
    });
    expect(JSON.stringify(result.data)).toContain('dist/<targetName>.risulua is generated');
    expect(JSON.stringify(result.data)).toContain('must not drive developer workflow');
  });

  it('allows static source module require while separating final dist runtime constraints', async () => {
    const result = await handleGuideRisuLuaModule({ moduleId: 'runtime.button_click' });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.guide_risulua_module');
    expect(result.data).toMatchObject({
      moduleId: 'runtime.button_click',
      requireForm: 'require("runtime.button_click")',
      staticRequireAllowed: true,
    });
    expect(JSON.stringify(result.data)).toContain('must NOT be treated as an authoring violation');
    expect(JSON.stringify(result.data)).toContain('final generated dist must not retain unresolved executable runtime require');
    expect(JSON.stringify(result.data)).toContain('packaging/export readiness belongs outside this authoring-guide MCP scope');
  });

  it('explains RisuAI Lua runtime lifecycle, id threading, async, and access tiers', async () => {
    const result = await handleExplainRisuLuaRuntimeApi({ focus: 'button' });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.explain_risulua_runtime_api');
    expect(JSON.stringify(result.data)).toContain('onButtonClick(id, data)');
    expect(JSON.stringify(result.data)).toContain('Every host function takes id as the first argument');
    expect(JSON.stringify(result.data)).toContain(':await()');
    expect(JSON.stringify(result.data)).toContain('LowLevel');
    expect(JSON.stringify(result.data)).toContain('risuai-workbench://risulua/index');
    expect(JSON.stringify(result.data)).toContain('docs/reference/LUA_FOR_LLM.md');
    expect(JSON.stringify(result.data)).toContain('docs/risuai-lua.d.ts');
    expect(JSON.stringify(result.data)).toContain('packages/core/src/domain/analyze/lua-api.ts');
    expect(JSON.stringify(result.data)).toContain('packages/core/src/domain/analyze/lua-type-stubs.ts');
  });

  it('frames Lorebook as prompt injection and context activation rather than static data only', async () => {
    const result = await handleExplainLorebookPromptInjection({ includeDecorators: true });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.explain_lorebook_prompt_injection');
    expect(JSON.stringify(result.data)).toContain('prompt injection/context layer');
    expect(JSON.stringify(result.data)).toContain('keyword');
    expect(JSON.stringify(result.data)).toContain('recursive');
    expect(JSON.stringify(result.data)).toContain('@@depth');
    expect(JSON.stringify(result.data)).toContain('docs/upstream-traceability/domains/lorebook-runtime.md');
    expect(JSON.stringify(result.data)).toContain('docs/decorator/reference.md');
    expect(JSON.stringify(result.data)).toContain('packages/core/src/domain/lorebook/structure.ts');
    expect(JSON.stringify(result.data)).toContain('packages/core/src/domain/lorebook/activation-chain.ts');
  });

  it('explains the Lorebook to structured output to Regex to Button to RisuLua feedback loop', async () => {
    const result = await handleExplainContextFeedbackLoop({ variableName: 'quest_state' });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.explain_context_feedback_loop');
    expect((result.data as { loop: string[] }).loop).toEqual([
      'Lorebook',
      'Structured Output',
      'Regex',
      'Button',
      'RisuLua',
      'Variable/Lorebook',
      'Lorebook',
    ]);
    expect(JSON.stringify(result.data)).toContain('{{button::label::trigger}}');
    expect(JSON.stringify(result.data)).toContain('onButtonClick(id, data)');
    expect(JSON.stringify(result.data)).toContain('quest_state');
  });

  it('plans a structured output loop with concrete artifacts and safety boundaries', async () => {
    const result = await handlePlanStructuredOutputLoop({ buttonTrigger: 'accept_quest', variableName: 'quest_state' });

    expect(result.status).toBe('ok');
    expect(result.tool).toBe('workbench.plan_structured_output_loop');
    expect(JSON.stringify(result.data)).toContain('Structured Output');
    expect(JSON.stringify(result.data)).toContain('Regex');
    expect(JSON.stringify(result.data)).toContain('{{button::Accept::accept_quest}}');
    expect((result.data as { sampleLuaAction: string }).sampleLuaAction).toContain('setChatVar(id, "quest_state"');
    expect(JSON.stringify(result.data)).toContain('packages/core/src/domain/regex/contracts.ts');
    expect(JSON.stringify(result.data)).toContain('packages/core/src/simulator/regex/simulate.ts');
  });

  it('does not register legacy RisuLua lifecycle guide tools in default facade-only mode', () => {
    const server = createMcpServer({ mutationMode: 'preview-only', workspace: { ok: true, path: process.cwd(), reason: null } });
    const toolNames = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);

    // Phase 9: default surface exposes only facade tools
    expect(toolNames).not.toContain('workbench.explain_risulua_workspace');
    expect(toolNames).not.toContain('workbench.guide_risulua_module');
    expect(toolNames).not.toContain('workbench.explain_risulua_runtime_api');
    expect(toolNames).not.toContain('workbench.explain_lorebook_prompt_injection');
    expect(toolNames).not.toContain('workbench.explain_context_feedback_loop');
    expect(toolNames).not.toContain('workbench.plan_structured_output_loop');
  });

  it('registers legacy RisuLua lifecycle guide tools when legacy env gate is set', () => {
    const originalEnv = process.env.RISU_MCP_EXPOSE_LEGACY_TOOLS;
    process.env.RISU_MCP_EXPOSE_LEGACY_TOOLS = '1';
    try {
      const server = createMcpServer({ mutationMode: 'preview-only', workspace: { ok: true, path: process.cwd(), reason: null } });
      const toolNames = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);

      expect(toolNames).toContain('workbench.explain_risulua_workspace');
      expect(toolNames).toContain('workbench.guide_risulua_module');
      expect(toolNames).toContain('workbench.explain_risulua_runtime_api');
      expect(toolNames).toContain('workbench.explain_lorebook_prompt_injection');
      expect(toolNames).toContain('workbench.explain_context_feedback_loop');
      expect(toolNames).toContain('workbench.plan_structured_output_loop');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.RISU_MCP_EXPOSE_LEGACY_TOOLS;
      } else {
        process.env.RISU_MCP_EXPOSE_LEGACY_TOOLS = originalEnv;
      }
    }
  });

  it('lists RisuLua lifecycle guide tools as implemented read-only analyze tools', () => {
    const registry = buildRegistrySnapshot();
    const guideTools = registry.tools.filter((tool: { name: string }) =>
      tool.name.includes('risulua') || tool.name.includes('lorebook_prompt') || tool.name.includes('context_feedback') || tool.name.includes('structured_output'),
    );

    expect(guideTools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'workbench.explain_context_feedback_loop',
      'workbench.explain_lorebook_prompt_injection',
      'workbench.explain_risulua_runtime_api',
      'workbench.explain_risulua_workspace',
      'workbench.query_risulua_api',
      'workbench.guide_risulua_module',
      'workbench.plan_structured_output_loop',
    ].sort());
    for (const tool of guideTools) {
      expect(tool.mutates).toBe(false);
      expect(tool.phase).toBe('phase-4');
      expect(tool.implementationStatus).toBe('implemented');
    }
  });
});

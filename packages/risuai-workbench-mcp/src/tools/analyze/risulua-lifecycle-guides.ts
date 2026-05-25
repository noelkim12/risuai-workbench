/**
 * Read-only RisuLua lifecycle and context-loop guide handlers.
 * @file packages/risuai-workbench-mcp/src/tools/analyze/risulua-lifecycle-guides.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';

export interface ExplainRisuLuaWorkspaceInput {
  targetName?: string;
}

export interface GuideRisuLuaModuleInput {
  moduleId?: string;
}

function createGuideEnvelope(tool: string, data: Record<string, unknown>): DiagnosticEnvelope {
  return createDiagnosticEnvelope({
    data,
    diagnostics: [],
    status: 'ok',
    tool,
  });
}

export async function handleExplainRisuLuaWorkspace(input: ExplainRisuLuaWorkspaceInput = {}): Promise<DiagnosticEnvelope> {
  const targetName = input.targetName?.trim() || '<targetName>';

  return createGuideEnvelope('workbench.explain_risulua_workspace', {
    sourceFirst: true,
    entrypoint: 'lua/main.risulua',
    sourceGlob: 'lua/**/*.risulua',
    generatedRuntimeArtifact: `dist/${targetName}.risulua`,
    sections: [
      {
        title: 'Author in split source files',
        points: [
          '`lua/main.risulua` is the source composition root and host ABI shell.',
          '`lua/**/*.risulua` files are the editable source graph for runtime hooks, helpers, state, prompts, actions, and domain candidates.',
          'dist/<targetName>.risulua is generated runtime output and must not drive developer workflow.',
        ],
      },
      {
        title: 'Lifecycle-oriented folders',
        points: [
          '`lua/runtime/*.risulua` owns `onStart`, `onInput`, `onOutput`, `onButtonClick`, and `listenEdit` boundaries.',
          '`lua/button_actions/` owns button-triggered actions reached from output tags.',
          '`lua/state/` and `lua/prompts/` hold variable stores and prompt constants used by lifecycle code.',
        ],
      },
    ],
    references: [
      'packages/core/src/domain/risulua-split/OUTPUT_STRUCTURE.md',
      'packages/core/src/domain/risulua-split/WORKFLOW.md',
    ],
  });
}

export async function handleGuideRisuLuaModule(input: GuideRisuLuaModuleInput = {}): Promise<DiagnosticEnvelope> {
  const moduleId = input.moduleId?.trim() || 'runtime.button_click';

  return createGuideEnvelope('workbench.guide_risulua_module', {
    moduleId,
    requireForm: `require("${moduleId}")`,
    staticRequireAllowed: true,
    authoringRule: 'Source module static require("module.id") is allowed and must NOT be treated as an authoring violation.',
    distBoundary: 'The final generated dist must not retain unresolved executable runtime require. packaging/export readiness belongs outside this authoring-guide MCP scope.',
    moduleShape: {
      recommendedPattern: 'Return a module table from helper files and call it from lua/main.risulua or lifecycle boundary modules.',
      sourceFiles: ['lua/main.risulua', 'lua/**/*.risulua'],
      generatedArtifact: 'dist/<targetName>.risulua',
    },
    references: [
      'packages/core/src/domain/risulua-split/OUTPUT_STRUCTURE.md',
      'packages/core/src/domain/risulua-split/WORKFLOW.md',
    ],
  });
}

export interface ExplainRisuLuaRuntimeApiInput {
  focus?: 'lifecycle' | 'state' | 'button' | 'async' | 'lorebook';
}

export async function handleExplainRisuLuaRuntimeApi(input: ExplainRisuLuaRuntimeApiInput = {}): Promise<DiagnosticEnvelope> {
  return createGuideEnvelope('workbench.explain_risulua_runtime_api', {
    focus: input.focus ?? 'lifecycle',
    referenceRole: 'Risu-only capability, lifecycle, and runtime API reference, not a linter or restrictions list.',
    lifecycleHooks: [
      { mode: 'input', functionName: 'onInput(id)', returnContract: 'Return false to stop sending. Otherwise mutate state or chat through host APIs.' },
      { mode: 'output', functionName: 'onOutput(id)', returnContract: 'Return false to abort chat advancement. Otherwise use state or chat APIs.' },
      { mode: 'start', functionName: 'onStart(id)', returnContract: 'Runs when chat starts.' },
      { mode: 'onButtonClick', functionName: 'onButtonClick(id, data)', returnContract: 'Return value flows back as the button trigger result.' },
      { mode: 'edit hooks', functionName: 'listenEdit(type, callback)', returnContract: 'Return the transformed value so the fold-left edit chain continues.' },
    ],
    idThreading: 'Every host function takes id as the first argument. Pass the id received by the lifecycle hook or edit callback.',
    asyncModel: 'Promise-like host calls use :await(); wrapper helpers such as LLM wrap common async calls.',
    accessTiers: ['Open', 'Safe', 'EditDisplay', 'LowLevel'],
    apiCategories: ['state', 'chat', 'ui', 'ai', 'character', 'lore', 'control', 'utility', 'network', 'event'],
    resourceUris: [
      'risuai-workbench://risulua/index',
      'risuai-workbench://risulua/lifecycle',
      'risuai-workbench://risulua/access-tiers',
      'risuai-workbench://risulua/async',
      'risuai-workbench://risulua/pitfalls',
    ],
    references: [
      'docs/reference/LUA_FOR_LLM.md',
      'docs/risuai-lua.d.ts',
      'packages/core/src/domain/analyze/lua-api.ts',
      'packages/core/src/domain/analyze/lua-type-stubs.ts',
    ],
  });
}

export interface ExplainLorebookPromptInjectionInput {
  includeDecorators?: boolean;
}

export async function handleExplainLorebookPromptInjection(input: ExplainLorebookPromptInjectionInput = {}): Promise<DiagnosticEnvelope> {
  return createGuideEnvelope('workbench.explain_lorebook_prompt_injection', {
    model: 'Lorebook is a prompt injection/context layer, not just static data.',
    activationInputs: ['content', 'keys', 'secondkey', 'constant', 'selective', 'enabled', 'recursiveScanning'],
    runtimeEffects: [
      'Entries activate by constant status, keyword match, secondary key match, regex option, and recursive scanning policy.',
      'Activated entries are inserted into prompt context using runtime metadata such as depth, position, role, priority, and token budget.',
      'Lua can read or update lorebook-related state through RisuAI runtime APIs, but static guide output must distinguish analysis from runtime truth.',
    ],
    decorators: input.includeDecorators
      ? ['@@depth', '@@position', '@@role', '@@recursive', '@@unrecursive', '@@no_recursive_search']
      : [],
    references: [
      'docs/upstream-traceability/domains/lorebook-runtime.md',
      'docs/decorator/reference.md',
      'packages/core/src/domain/lorebook/structure.ts',
      'packages/core/src/domain/lorebook/activation-chain.ts',
    ],
  });
}

export interface ExplainContextFeedbackLoopInput {
  variableName?: string;
}

export interface PlanStructuredOutputLoopInput {
  buttonLabel?: string;
  buttonTrigger?: string;
  variableName?: string;
}

export async function handleExplainContextFeedbackLoop(input: ExplainContextFeedbackLoopInput = {}): Promise<DiagnosticEnvelope> {
  const variableName = input.variableName?.trim() || 'quest_state';

  return createGuideEnvelope('workbench.explain_context_feedback_loop', {
    loop: ['Lorebook', 'Structured Output', 'Regex', 'Button', 'RisuLua', 'Variable/Lorebook', 'Lorebook'],
    explanation: [
      'Lorebook prompt injection influences the model context.',
      'The model emits a structured output marker or block.',
      'Regex parses or rewrites the output into visible status text and a button tag.',
      '{{button::label::trigger}} is a display/output tag.',
      'Clicking dispatches to onButtonClick(id, data) where data is the trigger payload.',
      `RisuLua updates ${variableName} through state APIs or updates lorebook-related context.`,
      'The changed variable or lorebook state feeds the next Lorebook/context injection.',
    ],
    buttonContract: {
      displayTag: '{{button::label::trigger}}',
      dispatch: 'onButtonClick(id, data)',
      dataMeaning: 'data equals the trigger payload from the button tag',
    },
    references: [
      'packages/core/src/domain/analyze/prompt-chain.ts',
      'packages/core/src/domain/analyze/correlation.ts',
      'packages/core/src/domain/regex/contracts.ts',
      'packages/core/src/domain/regex/adapter.ts',
      'packages/core/src/simulator/regex/simulate.ts',
      'packages/core/src/cli/analyze/shared/relationship-network-builders.ts',
    ],
  });
}

export async function handlePlanStructuredOutputLoop(input: PlanStructuredOutputLoopInput = {}): Promise<DiagnosticEnvelope> {
  const buttonLabel = input.buttonLabel?.trim() || 'Accept';
  const buttonTrigger = input.buttonTrigger?.trim() || 'accept_quest';
  const variableName = input.variableName?.trim() || 'quest_state';

  return createGuideEnvelope('workbench.plan_structured_output_loop', {
    objective: 'Design a source-first structured output loop that feeds context back into the next turn.',
    artifacts: [
      { kind: 'Lorebook', purpose: 'Inject instructions and current context into the prompt.' },
      { kind: 'Structured Output', purpose: 'Ask the model for parseable status fields or action markers.' },
      { kind: 'Regex', purpose: 'Transform model output into display text, state cues, or a button tag.' },
      { kind: 'Button', purpose: `Render {{button::${buttonLabel}::${buttonTrigger}}} for user confirmation.` },
      { kind: 'RisuLua', purpose: `Handle onButtonClick(id, data) and call setChatVar(id, "${variableName}", value).` },
      { kind: 'Variable/Lorebook', purpose: 'Feed changed state into the next Lorebook activation or prompt context.' },
    ],
    sampleButtonTag: `{{button::${buttonLabel}::${buttonTrigger}}}`,
    sampleLuaAction: `function onButtonClick(id, data)
  if data == "${buttonTrigger}" then
    setChatVar(id, "${variableName}", "accepted")
  end
end`,
    boundaries: [
      'This guide plans authoring flow and context handoff, not package/export readiness.',
      'Use source files under lua/**/*.risulua for Lua code and avoid making dist the authoring source.',
      'Keep Regex simulation and runtime truth separate when documenting confidence.',
    ],
    references: [
      'packages/core/src/domain/regex/contracts.ts',
      'packages/core/src/domain/regex/adapter.ts',
      'packages/core/src/simulator/regex/simulate.ts',
      'packages/core/src/domain/analyze/prompt-chain.ts',
      'packages/core/src/domain/analyze/correlation.ts',
    ],
  });
}

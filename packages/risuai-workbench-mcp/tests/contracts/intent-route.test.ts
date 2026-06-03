/**
 * Intent route contract schema tests.
 * @file packages/risuai-workbench-mcp/tests/contracts/intent-route.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  createIntentRouteResult,
  intentRouteEnvelopeDataSchema,
  intentRouteInputSchema,
  intentRouteResultSchema,
  routeNextStepSchema,
  routeRiskSchema,
  routeStopConditionSchema,
  targetKindSchema,
  workbenchIntentSchema,
} from '../../src/contracts/intent-route';

describe('intent route contract', () => {
  it('accepts every valid WorkbenchIntent value', () => {
    const validIntents = [
      'workspace.inspect',
      'artifact.inspect',
      'artifact.validate',
      'artifact.patch.preview',
      'artifact.patch.apply',
      'artifact.frontmatter.preview',
      'artifact.order.preview',
      'wiki.refresh.preview',
      'analyze.variable_flow',
      'analyze.lua_handler',
      'creative.idea_to_patch',
      'creative.apply_patch',
      'docs.update',
      'unknown',
    ] as const;

    for (const intent of validIntents) {
      expect(workbenchIntentSchema.parse(intent)).toBe(intent);
    }
  });

  it('rejects invalid intent values', () => {
    expect(() => workbenchIntentSchema.parse('invalid.intent')).toThrow();
    expect(() => workbenchIntentSchema.parse('artifact.patch')).toThrow();
    expect(() => workbenchIntentSchema.parse('')).toThrow();
  });

  it('accepts every valid RouteRisk value', () => {
    const validRisks = [
      'read_only',
      'preview_only',
      'write_additive',
      'write_modify',
      'destructive',
      'external_process',
    ] as const;

    for (const risk of validRisks) {
      expect(routeRiskSchema.parse(risk)).toBe(risk);
    }
  });

  it('rejects invalid risk values', () => {
    expect(() => routeRiskSchema.parse('high')).toThrow();
    expect(() => routeRiskSchema.parse('low')).toThrow();
    expect(() => routeRiskSchema.parse('')).toThrow();
  });

  it('accepts every valid TargetKind value', () => {
    const validKinds = [
      'unknown',
      'workspace',
      'path',
      'artifact_root',
      'diagnostic',
      'variable',
      'lua_handler',
      'idea',
      'patch_plan',
      'documentation',
    ] as const;

    for (const kind of validKinds) {
      expect(targetKindSchema.parse(kind)).toBe(kind);
    }
  });

  it('rejects invalid targetKind values', () => {
    expect(() => targetKindSchema.parse('file')).toThrow();
    expect(() => targetKindSchema.parse('folder')).toThrow();
    expect(() => targetKindSchema.parse('')).toThrow();
  });

  it('accepts every valid RouteNextStep value', () => {
    const validSteps = [
      'clarify',
      'inspect',
      'read_resource',
      'validate',
      'analyze',
      'creative_review',
      'preview',
      'apply',
      'post_validate',
      'answer',
    ] as const;

    for (const step of validSteps) {
      expect(routeNextStepSchema.parse(step)).toBe(step);
    }
  });

  it('rejects invalid nextStep values', () => {
    expect(() => routeNextStepSchema.parse('wait')).toThrow();
    expect(() => routeNextStepSchema.parse('retry')).toThrow();
    expect(() => routeNextStepSchema.parse('')).toThrow();
  });

  it('accepts every valid RouteStopCondition value', () => {
    const validStops = [
      'missing_request',
      'missing_target',
      'ambiguous_target',
      'outside_workspace',
      'preview_required',
      'patch_plan_required',
      'hash_precondition_required',
      'blocking_diagnostics',
      'mutation_tool_blocked',
      'route_low_confidence',
    ] as const;

    for (const stop of validStops) {
      expect(routeStopConditionSchema.parse(stop)).toBe(stop);
    }
  });

  it('rejects invalid stopCondition values', () => {
    expect(() => routeStopConditionSchema.parse('timeout')).toThrow();
    expect(() => routeStopConditionSchema.parse('error')).toThrow();
    expect(() => routeStopConditionSchema.parse('')).toThrow();
  });

  it('accepts a representative intent route input', () => {
    const parsed = intentRouteInputSchema.parse({
      request: 'inspect the workspace',
      target: 'characters/merry',
      context: 'pre-flight check',
    });

    expect(parsed.request).toBe('inspect the workspace');
    expect(parsed.target).toBe('characters/merry');
  });

  it('accepts a minimal intent route input with only request', () => {
    const parsed = intentRouteInputSchema.parse({ request: 'hello' });
    expect(parsed.request).toBe('hello');
  });

  it('accepts a representative intent route result', () => {
    const parsed = intentRouteResultSchema.parse({
      allowedTools: ['workbench.inspect_path'],
      blockedTools: ['workbench.apply_patch_plan'],
      capabilities: ['inspect'],
      commitAllowed: false,
      confidence: 0.85,
      explanation: 'Read-only inspect request with no mutation language.',
      intent: 'artifact.inspect',
      missingInputs: [],
      mutationRequested: false,
      nextInput: { capability: 'inspect', limit: 5 },
      nextStep: 'inspect',
      nextTool: 'workbench.catalog',
      recommendedActions: ['inspect.path', 'inspect.artifact'],
      requiredEvidence: [],
      risk: 'read_only',
      routeId: 'route_abc123',
      schema: 'risuai-workbench-mcp.intent-route',
      schemaVersion: '0.1.0',
      stopConditions: [],
      targetKind: 'path',
    });

    expect(parsed.schema).toBe('risuai-workbench-mcp.intent-route');
    expect(parsed.schemaVersion).toBe('0.1.0');
    expect(parsed.intent).toBe('artifact.inspect');
    expect(parsed.risk).toBe('read_only');
    expect(parsed.nextStep).toBe('inspect');
    expect(parsed.capabilities).toEqual(['inspect']);
    expect(parsed.recommendedActions).toEqual(['inspect.path', 'inspect.artifact']);
    expect(parsed.nextTool).toBe('workbench.catalog');
    expect(parsed.nextInput).toEqual({ capability: 'inspect', limit: 5 });
  });

  it('accepts route guidance fields for recommended, discouraged, domain, and signal metadata', () => {
    const parsed = intentRouteResultSchema.parse({
      allowedTools: ['workbench.inspect_path', 'workbench.validate_frontmatter'],
      blockedTools: ['workbench.apply_patch_plan'],
      capabilities: ['patch.preview'],
      commitAllowed: false,
      confidence: 0.86,
      discouragedTools: ['workbench.edit_frontmatter'],
      domainTags: ['lorebook', 'frontmatter'],
      explanation: 'Frontmatter preview request with lorebook domain signals.',
      intent: 'artifact.frontmatter.preview',
      missingInputs: [],
      mutationRequested: true,
      nextInput: { capability: 'patch.preview', limit: 5 },
      nextStep: 'preview',
      nextTool: 'workbench.catalog',
      recommendedActions: ['patch.suggest_frontmatter'],
      recommendedTools: ['workbench.patch_preview', 'workbench.catalog', 'workbench.prepare_action', 'workbench.run_action'],
      requiredEvidence: ['resolved target path', 'current frontmatter fields'],
      risk: 'preview_only',
      routeId: 'route_guidance',
      routingSignals: ['mutation', 'frontmatter', 'domain:lorebook'],
      schema: 'risuai-workbench-mcp.intent-route',
      schemaVersion: '0.1.0',
      stopConditions: ['preview_required'],
      targetKind: 'path',
    });

    expect(parsed.recommendedTools).toEqual([
      'workbench.patch_preview',
      'workbench.catalog',
      'workbench.prepare_action',
      'workbench.run_action',
    ]);
    expect(parsed.discouragedTools).toEqual(['workbench.edit_frontmatter']);
    expect(parsed.domainTags).toEqual(['lorebook', 'frontmatter']);
    expect(parsed.routingSignals).toEqual(['mutation', 'frontmatter', 'domain:lorebook']);
    expect(parsed.capabilities).toEqual(['patch.preview']);
    expect(parsed.recommendedActions).toEqual(['patch.suggest_frontmatter']);
    expect(parsed.nextTool).toBe('workbench.catalog');
    expect(parsed.nextInput).toEqual({ capability: 'patch.preview', limit: 5 });
  });

  it('accepts advisory mutation mode as part of the compiled workflow state', () => {
    const parsed = intentRouteResultSchema.parse({
      allowedTools: ['workbench.edit_frontmatter'],
      blockedTools: [],
      capabilities: ['patch.preview'],
      commitAllowed: false,
      confidence: 0.88,
      discouragedTools: [],
      domainTags: ['frontmatter'],
      explanation: 'Explicit structured frontmatter update can use a guarded direct mutation tool.',
      intent: 'artifact.frontmatter.preview',
      missingInputs: [],
      mutationMode: 'guarded_direct',
      mutationRequested: true,
      nextInput: { capability: 'patch.preview', limit: 5 },
      nextStep: 'apply',
      nextTool: 'workbench.catalog',
      recommendedActions: ['patch.suggest_frontmatter'],
      recommendedTools: ['workbench.patch_preview', 'workbench.catalog', 'workbench.prepare_action', 'workbench.run_action'],
      requiredEvidence: [
        'resolved workspace-relative path',
        'explicit frontmatter field name',
        'explicit new value',
      ],
      risk: 'write_modify',
      routeId: 'route_mutation_mode',
      routingSignals: ['mutation', 'direct_structured_edit', 'domain:frontmatter'],
      schema: 'risuai-workbench-mcp.intent-route',
      schemaVersion: '0.1.0',
      stopConditions: [],
      targetKind: 'path',
    });

    expect(parsed.mutationMode).toBe('guarded_direct');
    expect(parsed.capabilities).toEqual(['patch.preview']);
    expect(parsed.recommendedActions).toEqual(['patch.suggest_frontmatter']);
    expect(parsed.nextTool).toBe('workbench.catalog');
  });

  it('defaults mutationMode to none when omitted for backward-compatible parsing', () => {
    const parsed = intentRouteResultSchema.parse({
      allowedTools: ['workbench.inspect_path'],
      blockedTools: ['workbench.apply_patch_plan'],
      commitAllowed: false,
      confidence: 0.83,
      explanation: 'Inspection request.',
      intent: 'artifact.inspect',
      missingInputs: [],
      mutationRequested: false,
      nextStep: 'inspect',
      requiredEvidence: [],
      risk: 'read_only',
      routeId: 'route_mutation_mode_default',
      schema: 'risuai-workbench-mcp.intent-route',
      schemaVersion: '0.1.0',
      stopConditions: [],
      targetKind: 'path',
    });

    expect(parsed.mutationMode).toBe('none');
    expect(parsed.capabilities).toEqual([]);
    expect(parsed.recommendedActions).toEqual([]);
    expect(parsed.nextTool).toBe('workbench.catalog');
    expect(parsed.nextInput).toEqual({});
  });

  it('defaults route guidance fields to empty arrays when omitted', () => {
    const parsed = intentRouteResultSchema.parse({
      allowedTools: ['workbench.inspect_path'],
      blockedTools: ['workbench.apply_patch_plan'],
      commitAllowed: false,
      confidence: 0.83,
      explanation: 'Inspection request.',
      intent: 'artifact.inspect',
      missingInputs: [],
      mutationRequested: false,
      nextStep: 'inspect',
      requiredEvidence: [],
      risk: 'read_only',
      routeId: 'route_defaults',
      schema: 'risuai-workbench-mcp.intent-route',
      schemaVersion: '0.1.0',
      stopConditions: [],
      targetKind: 'path',
    });

    expect(parsed.recommendedTools).toEqual([]);
    expect(parsed.discouragedTools).toEqual([]);
    expect(parsed.domainTags).toEqual([]);
    expect(parsed.routingSignals).toEqual([]);
    expect(parsed.capabilities).toEqual([]);
    expect(parsed.recommendedActions).toEqual([]);
    expect(parsed.nextTool).toBe('workbench.catalog');
    expect(parsed.nextInput).toEqual({});
  });

  it('rejects non-array route guidance fields', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        discouragedTools: 'workbench.edit_order',
        domainTags: [],
        explanation: 'test',
        intent: 'unknown',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'clarify',
        recommendedTools: [],
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_invalid_guidance',
        routingSignals: [],
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'unknown',
      }),
    ).toThrow();
  });

  it('rejects intent route result with wrong schema literal', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        explanation: 'test',
        intent: 'unknown',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'clarify',
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_test',
        schema: 'risuai-workbench-mcp.diagnostics',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'unknown',
      }),
    ).toThrow();
  });

  it('rejects intent route result with wrong schemaVersion', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        explanation: 'test',
        intent: 'unknown',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'clarify',
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_test',
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.2.0',
        stopConditions: [],
        targetKind: 'unknown',
      }),
    ).toThrow();
  });

  it('rejects invalid intent in route result', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        explanation: 'test',
        intent: 'invalid.intent',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'clarify',
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_test',
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'unknown',
      }),
    ).toThrow();
  });

  it('rejects invalid risk in route result', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        explanation: 'test',
        intent: 'unknown',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'clarify',
        requiredEvidence: [],
        risk: 'high_risk',
        routeId: 'route_test',
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'unknown',
      }),
    ).toThrow();
  });

  it('rejects invalid targetKind in route result', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        explanation: 'test',
        intent: 'unknown',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'clarify',
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_test',
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'invalid_kind',
      }),
    ).toThrow();
  });

  it('rejects invalid nextStep in route result', () => {
    expect(() =>
      intentRouteResultSchema.parse({
        allowedTools: [],
        blockedTools: [],
        commitAllowed: false,
        confidence: 0.5,
        explanation: 'test',
        intent: 'unknown',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'invalid_step',
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_test',
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'unknown',
      }),
    ).toThrow();
  });

  it('accepts a representative intent route envelope data', () => {
    const parsed = intentRouteEnvelopeDataSchema.parse({
      route: {
        allowedTools: ['workbench.inspect_path'],
        blockedTools: [],
        capabilities: ['inspect'],
        commitAllowed: false,
        confidence: 0.9,
        explanation: 'Workspace inspect request.',
        intent: 'workspace.inspect',
        missingInputs: [],
        mutationRequested: false,
        nextInput: { capability: 'inspect', limit: 5 },
        nextStep: 'inspect',
        nextTool: 'workbench.catalog',
        recommendedActions: ['inspect.path', 'inspect.artifact'],
        requiredEvidence: [],
        risk: 'read_only',
        routeId: 'route_def456',
        schema: 'risuai-workbench-mcp.intent-route',
        schemaVersion: '0.1.0',
        stopConditions: [],
        targetKind: 'workspace',
      },
    });

    expect(parsed.route.schema).toBe('risuai-workbench-mcp.intent-route');
    expect(parsed.route.schemaVersion).toBe('0.1.0');
    expect(parsed.route.capabilities).toEqual(['inspect']);
    expect(parsed.route.recommendedActions).toEqual(['inspect.path', 'inspect.artifact']);
    expect(parsed.route.nextTool).toBe('workbench.catalog');
  });

  it('createIntentRouteResult preserves schema marker and version', () => {
    const result = createIntentRouteResult({
      allowedTools: ['workbench.inspect_path'],
      blockedTools: ['workbench.apply_patch_plan'],
      capabilities: ['inspect'],
      commitAllowed: false,
      confidence: 0.85,
      discouragedTools: [],
      domainTags: [],
      explanation: 'Read-only inspect request.',
      intent: 'artifact.inspect',
      missingInputs: [],
      mutationMode: 'none',
      mutationRequested: false,
      nextInput: { capability: 'inspect', limit: 5 },
      nextStep: 'inspect',
      nextTool: 'workbench.catalog',
      recommendedActions: ['inspect.path', 'inspect.artifact'],
      recommendedTools: ['workbench.catalog', 'workbench.prepare_action', 'workbench.run_action'],
      requiredEvidence: [],
      risk: 'read_only',
      routeId: 'route_abc123',
      routingSignals: ['inspect'],
      stopConditions: [],
      targetKind: 'path',
    });

    expect(result.schema).toBe('risuai-workbench-mcp.intent-route');
    expect(result.schemaVersion).toBe('0.1.0');
    expect(result.intent).toBe('artifact.inspect');
    expect(result.risk).toBe('read_only');
    expect(result.nextStep).toBe('inspect');
    expect(result.targetKind).toBe('path');
    expect(result.capabilities).toEqual(['inspect']);
    expect(result.recommendedActions).toEqual(['inspect.path', 'inspect.artifact']);
    expect(result.nextTool).toBe('workbench.catalog');
    expect(result.nextInput).toEqual({ capability: 'inspect', limit: 5 });
  });
});

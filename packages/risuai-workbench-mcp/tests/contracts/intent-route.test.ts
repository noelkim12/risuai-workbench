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
      'confirm',
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
      'confirmation_required',
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
      commitAllowed: false,
      confidence: 0.85,
      explanation: 'Read-only inspect request with no mutation language.',
      intent: 'artifact.inspect',
      missingInputs: [],
      mutationRequested: false,
      nextStep: 'inspect',
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
        commitAllowed: false,
        confidence: 0.9,
        explanation: 'Workspace inspect request.',
        intent: 'workspace.inspect',
        missingInputs: [],
        mutationRequested: false,
        nextStep: 'inspect',
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
  });

  it('createIntentRouteResult preserves schema marker and version', () => {
    const result = createIntentRouteResult({
      allowedTools: ['workbench.inspect_path'],
      blockedTools: ['workbench.apply_patch_plan'],
      commitAllowed: false,
      confidence: 0.85,
      explanation: 'Read-only inspect request.',
      intent: 'artifact.inspect',
      missingInputs: [],
      mutationRequested: false,
      nextStep: 'inspect',
      requiredEvidence: [],
      risk: 'read_only',
      routeId: 'route_abc123',
      stopConditions: [],
      targetKind: 'path',
    });

    expect(result.schema).toBe('risuai-workbench-mcp.intent-route');
    expect(result.schemaVersion).toBe('0.1.0');
    expect(result.intent).toBe('artifact.inspect');
    expect(result.risk).toBe('read_only');
    expect(result.nextStep).toBe('inspect');
    expect(result.targetKind).toBe('path');
  });
});

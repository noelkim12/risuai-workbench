/**
 * Creative envelope contract tests for schema markers, version, required fields,
 * ranking dimensions, future schema refusal, context/impact/critique envelopes,
 * and session persistence fields.
 * @file packages/risuai-workbench-mcp/tests/contracts/creative-envelope.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  type CreativeErrorCode,
  type CreativeSessionSchema,
  type Idea,
  type IdeaPatchEnvelope,
  type IdeaRanking,
  type IdeationEnvelope,
  type RankingDimensions,
  CREATIVE_SCHEMA_VERSION,
  DEFAULT_RANKING_DIMENSIONS,
  SUPPORTED_CREATIVE_SESSION_SCHEMA_VERSIONS,
  createCreativeAnalyzeCritiqueEnvelope,
  createCreativeContextEnvelope,
  createCreativeImpactPreviewEnvelope,
  createCreativeImplementationPlan,
  createCreativeSession,
  createIdea,
  createIdeaApplyResult,
  createIdeaPatchEnvelope,
  createIdeationEnvelope,
  validateCreativeSessionSchema,
} from '../../src/contracts/creative';

describe('creative envelope contracts', () => {
  // -----------------------------------------------------------------------
  // Schema markers & version — ideation
  // -----------------------------------------------------------------------
  it('ideation envelope uses creative schema marker and version 0.2.0', () => {
    const envelope = createIdeationEnvelope({
      ideas: [],
      session: {
        mode: 'mutation-capable',
        persistentMemoryWritten: false,
        sessionId: 'session-001',
        sourceArtifactWritten: false,
      },
      status: 'ok',
      tool: 'workbench.creative.brainstorm_scamper',
    });

    expect(envelope.schema).toBe('risuai-workbench-mcp.creative.ideation');
    expect(envelope.schemaVersion).toBe('0.2.0');
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — idea-patch
  // -----------------------------------------------------------------------
  it('idea patch envelope uses creative schema marker and version 0.2.0', () => {
    const envelope = createIdeaPatchEnvelope({
      ideaId: 'idea:001',
      mutationTarget: {
        affectedFiles: ['characters/merry/lorebooks/combat-emotion.risulorebook'],
        touchesGeneratedOnly: false,
        touchesSourceArtifacts: true,
      },
      patchPlanId: 'patch:idea:001',
      preApplyValidation: { required: ['validate_path', 'validate_frontmatter'] },
      resourceLinks: ['risuai-workbench://mutations/patch-plans/patch%3Aidea%3A001'],
      status: 'preview-created',
      tool: 'workbench.creative.turn_idea_into_patch_plan',
    });

    expect(envelope.schema).toBe('risuai-workbench-mcp.creative.idea-patch');
    expect(envelope.schemaVersion).toBe('0.2.0');
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — session
  // -----------------------------------------------------------------------
  it('creative session uses creative schema marker and version 0.2.0', () => {
    const session = createCreativeSession({
      createdAt: '2026-05-22T00:00:00Z',
      ideas: [],
      patchPlanRefs: [],
      rankings: {},
      sessionId: 'session-001',
      sourceInputs: [{ artifactKey: 'character:merry', resourceLinks: [] }],
      status: 'active',
      title: 'Mood combat brainstorm',
      updatedAt: '2026-05-22T00:00:00Z',
      workspaceRoot: '.',
    });

    expect(session.schema).toBe('risuai-workbench-mcp.creative.session');
    expect(session.schemaVersion).toBe('0.2.0');
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — implementation-plan
  // -----------------------------------------------------------------------
  it('implementation plan uses creative schema marker and version 0.2.0', () => {
    const plan = createCreativeImplementationPlan({
      planId: 'plan:001',
      selectedIdeaIds: ['idea:001'],
      steps: [
        {
          affectedFiles: [],
          ideaId: 'idea:001',
          operations: [{ kind: 'text.replace' }],
          description: 'Replace mood trigger',
        },
      ],
    });

    expect(plan.schema).toBe('risuai-workbench-mcp.creative.implementation-plan');
    expect(plan.schemaVersion).toBe('0.2.0');
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — apply-result
  // -----------------------------------------------------------------------
  it('apply result uses creative schema marker and version 0.2.0', () => {
    const result = createIdeaApplyResult({
      changedFiles: ['characters/merry/lorebooks/_order.json'],
      ideaId: 'idea:001',
      patchPlanId: 'patch:idea:001',
      resourceLinks: [],
      status: 'applied',
      tool: 'workbench.creative.apply_idea_patch',
    });

    expect(result.schema).toBe('risuai-workbench-mcp.creative.apply-result');
    expect(result.schemaVersion).toBe('0.2.0');
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — context (Task 6 needs this)
  // -----------------------------------------------------------------------
  it('context envelope uses creative schema marker and version 0.2.0', () => {
    const envelope = createCreativeContextEnvelope({
      artifactKey: 'character:merry',
      contextCards: [
        {
          evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
          id: 'var:mood',
          kind: 'variable',
          title: 'mood',
          whyUseful: 'Combat lorebook Lua handler reads/writes this state',
        },
      ],
      resourceLinks: ['risuai-workbench://analyze/character:merry/relationship-network'],
      status: 'ok',
      theme: 'combat tension',
      tool: 'workbench.creative.gather_context',
    });

    expect(envelope.schema).toBe('risuai-workbench-mcp.creative.context');
    expect(envelope.schemaVersion).toBe('0.2.0');
    expect(envelope.artifactKey).toBe('character:merry');
    expect(envelope.contextCards).toHaveLength(1);
    expect(envelope.contextCards[0]).toMatchObject({
      kind: 'variable',
      evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
    });
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — impact-preview (Task 9 needs this)
  // -----------------------------------------------------------------------
  it('impact preview envelope uses creative schema marker and version 0.2.0', () => {
    const envelope = createCreativeImpactPreviewEnvelope({
      affectedGraph: {
        edgeCount: 9,
        nodeCount: 7,
        resourceUri: 'risuai-workbench://analyze/character:merry/relationship-network?focus=mood',
      },
      analyzeImpact: {
        compositionRisk: 'none',
        promptChainRisk: 'needs-order-review',
        tokenDeltaEstimate: '+120 conditional tokens',
        variables: ['mood'],
      },
      ideaId: 'idea:001',
      nextActions: ['workbench.creative.critique_idea_with_analyze', 'workbench.creative.turn_idea_into_patch_plan'],
      patchPreview: {
        available: true,
        resourceUri: 'risuai-workbench://mutations/patch-plans/patch:idea:001',
      },
      status: 'ok',
      summary: 'mood 변화 기반 combat lorebook 추가',
      tool: 'workbench.creative.preview_creative_impact',
      wikiConstraints: ['risuai-workbench://wiki/custom-extension/extensions/lorebook'],
    });

    expect(envelope.schema).toBe('risuai-workbench-mcp.creative.impact-preview');
    expect(envelope.schemaVersion).toBe('0.2.0');
    expect(envelope.ideaId).toBe('idea:001');
    expect(envelope.analyzeImpact.variables).toEqual(['mood']);
    expect(envelope.patchPreview.available).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Schema markers & version — analyze-critique (Task 9 needs this)
  // -----------------------------------------------------------------------
  it('analyze critique envelope uses creative schema marker and version 0.2.0', () => {
    const envelope = createCreativeAnalyzeCritiqueEnvelope({
      ideaId: 'idea:001',
      requiredValidation: [
        'workbench.validate_frontmatter',
        'workbench.validate_order',
        'workbench.query_token_budget',
      ],
      risks: [
        {
          category: 'token-budget',
          evidence: ['risuai-workbench://analyze/character:merry/token-budget'],
          message: '새 lorebook 후보가 worst-case token budget을 180 tokens 증가시킬 수 있음',
          severity: 'warning',
        },
      ],
      safeToPrototype: true,
      status: 'domain_warning',
      tool: 'workbench.creative.critique_idea_with_analyze',
    });

    expect(envelope.schema).toBe('risuai-workbench-mcp.creative.analyze-critique');
    expect(envelope.schemaVersion).toBe('0.2.0');
    expect(envelope.ideaId).toBe('idea:001');
    expect(envelope.risks).toHaveLength(1);
    expect(envelope.risks[0]).toMatchObject({
      category: 'token-budget',
      severity: 'warning',
      evidence: ['risuai-workbench://analyze/character:merry/token-budget'],
    });
    expect(envelope.safeToPrototype).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Evidence & assumptions required arrays
  // -----------------------------------------------------------------------
  it('createIdea requires separate evidence and assumptions arrays', () => {
    const idea = createIdea({
      assumptions: ['mood variable has a stable writer'],
      evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
      id: 'idea:001',
      summary: 'Connect combat trigger to mood drift.',
      title: 'Mood drift combat trigger',
    });

    expect(idea.evidence).toEqual(['risuai-workbench://analyze/character:merry/variables/mood']);
    expect(idea.assumptions).toEqual(['mood variable has a stable writer']);
    expect(idea.id).toBe('idea:001');
  });

  it('createIdea with empty evidence and assumptions is still valid structurally', () => {
    const idea = createIdea({
      assumptions: [],
      evidence: [],
      id: 'idea:002',
      summary: 'Purely speculative idea.',
      title: 'No evidence idea',
    });

    expect(idea.evidence).toEqual([]);
    expect(idea.assumptions).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Ranking dimensions — patchReadiness is separate
  // -----------------------------------------------------------------------
  it('default ranking dimensions include patchReadiness alongside impact, feasibility, novelty, risk, tokenCost', () => {
    const dims: RankingDimensions = DEFAULT_RANKING_DIMENSIONS;

    expect(dims).toHaveProperty('impact');
    expect(dims).toHaveProperty('feasibility');
    expect(dims).toHaveProperty('novelty');
    expect(dims).toHaveProperty('risk');
    expect(dims).toHaveProperty('tokenCost');
    expect(dims).toHaveProperty('patchReadiness');
  });

  it('patchReadiness weight is separate and does not replace other dimensions', () => {
    const dims = DEFAULT_RANKING_DIMENSIONS;

    expect(typeof dims.patchReadiness.weight).toBe('number');
    expect(dims.impact.weight).toBe(0.30);
    expect(dims.feasibility.weight).toBe(0.25);
    expect(dims.novelty.weight).toBe(0.20);
    expect(dims.risk.weight).toBe(-0.15);
    expect(dims.tokenCost.weight).toBe(-0.10);
    expect(dims.patchReadiness.weight).toBe(0.05);
  });

  it('idea ranking includes mutationReadiness level', () => {
    const ranking: IdeaRanking = {
      mutationReadiness: 'ready-with-validation',
      requiredValidation: ['workbench.query_variable', 'workbench.query_token_budget'],
      score: 82,
    };

    expect(ranking.score).toBe(82);
    expect(ranking.mutationReadiness).toBe('ready-with-validation');
    expect(ranking.requiredValidation).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Ideation envelope shape — matches knowledge base example
  // -----------------------------------------------------------------------
  it('ideation envelope matches the knowledge base envelope shape', () => {
    const envelope: IdeationEnvelope = createIdeationEnvelope({
      ideas: [
        createIdea({
          assumptions: ['mood variable has a stable writer.'],
          candidateMutations: ['create_artifact', 'edit_order', 'edit_frontmatter'],
          evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
          id: 'idea:001',
          nextActions: ['workbench.query_variable', 'workbench.creative.turn_idea_into_patch_plan'],
          summary: '전투 트리거를 HP 대신 mood 변화량에 연결한다.',
          title: 'Mood drift combat trigger',
        }),
      ],
      method: {
        id: 'scamper',
        resourceUri: 'risuai-workbench://methods/scamper',
      },
      session: {
        mode: 'mutation-capable',
        persistentMemoryWritten: false,
        sessionId: 'creative-session-001',
        sourceArtifactWritten: false,
      },
      status: 'ok',
      tool: 'workbench.creative.brainstorm_scamper',
    });

    expect(envelope).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.ideation',
      schemaVersion: '0.2.0',
      session: { mode: 'mutation-capable', sessionId: 'creative-session-001' },
      method: { id: 'scamper' },
      status: 'ok',
      tool: 'workbench.creative.brainstorm_scamper',
    });
    expect(envelope.ideas).toHaveLength(1);
    expect(envelope.ideas[0]).toMatchObject({
      evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
      assumptions: ['mood variable has a stable writer.'],
    });
  });

  // -----------------------------------------------------------------------
  // Idea patch envelope shape — matches knowledge base example
  // -----------------------------------------------------------------------
  it('idea patch envelope matches the knowledge base patch envelope shape', () => {
    const envelope: IdeaPatchEnvelope = createIdeaPatchEnvelope({
      ideaId: 'idea:001',
      mutationTarget: {
        affectedFiles: [
          'characters/merry/lorebooks/combat-emotion.risulorebook',
          'characters/merry/lorebooks/_order.json',
        ],
        touchesGeneratedOnly: false,
        touchesSourceArtifacts: true,
      },
      patchPlanId: 'patch:idea:001',
      preApplyValidation: {
        required: ['validate_path', 'validate_frontmatter', 'validate_order', 'query_token_budget'],
      },
      resourceLinks: ['risuai-workbench://mutations/patch-plans/patch%3Aidea%3A001'],
      status: 'preview-created',
      tool: 'workbench.creative.turn_idea_into_patch_plan',
    });

    expect(envelope).toMatchObject({
      ideaId: 'idea:001',
      mutationTarget: { touchesSourceArtifacts: true, touchesGeneratedOnly: false },
      patchPlanId: 'patch:idea:001',
      preApplyValidation: { required: expect.arrayContaining(['validate_path', 'validate_frontmatter']) },
      schema: 'risuai-workbench-mcp.creative.idea-patch',
      status: 'preview-created',
    });
  });

  // -----------------------------------------------------------------------
  // Future schema refusal
  // -----------------------------------------------------------------------
  it('rejects unsupported newer session schema versions with CREATIVE_SESSION_SCHEMA_UNSUPPORTED', () => {
    const result = validateCreativeSessionSchema({ schemaVersion: '999.0.0' });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe<CreativeErrorCode>('CREATIVE_SESSION_SCHEMA_UNSUPPORTED');
      expect(result.message).toContain('999.0.0');
      expect(result.message).toContain('0.2.0');
    }
  });

  it('accepts supported session schema version 0.2.0', () => {
    const result = validateCreativeSessionSchema({ schemaVersion: '0.2.0' });

    expect(result.valid).toBe(true);
  });

  it('rejects older session schema versions deterministically', () => {
    const result = validateCreativeSessionSchema({ schemaVersion: '0.1.0' });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe<CreativeErrorCode>('CREATIVE_SESSION_SCHEMA_UNSUPPORTED');
    }
  });

  // -----------------------------------------------------------------------
  // Supported versions constant
  // -----------------------------------------------------------------------
  it('SUPPORTED_CREATIVE_SESSION_SCHEMA_VERSIONS contains only 0.2.0', () => {
    expect(SUPPORTED_CREATIVE_SESSION_SCHEMA_VERSIONS).toEqual(['0.2.0']);
  });

  // -----------------------------------------------------------------------
  // Creative session — expanded persistence fields (Task 3 alignment)
  // -----------------------------------------------------------------------
  it('createCreativeSession produces a valid session with persistence fields', () => {
    const session: CreativeSessionSchema = createCreativeSession({
      createdAt: '2026-05-22T00:00:00Z',
      ideas: [
        createIdea({
          assumptions: ['assumes X'],
          evidence: ['evidence Y'],
          id: 'idea:001',
          summary: 'Test idea',
          title: 'Test',
        }),
      ],
      patchPlanRefs: [
        { ideaId: 'idea:001', patchPlanId: 'patch:idea:001', resourceUri: 'risuai-workbench://mutations/patch-plans/patch%3Aidea%3A001' },
      ],
      rankings: {
        'idea:001': { mutationReadiness: 'ready-with-validation', score: 82 },
      },
      sessionId: 'session-001',
      sourceInputs: [
        { artifactKey: 'character:merry', resourceLinks: ['risuai-workbench://analyze/character:merry/variables/mood'] },
      ],
      status: 'active',
      title: 'Mood combat brainstorm',
      updatedAt: '2026-05-22T01:00:00Z',
      workspaceRoot: '.',
    });

    expect(session).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.session',
      schemaVersion: '0.2.0',
      sessionId: 'session-001',
    });
    expect(session.ideas).toHaveLength(1);
    expect(session.rankings['idea:001']).toMatchObject({ score: 82, mutationReadiness: 'ready-with-validation' });
    expect(session.patchPlanRefs).toHaveLength(1);
    expect(session.sourceInputs).toHaveLength(1);
    expect(session.title).toBe('Mood combat brainstorm');
    expect(session.status).toBe('active');
    expect(session.updatedAt).toBe('2026-05-22T01:00:00Z');
  });

  it('session includes all Task 3 persistence fields', () => {
    const session = createCreativeSession({
      createdAt: '2026-05-22T00:00:00Z',
      ideas: [],
      patchPlanRefs: [],
      rankings: {},
      sessionId: 'session-002',
      sourceInputs: [],
      status: 'active',
      title: 'Empty session',
      updatedAt: '2026-05-22T00:00:00Z',
      workspaceRoot: '/tmp/test-workspace',
    });

    // Assert every field required by plan Task 3 exists
    expect(session).toHaveProperty('sessionId');
    expect(session).toHaveProperty('workspaceRoot');
    expect(session).toHaveProperty('schemaVersion');
    expect(session).toHaveProperty('createdAt');
    expect(session).toHaveProperty('updatedAt');
    expect(session).toHaveProperty('title');
    expect(session).toHaveProperty('sourceInputs');
    expect(session).toHaveProperty('ideas');
    expect(session).toHaveProperty('rankings');
    expect(session).toHaveProperty('patchPlanRefs');
    expect(session).toHaveProperty('status');
  });

  // -----------------------------------------------------------------------
  // Implementation plan references PatchPlan operation kinds
  // -----------------------------------------------------------------------
  it('implementation plan steps reference PatchOperation kinds without duplicating schema', () => {
    const plan = createCreativeImplementationPlan({
      planId: 'plan:001',
      selectedIdeaIds: ['idea:001'],
      steps: [
        {
          affectedFiles: [{ operationKinds: ['text.replace'], path: 'test.md' }],
          description: 'Apply text replacement',
          ideaId: 'idea:001',
          operations: [{ kind: 'text.replace' }, { kind: 'frontmatter.set' }],
        },
      ],
    });

    expect(plan.steps[0]?.operations).toEqual([{ kind: 'text.replace' }, { kind: 'frontmatter.set' }]);
    expect(plan.steps[0]?.affectedFiles[0]?.operationKinds).toContain('text.replace');
  });

  // -----------------------------------------------------------------------
  // Apply result shape
  // -----------------------------------------------------------------------
  it('apply result carries idea and patch plan identifiers', () => {
    const result = createIdeaApplyResult({
      changedFiles: ['characters/merry/lorebooks/_order.json'],
      ideaId: 'idea:001',
      patchPlanId: 'patch:idea:001',
      resourceLinks: ['risuai-workbench://mutations/journal/mutation%3A001'],
      status: 'applied',
      tool: 'workbench.creative.apply_idea_patch',
    });

    expect(result).toMatchObject({
      ideaId: 'idea:001',
      patchPlanId: 'patch:idea:001',
      status: 'applied',
      schema: 'risuai-workbench-mcp.creative.apply-result',
    });
  });

  // -----------------------------------------------------------------------
  // Creative error codes exist as a type
  // -----------------------------------------------------------------------
  it('creative error codes include all required domain failure codes', () => {
    const requiredCodes: CreativeErrorCode[] = [
      'CREATIVE_SESSION_SCHEMA_UNSUPPORTED',
      'CREATIVE_SESSION_NOT_FOUND',
      'CREATIVE_WORKSPACE_MISMATCH',
      'CREATIVE_IDEA_NOT_FOUND',
      'CREATIVE_PATCH_PLAN_NOT_FOUND',
      'CREATIVE_PATCH_PLAN_INVALID',
      'CREATIVE_POLICY_DENIED',
    ];

    expect(requiredCodes).toHaveLength(7);
    expect(requiredCodes[0]).toBe('CREATIVE_SESSION_SCHEMA_UNSUPPORTED');
  });

  // -----------------------------------------------------------------------
  // Context envelope shape — matches KB example
  // -----------------------------------------------------------------------
  it('context envelope matches the knowledge base context envelope shape', () => {
    const envelope = createCreativeContextEnvelope({
      artifactKey: 'character:merry',
      contextCards: [
        {
          evidence: ['risuai-workbench://analyze/character:merry/variables/mood'],
          id: 'var:mood',
          kind: 'variable',
          title: 'mood',
          whyUseful: '전투 lorebook과 Lua handler가 함께 읽고 쓰는 state 후보',
        },
      ],
      resourceLinks: [
        'risuai-workbench://analyze/character:merry/relationship-network',
        'risuai-workbench://wiki/custom-extension/extensions/lorebook',
      ],
      status: 'ok',
      theme: 'combat tension',
      tool: 'workbench.creative.gather_context',
    });

    expect(envelope).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.context',
      schemaVersion: '0.2.0',
      artifactKey: 'character:merry',
      theme: 'combat tension',
      status: 'ok',
    });
    expect(envelope.contextCards[0]?.evidence).toEqual([
      'risuai-workbench://analyze/character:merry/variables/mood',
    ]);
    expect(envelope.resourceLinks).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Impact preview envelope shape — matches KB example
  // -----------------------------------------------------------------------
  it('impact preview envelope matches the knowledge base impact preview shape', () => {
    const envelope = createCreativeImpactPreviewEnvelope({
      affectedGraph: {
        edgeCount: 9,
        nodeCount: 7,
        resourceUri: 'risuai-workbench://analyze/character:merry/relationship-network?focus=mood',
      },
      analyzeImpact: {
        compositionRisk: 'none',
        promptChainRisk: 'needs-order-review',
        tokenDeltaEstimate: '+120 conditional tokens',
        variables: ['mood'],
      },
      ideaId: 'idea:001',
      nextActions: ['workbench.creative.critique_idea_with_analyze', 'workbench.creative.turn_idea_into_patch_plan'],
      patchPreview: {
        available: true,
        resourceUri: 'risuai-workbench://mutations/patch-plans/patch:idea:001',
      },
      status: 'ok',
      summary: 'mood 변화 기반 combat lorebook 추가',
      tool: 'workbench.creative.preview_creative_impact',
      wikiConstraints: ['risuai-workbench://wiki/custom-extension/extensions/lorebook'],
    });

    expect(envelope).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.impact-preview',
      schemaVersion: '0.2.0',
      ideaId: 'idea:001',
      status: 'ok',
    });
    expect(envelope.analyzeImpact.tokenDeltaEstimate).toBe('+120 conditional tokens');
    expect(envelope.affectedGraph?.nodeCount).toBe(7);
  });

  // -----------------------------------------------------------------------
  // Analyze critique envelope shape — matches KB example
  // -----------------------------------------------------------------------
  it('analyze critique envelope matches the knowledge base critique shape', () => {
    const envelope = createCreativeAnalyzeCritiqueEnvelope({
      ideaId: 'idea:001',
      requiredValidation: [
        'workbench.validate_frontmatter',
        'workbench.validate_order',
        'workbench.query_token_budget',
      ],
      risks: [
        {
          category: 'token-budget',
          evidence: ['risuai-workbench://analyze/character:merry/token-budget'],
          message: '새 lorebook 후보가 worst-case token budget을 180 tokens 증가시킬 수 있음',
          severity: 'warning',
        },
      ],
      safeToPrototype: true,
      status: 'domain_warning',
      tool: 'workbench.creative.critique_idea_with_analyze',
    });

    expect(envelope).toMatchObject({
      schema: 'risuai-workbench-mcp.creative.analyze-critique',
      schemaVersion: '0.2.0',
      ideaId: 'idea:001',
      status: 'domain_warning',
    });
    expect(envelope.risks[0]?.category).toBe('token-budget');
    expect(envelope.risks[0]?.evidence).toHaveLength(1);
    expect(envelope.requiredValidation).toHaveLength(3);
  });
});

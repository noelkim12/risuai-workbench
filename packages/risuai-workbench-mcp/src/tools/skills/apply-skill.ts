/**
 * Authoring skill application preview.
 * @file packages/risuai-workbench-mcp/src/tools/skills/apply-skill.ts
 */

import { z } from 'zod';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import { findAuthoringSkill } from '../../skills/catalog';

const applySkillInputSchema = z.object({
  recommendationReason: z.string().optional(),
  request: z.string().min(1),
  skillId: z.string().min(1),
  target: z.string().optional(),
}).catchall(z.unknown());

export type ApplySkillInput = z.infer<typeof applySkillInputSchema>;

interface ApplySkillData {
  planPreview: {
    markdown: string;
    nextPrompt: 'workbench.generate_plan_from_skill';
    resourceUri: string;
    skill: { id: string; title: string };
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleApplySkill(input: unknown): Promise<DiagnosticEnvelope<ApplySkillData>> {
  const parsed = applySkillInputSchema.safeParse(input);
  if (!parsed.success) {
    return createDiagnosticEnvelope({
      diagnostics: parsed.error.issues.map((issue) => ({
        category: 'input',
        id: 'APPLY_SKILL_INVALID_INPUT',
        message: issue.message,
        path: issue.path.join('.'),
        ruleId: 'skills.apply.invalid-input',
        severity: 'error' as const,
      })),
      status: 'domain_error',
      tool: 'workbench.apply_skill',
    });
  }

  const skill = findAuthoringSkill(parsed.data.skillId);
  if (!skill) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'skills',
        id: 'APPLY_SKILL_UNKNOWN_SKILL',
        message: `Unknown authoring skill: ${parsed.data.skillId}`,
        path: null,
        ruleId: 'skills.apply.unknown-skill',
        severity: 'error' as const,
      }],
      status: 'domain_error',
      tool: 'workbench.apply_skill',
    });
  }

  const markdown = `---
project: ${parsed.data.target ?? 'not provided'}
type: authoring-skill-plan
status: preview
skill: ${skill.id}
created: ${todayIsoDate()}
tags: []
---

## Overview

This is a preview plan bundle generated for the **${skill.title}** authoring skill.

## User Goal

${parsed.data.request}

## Applied Skill

- Skill: ${skill.title}
- Skill ID: ${skill.id}
- Resource: ${skill.resourceUri}
- Recommendation reason: ${parsed.data.recommendationReason ?? 'not provided'}

## Plan Generation Instructions

Use MCP prompt \`workbench.generate_plan_from_skill\` with this preview context. Read the full skill resource before writing the final plan text.

## Acceptance Gates

- User approval was required before generating this preview.
- This preview does not mutate files.
- Saving the final plan must use the existing Workbench mutation workflow.
`;

  return createDiagnosticEnvelope({
    data: {
      planPreview: {
        markdown,
        nextPrompt: 'workbench.generate_plan_from_skill',
        resourceUri: skill.resourceUri,
        skill: { id: skill.id, title: skill.title },
      },
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.apply_skill',
  });
}

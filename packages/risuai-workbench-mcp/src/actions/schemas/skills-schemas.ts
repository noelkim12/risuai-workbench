/**
 * Zod input schemas for Phase 4 skills actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/skills-schemas.ts
 */

import { z } from 'zod';

export const ListAuthoringSkillsInputSchema = z.object({}).catchall(z.unknown());

export const RecommendSkillsInputSchema = z.object({
  llmSelection: z.object({
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    skillId: z.string().min(1),
  }),
  request: z.string().min(1),
}).catchall(z.unknown());

export const ApplySkillInputSchema = z.object({
  recommendationReason: z.string().optional(),
  request: z.string().min(1),
  skillId: z.string().min(1),
  target: z.string().optional(),
}).catchall(z.unknown());

/**
 * Phase 4 skills action adapters.
 * Thin wrappers over existing handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/skills-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';

import {
  ListAuthoringSkillsInputSchema,
  RecommendSkillsInputSchema,
  ApplySkillInputSchema,
} from '../schemas/skills-schemas';

import type { ListAuthoringSkillsInput } from '../../tools/skills/list-authoring-skills';
import type { RecommendSkillsInput } from '../../tools/skills/recommend-skills';
import type { ApplySkillInput } from '../../tools/skills/apply-skill';

import {
  handleListAuthoringSkills,
  handleRecommendSkills,
  handleApplySkill,
} from '../../tools/skills';

/**
 * registerSkillsActions 함수.
 * Populates the ActionRegistry with read-only skills actions.
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerSkillsActions(registry: ActionRegistry): void {
  registry.register({
    id: 'skills.list',
    legacyToolName: 'workbench.list_authoring_skills',
    title: 'List authoring skills',
    summary: 'List packaged authoring skills with user-friendly descriptions.',
    capability: 'skills',
    risk: 'read_only',
    inputSchema: ListAuthoringSkillsInputSchema,
    execute: (input) => handleListAuthoringSkills(input),
  } as WorkbenchAction<ListAuthoringSkillsInput, DiagnosticEnvelope>);

  registry.register({
    id: 'skills.recommend',
    legacyToolName: 'workbench.recommend_skills',
    title: 'Recommend skills',
    summary: 'Validate an LLM-selected authoring skill recommendation.',
    capability: 'skills',
    risk: 'read_only',
    inputSchema: RecommendSkillsInputSchema,
    execute: (input) => handleRecommendSkills(input),
  } as WorkbenchAction<RecommendSkillsInput, DiagnosticEnvelope>);

  registry.register({
    id: 'skills.apply',
    legacyToolName: 'workbench.apply_skill',
    title: 'Apply authoring skill',
    summary: 'Apply an approved authoring skill as a plan preview.',
    capability: 'skills',
    risk: 'read_only',
    inputSchema: ApplySkillInputSchema,
    execute: (input) => handleApplySkill(input),
  } as WorkbenchAction<ApplySkillInput, DiagnosticEnvelope>);
}

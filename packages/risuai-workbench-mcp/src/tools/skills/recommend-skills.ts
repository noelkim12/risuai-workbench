/**
 * LLM-assisted authoring skill recommendation validator.
 * @file packages/risuai-workbench-mcp/src/tools/skills/recommend-skills.ts
 */

import { z } from 'zod';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import { findAuthoringSkill } from '../../skills/catalog';

const recommendSkillsInputSchema = z.object({
  llmSelection: z.object({
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    skillId: z.string().min(1),
  }),
  request: z.string().min(1),
}).catchall(z.unknown());

export type RecommendSkillsInput = z.infer<typeof recommendSkillsInputSchema>;

interface RecommendSkillsData {
  recommendation: {
    nextStep: 'confirm';
    reason: string;
    request: string;
    status: 'approval_required';
    skill: {
      id: string;
      resourceUri: string;
      summary: string;
      title: string;
    };
    userMessage: string;
  };
}

export async function handleRecommendSkills(input: unknown): Promise<DiagnosticEnvelope<RecommendSkillsData>> {
  const parsed = recommendSkillsInputSchema.safeParse(input);
  if (!parsed.success) {
    return createDiagnosticEnvelope({
      diagnostics: parsed.error.issues.map((issue) => ({
        category: 'input',
        id: 'RECOMMEND_SKILLS_INVALID_INPUT',
        message: issue.message,
        path: issue.path.join('.'),
        ruleId: 'skills.recommend.invalid-input',
        severity: 'error' as const,
      })),
      status: 'domain_error',
      tool: 'workbench.recommend_skills',
    });
  }

  const skill = findAuthoringSkill(parsed.data.llmSelection.skillId);
  if (!skill) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'skills',
        id: 'RECOMMEND_SKILLS_UNKNOWN_SKILL',
        message: `Unknown authoring skill: ${parsed.data.llmSelection.skillId}`,
        path: null,
        ruleId: 'skills.recommend.unknown-skill',
        severity: 'error' as const,
      }],
      status: 'domain_error',
      tool: 'workbench.recommend_skills',
    });
  }

  const userMessage = [
    `추천 authoring skill: **${skill.title}**`,
    '',
    `이유: ${parsed.data.llmSelection.reason}`,
    '',
    `요약: ${skill.summary}`,
    '',
    '이 skill을 적용해 계획문서 preview를 생성하려면 승인해주세요. 승인 전에는 skill이 적용되지 않습니다.',
  ].join('\n');

  return createDiagnosticEnvelope({
    data: {
      recommendation: {
        nextStep: 'confirm',
        reason: parsed.data.llmSelection.reason,
        request: parsed.data.request,
        status: 'approval_required',
        skill: {
          id: skill.id,
          resourceUri: skill.resourceUri,
          summary: skill.summary,
          title: skill.title,
        },
        userMessage,
      },
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.recommend_skills',
  });
}

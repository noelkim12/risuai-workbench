/**
 * User-friendly authoring skill catalog listing tool.
 * @file packages/risuai-workbench-mcp/src/tools/skills/list-authoring-skills.ts
 */

import { z } from 'zod';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import { listAuthoringSkills } from '../../skills/catalog';

const listAuthoringSkillsInputSchema = z.object({}).catchall(z.unknown());

export type ListAuthoringSkillsInput = z.infer<typeof listAuthoringSkillsInputSchema>;

interface ListedAuthoringSkill {
  description: string;
  doNotUseWhen: string;
  families: readonly string[];
  id: string;
  name: string;
  primaryArtifacts: readonly string[];
  resourceUri: string;
  signals: readonly string[];
  summary: string;
  title: string;
  useWhen: string;
}

interface ListAuthoringSkillsData {
  catalogResourceUri: 'risuai-workbench://skills/index';
  count: number;
  skills: readonly ListedAuthoringSkill[];
  userMessage: string;
}

function buildUserMessage(skills: readonly ListedAuthoringSkill[]): string {
  const lines = [
    'RisuAI Workbench MCP에서 제공하는 authoring skill 목록입니다.',
    '',
    ...skills.flatMap((skill, index) => [
      `${index + 1}. **${skill.name}**`,
      `   - 설명: ${skill.description}`,
      `   - 이런 때 사용: ${skill.useWhen}`,
      `   - 주요 대상: ${skill.primaryArtifacts.join(', ')}`,
      `   - 리소스: ${skill.resourceUri}`,
      '',
    ]),
    '전체 catalog resource: risuai-workbench://skills/index',
  ];

  return lines.join('\n').trimEnd();
}

export async function handleListAuthoringSkills(input: unknown): Promise<DiagnosticEnvelope<ListAuthoringSkillsData>> {
  const parsed = listAuthoringSkillsInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return createDiagnosticEnvelope({
      diagnostics: parsed.error.issues.map((issue) => ({
        category: 'input',
        id: 'LIST_AUTHORING_SKILLS_INVALID_INPUT',
        message: issue.message,
        path: issue.path.join('.'),
        ruleId: 'skills.list.invalid-input',
        severity: 'error' as const,
      })),
      status: 'domain_error',
      tool: 'workbench.list_authoring_skills',
    });
  }

  const skills = listAuthoringSkills().map<ListedAuthoringSkill>((skill) => ({
    description: skill.summary,
    doNotUseWhen: skill.doNotUseWhen,
    families: skill.families,
    id: skill.id,
    name: skill.title,
    primaryArtifacts: skill.primaryArtifacts,
    resourceUri: skill.resourceUri,
    signals: skill.signals,
    summary: skill.summary,
    title: skill.title,
    useWhen: skill.useWhen,
  }));

  return createDiagnosticEnvelope({
    data: {
      catalogResourceUri: 'risuai-workbench://skills/index',
      count: skills.length,
      skills,
      userMessage: buildUserMessage(skills),
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.list_authoring_skills',
  });
}

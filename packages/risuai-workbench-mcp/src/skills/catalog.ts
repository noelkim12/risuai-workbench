/**
 * Packaged authoring skill catalog loader.
 * @file packages/risuai-workbench-mcp/src/skills/catalog.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const authoringSkillSchema = z.object({
  doNotUseWhen: z.string().min(1),
  families: z.array(z.string().min(1)).min(1),
  file: z.string().min(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.literal('authoring-guidance'),
  locale: z.literal('en'),
  primaryArtifacts: z.array(z.string().min(1)).min(1),
  resourceUri: z.string().startsWith('risuai-workbench://skills/en/'),
  signals: z.array(z.string().min(1)).min(1),
  source: z.string().min(1),
  summary: z.string().min(1),
  title: z.string().min(1),
  useWhen: z.string().min(1),
});

const authoringSkillCatalogSchema = z.object({
  schema: z.literal('risuai-workbench-mcp.authoring-skills'),
  schemaVersion: z.literal('0.1.0'),
  skills: z.array(authoringSkillSchema).min(1),
});

export type AuthoringSkill = z.infer<typeof authoringSkillSchema>;

let cachedSkills: readonly AuthoringSkill[] | undefined;
const markdownCache = new Map<string, string>();

function packageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function promptAssetsRoot(): string {
  return path.join(packageRoot(), 'prompt-assets');
}

function catalogPath(): string {
  return path.join(promptAssetsRoot(), 'skills', 'skills-catalog.json');
}

function assertSafeSkillFile(file: string): void {
  const normalized = path.posix.normalize(file);
  if (
    path.isAbsolute(file) ||
    normalized !== file ||
    normalized.includes('..') ||
    !normalized.startsWith('skills/en/') ||
    !normalized.endsWith('.md')
  ) {
    throw new Error(`Unsafe authoring skill asset path: ${file}`);
  }
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

export function listAuthoringSkills(): readonly AuthoringSkill[] {
  if (cachedSkills) return cachedSkills;

  const parsed = authoringSkillCatalogSchema.parse(JSON.parse(readUtf8(catalogPath())));
  const ids = new Set<string>();
  const files = new Set<string>();

  for (const skill of parsed.skills) {
    if (ids.has(skill.id)) throw new Error(`Duplicate authoring skill id: ${skill.id}`);
    if (files.has(skill.file)) throw new Error(`Duplicate authoring skill file: ${skill.file}`);
    assertSafeSkillFile(skill.file);
    ids.add(skill.id);
    files.add(skill.file);
  }

  cachedSkills = parsed.skills;
  return cachedSkills;
}

export function findAuthoringSkill(skillId: string): AuthoringSkill | undefined {
  return listAuthoringSkills().find((skill) => skill.id === skillId);
}

export function readAuthoringSkillMarkdown(skillId: string): string {
  const skill = findAuthoringSkill(skillId);
  if (!skill) throw new Error(`Authoring skill not found: ${skillId}`);

  const cached = markdownCache.get(skill.id);
  if (cached !== undefined) return cached;

  assertSafeSkillFile(skill.file);
  const markdown = readUtf8(path.join(promptAssetsRoot(), skill.file));
  markdownCache.set(skill.id, markdown);
  return markdown;
}

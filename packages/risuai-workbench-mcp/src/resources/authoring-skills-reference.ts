/**
 * Authoring skill read-only resource provider.
 * @file packages/risuai-workbench-mcp/src/resources/authoring-skills-reference.ts
 */

import { findAuthoringSkill, listAuthoringSkills, readAuthoringSkillMarkdown } from '../skills/catalog';

function jsonResource(uri: string, payload: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return { contents: [{ mimeType: 'application/json', text: JSON.stringify(payload, null, 2), uri }] };
}

function markdownResource(uri: string, text: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return { contents: [{ mimeType: 'text/markdown', text, uri }] };
}

function decodeSkillPath(uri: string): string | null {
  const prefix = 'risuai-workbench://skills/';
  if (!uri.startsWith(prefix)) return null;
  return decodeURIComponent(uri.slice(prefix.length));
}

export function readAuthoringSkillResource(uri: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } | null {
  const skillPath = decodeSkillPath(uri);
  if (skillPath === 'index') {
    return jsonResource(uri, {
      schema: 'risuai-workbench-mcp.authoring-skills-index',
      schemaVersion: '0.1.0',
      skills: listAuthoringSkills().map((skill) => ({
        doNotUseWhen: skill.doNotUseWhen,
        families: skill.families,
        id: skill.id,
        primaryArtifacts: skill.primaryArtifacts,
        resourceUri: skill.resourceUri,
        signals: skill.signals,
        summary: skill.summary,
        title: skill.title,
        useWhen: skill.useWhen,
      })),
    });
  }

  if (skillPath?.startsWith('en/')) {
    const skillId = skillPath.slice('en/'.length);
    const skill = findAuthoringSkill(skillId);
    if (!skill) return null;
    return markdownResource(uri, readAuthoringSkillMarkdown(skill.id));
  }

  return null;
}

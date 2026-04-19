import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { EMPTY_WORKSPACE_CONFIG, type WorkspaceConfig, type ArtifactType } from '../types';

const VALID_TYPES: ReadonlySet<ArtifactType> = new Set(['character', 'module', 'preset']);

/**
 * Load and validate `<wikiRoot>/workspace.yaml`.
 * Returns EMPTY_WORKSPACE_CONFIG if the file does not exist.
 * Throws on malformed YAML or invalid field shapes.
 */
export function loadWorkspaceConfig(wikiRoot: string): WorkspaceConfig {
  const configPath = path.join(wikiRoot, 'workspace.yaml');
  if (!fs.existsSync(configPath)) {
    return { ...EMPTY_WORKSPACE_CONFIG };
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw);
  if (parsed === null || parsed === undefined) {
    return { ...EMPTY_WORKSPACE_CONFIG };
  }
  if (typeof parsed !== 'object') {
    throw new Error(`workspace.yaml: expected an object at top level, got ${typeof parsed}`);
  }

  return {
    artifacts: validateArtifacts(parsed.artifacts),
    companions: validateCompanions(parsed.companions),
    labels: validateLabels(parsed.labels),
  };
}

function validateArtifacts(value: unknown): WorkspaceConfig['artifacts'] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error('workspace.yaml: artifacts must be an array');
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`workspace.yaml: artifacts[${index}] must be an object`);
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj.path !== 'string') {
      throw new Error(`workspace.yaml: artifacts[${index}].path must be a string`);
    }
    if (typeof obj.type !== 'string' || !VALID_TYPES.has(obj.type as ArtifactType)) {
      throw new Error(
        `workspace.yaml: artifacts[${index}].type must be one of character|module|preset (got: ${String(obj.type)})`,
      );
    }
    return { path: obj.path, type: obj.type as ArtifactType };
  });
}

function validateCompanions(value: unknown): Record<string, string[]> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workspace.yaml: companions must be a map');
  }
  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(raw)) {
      throw new Error(`workspace.yaml: companions[${key}] must be an array`);
    }
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        throw new Error(`workspace.yaml: companions[${key}] entries must be strings`);
      }
    }
    result[key] = raw as string[];
  }
  return result;
}

function validateLabels(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workspace.yaml: labels must be a map');
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') {
      throw new Error(`workspace.yaml: labels[${key}] must be a string`);
    }
    result[key] = raw;
  }
  return result;
}

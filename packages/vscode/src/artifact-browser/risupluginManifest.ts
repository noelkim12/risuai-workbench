/**
 * `.risuplugin` root marker parsing for plugin project cards.
 * Marker is workbench-owned: the extension writes it after `create-risu-plugin` scaffolds.
 * @file packages/vscode/src/artifact-browser/risupluginManifest.ts
 */

import type { PluginFramework } from './artifactBrowserTypes';

export const RISUPLUGIN_FILENAME = '.risuplugin';
export const RISUPLUGIN_KIND = 'risu-plugin';
export const RISUPLUGIN_SCHEMA_VERSION = 1;

export interface RisupluginManifest {
  kind: typeof RISUPLUGIN_KIND;
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  framework: PluginFramework | 'unknown';
  icon?: string;
  createdAt?: string;
  modifiedAt?: string;
}

/**
 * parseRisupluginManifest 함수.
 * `.risuplugin` marker text를 plugin manifest로 파싱함.
 *
 * @param text - marker file raw text
 * @param sourceLabel - error message에 표시할 source path label
 * @returns normalized plugin manifest
 */
export function parseRisupluginManifest(text: string, sourceLabel: string): RisupluginManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${RISUPLUGIN_FILENAME} JSON at ${sourceLabel}: ${detail}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid ${RISUPLUGIN_FILENAME} JSON at ${sourceLabel}: expected an object`);
  }
  if (parsed.kind !== RISUPLUGIN_KIND) {
    throw new Error(`kind must be "${RISUPLUGIN_KIND}" at ${sourceLabel}`);
  }
  if (typeof parsed.name !== 'string' || parsed.name.length === 0) {
    throw new Error(`missing required fields (name) at ${sourceLabel}`);
  }

  return {
    kind: RISUPLUGIN_KIND,
    schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : RISUPLUGIN_SCHEMA_VERSION,
    id: typeof parsed.id === 'string' ? parsed.id : '',
    name: parsed.name,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    framework: parsed.framework === 'vanilla' || parsed.framework === 'svelte' ? parsed.framework : 'unknown',
    ...(typeof parsed.icon === 'string' && parsed.icon.length > 0 && { icon: parsed.icon }),
    ...(typeof parsed.createdAt === 'string' && { createdAt: parsed.createdAt }),
    ...(typeof parsed.modifiedAt === 'string' && { modifiedAt: parsed.modifiedAt }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * File-backed prompt asset loading and rendering.
 * @file packages/risuai-workbench-mcp/src/prompts/prompt-assets.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

export interface PromptAssetManifestEntry {
  name: string;
  file: string;
}

export interface PromptRenderArgs {
  context?: string;
  target?: string;
}

const promptAssetManifestSchema = z.object({
  prompts: z.array(z.object({
    file: z.string().min(1),
    name: z.string().min(1),
  })),
  schema: z.literal('risuai-workbench-mcp.prompt-assets'),
  schemaVersion: z.string().min(1),
});

let cachedManifest: readonly PromptAssetManifestEntry[] | undefined;
const templateCache = new Map<string, string>();

function packageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function promptAssetsRoot(): string {
  return path.join(packageRoot(), 'prompt-assets');
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

export function loadPromptAssetManifest(): readonly PromptAssetManifestEntry[] {
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestPath = path.join(promptAssetsRoot(), 'manifest.json');
  const parsed = promptAssetManifestSchema.parse(JSON.parse(readUtf8(manifestPath)));
  cachedManifest = parsed.prompts.map((entry) => ({ file: entry.file, name: entry.name }));
  return cachedManifest;
}

function findPromptAsset(name: string): PromptAssetManifestEntry {
  const entry = loadPromptAssetManifest().find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Prompt asset not found for ${name}`);
  }
  return entry;
}

function assertSafeAssetFile(file: string): void {
  if (path.isAbsolute(file) || file.includes('..') || path.basename(file) !== file || !file.endsWith('.md')) {
    throw new Error(`Unsafe prompt asset file path: ${file}`);
  }
}

function loadTemplate(entry: PromptAssetManifestEntry): string {
  const cached = templateCache.get(entry.name);
  if (cached !== undefined) {
    return cached;
  }

  assertSafeAssetFile(entry.file);
  const template = readUtf8(path.join(promptAssetsRoot(), entry.file));
  templateCache.set(entry.name, template);
  return template;
}

function renderValue(value: string | undefined): string {
  return value && value.length > 0 ? value : 'not provided';
}

export function renderPromptAsset(name: string, args: PromptRenderArgs = {}): string {
  const entry = findPromptAsset(name);
  return `${loadTemplate(entry)
    .replaceAll('{{target}}', renderValue(args.target))
    .replaceAll('{{context}}', renderValue(args.context))}\n`;
}

/**
 * Pure derivation of Plugin Viewer header/version + Build/Dev availability from package.json text.
 * @file packages/vscode/src/views/pluginPackageJson.ts
 */

export interface PluginPackageInfo {
  version: string | null;
  scripts: { build: boolean; dev: boolean };
  error: string | null;
}

export function derivePluginPackageInfo(text: string): PluginPackageInfo {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { version: null, scripts: { build: false, dev: false }, error: `Invalid package.json: ${detail}` };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { version: null, scripts: { build: false, dev: false }, error: 'Invalid package.json: expected an object' };
  }
  const record = parsed as Record<string, unknown>;
  const scripts = typeof record.scripts === 'object' && record.scripts !== null ? (record.scripts as Record<string, unknown>) : {};
  return {
    version: typeof record.version === 'string' ? record.version : null,
    scripts: {
      build: typeof scripts.build === 'string' && scripts.build.length > 0,
      dev: typeof scripts.dev === 'string' && scripts.dev.length > 0,
    },
    error: null,
  };
}

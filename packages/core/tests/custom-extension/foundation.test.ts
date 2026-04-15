import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function loadCustomExtensionModule(): Promise<Record<string, unknown>> {
  return (await import('../../src/domain/custom-extension')) as Record<string, unknown>;
}

async function loadNodeModule(): Promise<Record<string, unknown>> {
  return (await import('../../src/node/custom-extension-file-discovery')) as Record<string, unknown>;
}

describe('custom-extension foundation contracts', () => {
  it('freezes canonical targets, extensions, and ownership matrix', async () => {
    const customExtension = await loadCustomExtensionModule();
    const targets = customExtension.CUSTOM_EXTENSION_TARGETS as readonly string[];
    const extensions = customExtension.CUSTOM_EXTENSION_ARTIFACTS as readonly string[];
    const listOwnedExtensions = customExtension.listOwnedCustomExtensionArtifacts as (
      target: string,
    ) => readonly string[];
    const supportsOwnership = customExtension.supportsCustomExtensionArtifact as (
      target: string,
      artifact: string,
    ) => boolean;

    expect(targets).toEqual(['charx', 'module', 'preset']);
    expect(extensions).toEqual(['lorebook', 'regex', 'lua', 'prompt', 'toggle', 'variable', 'html']);

    expect(listOwnedExtensions('charx')).toEqual(['lorebook', 'regex', 'lua', 'variable', 'html']);
    expect(listOwnedExtensions('module')).toEqual([
      'lorebook',
      'regex',
      'lua',
      'toggle',
      'variable',
      'html',
    ]);
    expect(listOwnedExtensions('preset')).toEqual(['regex', 'prompt', 'toggle']);

    expect(supportsOwnership('charx', 'toggle')).toBe(false);
    expect(supportsOwnership('module', 'variable')).toBe(true);
    expect(supportsOwnership('preset', 'prompt')).toBe(true);
    expect(supportsOwnership('preset', 'html')).toBe(false);
  });

  it('builds deterministic canonical artifact paths from shared naming rules', async () => {
    const customExtension = await loadCustomExtensionModule();
    const buildCanonicalPath = customExtension.buildCanonicalArtifactPath as (options: {
      target: string;
      artifact: string;
      targetName?: string;
      stem?: string;
      fallbackStem?: string;
    }) => string;

    expect(
      buildCanonicalPath({
        target: 'charx',
        artifact: 'lua',
        targetName: 'Alternate Hunters v2',
      }),
    ).toBe('lua/Alternate_Hunters_v2.risulua');
    expect(
      buildCanonicalPath({
        target: 'charx',
        artifact: 'variable',
        targetName: 'Alternate Hunters v2',
      }),
    ).toBe('variables/Alternate_Hunters_v2.risuvar');
    expect(buildCanonicalPath({ target: 'charx', artifact: 'html' })).toBe(
      'html/background.risuhtml',
    );
    expect(
      buildCanonicalPath({
        target: 'module',
        artifact: 'variable',
        targetName: 'Merry RPG 모듈 V1.3',
      }),
    ).toBe('variables/Merry_RPG_모듈_V1.3.risuvar');
    expect(
      buildCanonicalPath({
        target: 'module',
        artifact: 'toggle',
        targetName: 'Merry RPG 모듈 V1.3',
      }),
    ).toBe('toggle/Merry_RPG_모듈_V1.3.risutoggle');
    expect(buildCanonicalPath({ target: 'preset', artifact: 'toggle' })).toBe(
      'toggle/prompt_template.risutoggle',
    );
    expect(
      buildCanonicalPath({
        target: 'preset',
        artifact: 'prompt',
        stem: 'Main Prompt',
      }),
    ).toBe('prompt_template/Main_Prompt.risuprompt');
    expect(
      buildCanonicalPath({
        target: 'module',
        artifact: 'regex',
        stem: 'Combat Filter',
      }),
    ).toBe('regex/Combat_Filter.risuregex');
  });

  it('freezes shared allowed-loss categories and registry entries', async () => {
    const customExtension = await loadCustomExtensionModule();
    const categories = customExtension.ALLOWED_LOSS_CATEGORIES as readonly string[];
    const listRules = customExtension.listAllowedLossRules as (category?: string) => readonly {
      id: string;
      category: string;
    }[];

    expect(categories).toEqual(['intentional_unedited', 'upstream_limit', 'design_bug']);
    expect(listRules('intentional_unedited').map((rule) => rule.id)).toEqual(
      expect.arrayContaining(['authoring-scope-unedited-fields', 'root-json-default-overlay']),
    );
    expect(listRules('upstream_limit').map((rule) => rule.id)).toEqual(
      expect.arrayContaining([
        'upstream-selective-logic-injection',
        'upstream-case-sensitivity-runtime-collapse',
      ]),
    );
    expect(listRules('design_bug')).toEqual([]);
  });

  it('discovers canonical artifacts, marker files, and structured json deterministically', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-extension-discovery-'));
    tempDirs.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, 'lorebooks', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'regex'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'lua'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'html'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'prompt_template'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'provider'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'metadata.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'advanced.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'provider', 'openai.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'lorebooks', '_order.json'), '[]', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'lorebooks', '_folders.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'lorebooks', 'nested', 'alpha.risulorebook'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'regex', 'combat.risuregex'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'lua', 'Adventure.risulua'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'html', 'background.risuhtml'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'prompt_template', 'main.risuprompt'), '', 'utf-8');

    const nodeModule = await loadNodeModule();
    const discover = nodeModule.discoverCustomExtensionWorkspace as (rootDir: string) => {
      canonicalFiles: { relativePath: string; artifact: string }[];
      markerFiles: { relativePath: string; kind: string }[];
      structuredJsonFiles: { relativePath: string }[];
    };

    const discovery = discover(tmpDir);

    expect(
      discovery.canonicalFiles.map(({ artifact, relativePath }) => ({ artifact, relativePath })),
    ).toEqual([
      { artifact: 'html', relativePath: 'html/background.risuhtml' },
      { artifact: 'lorebook', relativePath: 'lorebooks/nested/alpha.risulorebook' },
      { artifact: 'lua', relativePath: 'lua/Adventure.risulua' },
      { artifact: 'prompt', relativePath: 'prompt_template/main.risuprompt' },
      { artifact: 'regex', relativePath: 'regex/combat.risuregex' },
    ]);
    expect(discovery.markerFiles.map(({ kind, relativePath }) => ({ kind, relativePath }))).toEqual([
      { kind: 'folders', relativePath: 'lorebooks/_folders.json' },
      { kind: 'order', relativePath: 'lorebooks/_order.json' },
    ]);
    expect(discovery.structuredJsonFiles.map(({ relativePath }) => ({ relativePath }))).toEqual([
      { relativePath: 'advanced.json' },
      { relativePath: 'metadata.json' },
      { relativePath: 'provider/openai.json' },
    ]);
  });

  it('rejects unsupported canonical extension', async () => {
    const customExtension = await loadCustomExtensionModule();
    const parseCanonicalExtension = customExtension.parseCustomExtensionArtifactFromSuffix as (
      suffix: string,
    ) => string;

    expect(() => parseCanonicalExtension('.risuunknown')).toThrowError(
      'Unsupported canonical extension: .risuunknown',
    );
  });
});

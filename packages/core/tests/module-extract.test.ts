import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  phase1_parseModule,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractLua,
  phase5_extractAssets,
  phase6_extractBackgroundEmbedding,
  phase7_extractVariables,
  phase8_extractModuleIdentity,
  phase9_extractModuleToggle,
} from '../src/cli/extract/module/phases';
import {
  isModuleFile,
  runExtractWorkflow as runModuleExtractWorkflow,
} from '../src/cli/extract/module/workflow';
import { isModuleJson } from '../src/cli/extract/parsers';
import { parseLorebookContent } from '../src/domain/custom-extension/extensions/lorebook';
import { parseRegexContent } from '../src/domain/custom-extension/extensions/regex';
import { parseVariableContent } from '../src/domain/custom-extension/extensions/variable';

describe('module extract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-extract-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('phase1_parseModule parses valid JSON module input', () => {
    const filePath = path.join(tmpDir, 'module.json');
    const payload = {
      type: 'risuModule',
      module: {
        name: 'test',
        id: 'test-id',
        description: 'test module',
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8');

    const parsed = phase1_parseModule(filePath);

    expect(parsed.module.name).toBe('test');
    expect(parsed.module.id).toBe('test-id');
    expect(parsed.sourceFormat).toBe('json');
    expect(parsed.assetBuffers).toEqual([]);
  });

  it('phase1_parseModule throws for invalid JSON module structure', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, JSON.stringify({ type: 'not-module', value: 1 }), 'utf-8');

    expect(() => phase1_parseModule(filePath)).toThrowError();
  });

  it('phase2_extractLorebooks writes canonical .risulorebook files and order markers', () => {
    const module = {
      lorebook: [
        {
          key: 'key1, key2',
          secondkey: 'secondary',
          content: 'content1',
          comment: 'Entry 1',
          mode: 'normal',
          alwaysActive: true,
          selective: false,
          insertorder: 10,
          useRegex: false,
        },
      ],
    };

    const count = phase2_extractLorebooks(module, tmpDir);
    const lorebooksDir = path.join(tmpDir, 'lorebooks');
    const canonicalPath = path.join(lorebooksDir, 'Entry_1.risulorebook');

    expect(count).toBe(1);
    expect(fs.existsSync(canonicalPath)).toBe(true);
    expect(fs.existsSync(path.join(lorebooksDir, '_order.json'))).toBe(true);
    expect(fs.existsSync(path.join(lorebooksDir, 'manifest.json'))).toBe(false);

    const parsed = parseLorebookContent(fs.readFileSync(canonicalPath, 'utf-8'));
    expect(parsed.comment).toBe('Entry 1');
    expect(parsed.keys).toEqual(['key1', 'key2']);
    expect(parsed.secondary_keys).toEqual(['secondary']);
    expect(parsed.content).toBe('content1');
  });

  it('phase2_extractLorebooks accepts stringified module lorebook bookVersion values from .risum payloads', () => {
    const module = {
      lorebook: [
        {
          key: 'key1',
          content: 'content1',
          comment: 'Entry 1',
          mode: 'normal',
          alwaysActive: false,
          selective: false,
          insertorder: 10,
          useRegex: false,
          bookVersion: '2',
        },
      ],
    };

    const count = phase2_extractLorebooks(module, tmpDir);
    const canonicalPath = path.join(tmpDir, 'lorebooks', 'Entry_1.risulorebook');

    expect(count).toBe(1);
    expect(parseLorebookContent(fs.readFileSync(canonicalPath, 'utf-8')).book_version).toBe(2);
  });

  it('phase3_extractRegex writes canonical .risuregex files and order index', () => {
    const module = {
      regex: [
        {
          comment: 'test_regex',
          type: 'editdisplay',
          in: 'foo',
          out: 'bar',
        },
      ],
    };

    const count = phase3_extractRegex(module, tmpDir);
    const regexDir = path.join(tmpDir, 'regex');
    const canonicalPath = path.join(regexDir, 'test_regex.risuregex');

    expect(count).toBe(1);
    expect(fs.existsSync(canonicalPath)).toBe(true);
    expect(fs.existsSync(path.join(regexDir, '_order.json'))).toBe(true);
    expect(
      fs
        .readdirSync(regexDir)
        .filter((filename) => filename.endsWith('.json') && filename !== '_order.json'),
    ).toEqual([]);

    expect(parseRegexContent(fs.readFileSync(canonicalPath, 'utf-8'))).toEqual({
      comment: 'test_regex',
      type: 'editdisplay',
      in: 'foo',
      out: 'bar',
    });
  });

  it('phase4_extractLua writes one canonical .risulua file from module triggerscript', () => {
    const module = {
      name: 'test module',
      triggerscript: 'function onStart()\n  print("hello")\nend',
    };

    const count = phase4_extractLua(module, tmpDir);
    const luaPath = path.join(tmpDir, 'lua', 'test_module.risulua');

    expect(count).toBe(1);
    expect(fs.existsSync(luaPath)).toBe(true);
    expect(fs.readFileSync(luaPath, 'utf-8')).toBe(module.triggerscript);
  });

  it('phase5_extractAssets skips extraction for JSON source format', () => {
    const module = {
      assets: [['asset_name', 'asset_uri', 'icon']],
    };

    const extracted = phase5_extractAssets(module, tmpDir, [Buffer.from('data')], 'json');

    expect(extracted).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'assets'))).toBe(false);
  });

  it('phase6_extractBackgroundEmbedding writes canonical .risuhtml file when embedding exists', () => {
    const module = {
      backgroundEmbedding: '<div>test</div>',
    };

    const count = phase6_extractBackgroundEmbedding(module, tmpDir);
    const backgroundPath = path.join(tmpDir, 'html', 'background.risuhtml');

    expect(count).toBe(1);
    expect(fs.existsSync(backgroundPath)).toBe(true);
    expect(fs.readFileSync(backgroundPath, 'utf-8')).toBe('<div>test</div>');
  });

  it('phase6_extractBackgroundEmbedding returns 0 when embedding is empty', () => {
    const module = {
      name: 'no-embedding',
    };

    const count = phase6_extractBackgroundEmbedding(module, tmpDir);

    expect(count).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'html'))).toBe(false);
  });

  it('phase7_extractVariables writes canonical .risuvar content for module default variables', () => {
    const module = {
      name: 'module-name',
      defaultVariables: {
        hp: '100',
        ct_generatedHTML: ' ',
      },
    };

    const count = phase7_extractVariables(module, tmpDir);
    const variablePath = path.join(tmpDir, 'variables', 'module-name.risuvar');

    expect(count).toBe(1);
    expect(fs.existsSync(variablePath)).toBe(true);
    expect(parseVariableContent(fs.readFileSync(variablePath, 'utf-8'))).toEqual({
      hp: '100',
      ct_generatedHTML: ' ',
    });
  });

  it('phase8_extractModuleIdentity writes metadata fields without duplicating customModuleToggle', () => {
    const module = {
      name: 'module-name',
      description: 'module-description',
      id: 'module-id',
      namespace: 'module-namespace',
      lowLevelAccess: true,
      hideIcon: false,
      mcp: {
        server: 'mcp-server',
      },
      customModuleToggle: '<toggle>legacy</toggle>',
    };

    const count = phase8_extractModuleIdentity(module, tmpDir);
    const metadataPath = path.join(tmpDir, 'metadata.json');

    expect(count).toBe(1);
    expect(fs.existsSync(metadataPath)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      name: 'module-name',
      description: 'module-description',
      id: 'module-id',
      namespace: 'module-namespace',
      lowLevelAccess: true,
      hideIcon: false,
      mcp: {
        server: 'mcp-server',
      },
    });
    expect(metadata).not.toHaveProperty('customModuleToggle');
  });

  it('phase9_extractModuleToggle writes module toggle artifact when present', () => {
    const module = {
      name: 'module-toggle-name',
      customModuleToggle: '<toggle condition="1 == 1"/>',
    };

    const count = phase9_extractModuleToggle(module, tmpDir);
    const togglePath = path.join(tmpDir, 'toggle', 'module-toggle-name.risutoggle');

    expect(count).toBe(1);
    expect(fs.existsSync(togglePath)).toBe(true);
    expect(fs.readFileSync(togglePath, 'utf-8')).toBe('<toggle condition="1 == 1"/>');
  });

  it('runExtractWorkflow emits canonical artifacts and omits module.json', async () => {
    const filePath = path.join(tmpDir, 'source-module.json');
    const outDir = path.join(tmpDir, 'out');
    const payload = {
      type: 'risuModule',
      module: {
        name: 'workflow-module',
        description: 'workflow-description',
        id: 'workflow-id',
        lorebook: [
          {
            key: 'alpha',
            secondkey: '',
            content: 'Lore content',
            comment: 'Lore Entry',
            mode: 'normal',
            alwaysActive: false,
            selective: false,
            insertorder: 1,
            useRegex: false,
          },
        ],
        regex: [
          {
            comment: 'workflow-regex',
            type: 'editdisplay',
            in: 'in',
            out: 'out',
          },
        ],
        triggerscript: 'function init()\n  return true\nend',
        defaultVariables: {
          score: '10',
        },
        backgroundEmbedding: '<div>workflow</div>',
        customModuleToggle: '<toggle>workflow</toggle>',
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8');

    const exitCode = await runModuleExtractWorkflow([filePath, '--out', outDir]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'module.json'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'metadata.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lorebooks', 'Lore_Entry.risulorebook'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'regex', 'workflow-regex.risuregex'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lua', 'workflow-module.risulua'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'variables', 'workflow-module.risuvar'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'html', 'background.risuhtml'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'toggle', 'workflow-module.risutoggle'))).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(path.join(outDir, 'metadata.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(metadata).not.toHaveProperty('customModuleToggle');
  });

  it('isModuleFile only accepts .risum extension', () => {
    expect(isModuleFile('test.risum')).toBe(true);
    expect(isModuleFile('test.json')).toBe(false);
    expect(isModuleFile('test.charx')).toBe(false);
  });

  it('isModuleJson detects module JSON and rejects character card JSON', () => {
    const moduleJsonPath = path.join(tmpDir, 'module.json');
    const charxJsonPath = path.join(tmpDir, 'charx.json');

    fs.writeFileSync(
      moduleJsonPath,
      JSON.stringify({ type: 'risuModule', name: 'x', id: 'y' }),
      'utf-8',
    );
    fs.writeFileSync(
      charxJsonPath,
      JSON.stringify({ spec: 'chara_card_v3', data: { name: 'char' } }),
      'utf-8',
    );

    expect(Boolean(isModuleJson(moduleJsonPath))).toBe(true);
    expect(Boolean(isModuleJson(charxJsonPath))).toBe(false);
  });
});

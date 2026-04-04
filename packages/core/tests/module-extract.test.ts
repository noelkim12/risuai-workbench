import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  phase1_parseModule,
  phase2_extractLorebooks,
  phase3_extractRegex,
  phase4_extractTriggerLua,
  phase5_extractAssets,
  phase6_extractBackgroundEmbedding,
  phase7_extractModuleIdentity,
} from '@/cli/extract/module/phases';
import { isModuleFile } from '@/cli/extract/module/workflow';
import { isModuleJson } from '@/cli/extract/parsers';

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

  it('phase2_extractLorebooks writes lorebook files and indexes', () => {
    const module = {
      lorebook: [
        {
          name: 'entry1',
          keys: ['key1'],
          content: 'content1',
          comment: 'Entry 1',
        },
      ],
    };

    const count = phase2_extractLorebooks(module, tmpDir);
    const lorebooksDir = path.join(tmpDir, 'lorebooks');

    expect(count).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(lorebooksDir)).toBe(true);

    const files = fs.readdirSync(lorebooksDir);
    const dataJsonFiles = files.filter(
      (filename) => filename.endsWith('.json') && filename !== '_order.json' && filename !== 'manifest.json',
    );

    expect(dataJsonFiles.length).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(lorebooksDir, '_order.json'))).toBe(true);
    expect(fs.existsSync(path.join(lorebooksDir, 'manifest.json'))).toBe(true);
  });

  it('phase3_extractRegex writes regex files and order index', () => {
    const module = {
      regex: [
        {
          comment: 'test_regex',
          type: 'editdisplay',
          findRegex: 'foo',
          replaceString: 'bar',
        },
      ],
    };

    const count = phase3_extractRegex(module, tmpDir);
    const regexDir = path.join(tmpDir, 'regex');

    expect(count).toBe(1);
    expect(fs.existsSync(regexDir)).toBe(true);

    const files = fs.readdirSync(regexDir);
    const dataJsonFiles = files.filter((filename) => filename.endsWith('.json') && filename !== '_order.json');

    expect(dataJsonFiles.length).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(regexDir, '_order.json'))).toBe(true);
  });

  it('phase4_extractTriggerLua writes lua scripts from triggerlua effects', () => {
    const module = {
      trigger: [
        {
          comment: 'test_trigger',
          type: 'start',
          effect: [
            {
              type: 'triggerlua',
              code: 'print("hello")',
            },
          ],
        },
      ],
    };

    const count = phase4_extractTriggerLua(module, tmpDir);
    const luaDir = path.join(tmpDir, 'lua');

    expect(count).toBe(1);
    expect(fs.existsSync(luaDir)).toBe(true);

    const luaFiles = fs.readdirSync(luaDir).filter((filename) => filename.endsWith('.lua'));
    expect(luaFiles.length).toBe(1);

    const luaContent = fs.readFileSync(path.join(luaDir, luaFiles[0]), 'utf-8');
    expect(luaContent).toContain('-- Extracted from module trigger: test_trigger');
    expect(luaContent).toContain('print("hello")');
  });

  it('phase5_extractAssets skips extraction for JSON source format', () => {
    const module = {
      assets: [['asset_name', 'asset_uri', 'icon']],
    };

    const extracted = phase5_extractAssets(module, tmpDir, [Buffer.from('data')], 'json');

    expect(extracted).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'assets'))).toBe(false);
  });

  it('phase6_extractBackgroundEmbedding writes html file when embedding exists', () => {
    const module = {
      backgroundEmbedding: '<div>test</div>',
    };

    const count = phase6_extractBackgroundEmbedding(module, tmpDir);
    const backgroundPath = path.join(tmpDir, 'html', 'background.html');

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

  it('phase7_extractModuleIdentity writes metadata fields', () => {
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
    };

    const count = phase7_extractModuleIdentity(module, tmpDir);
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
  });

  it('isModuleFile only accepts .risum extension', () => {
    expect(isModuleFile('test.risum')).toBe(true);
    expect(isModuleFile('test.json')).toBe(false);
    expect(isModuleFile('test.charx')).toBe(false);
  });

  it('isModuleJson detects module JSON and rejects character card JSON', () => {
    const moduleJsonPath = path.join(tmpDir, 'module.json');
    const charxJsonPath = path.join(tmpDir, 'charx.json');

    fs.writeFileSync(moduleJsonPath, JSON.stringify({ type: 'risuModule', name: 'x', id: 'y' }), 'utf-8');
    fs.writeFileSync(charxJsonPath, JSON.stringify({ spec: 'chara_card_v3', data: { name: 'char' } }), 'utf-8');

    expect(Boolean(isModuleJson(moduleJsonPath))).toBe(true);
    expect(Boolean(isModuleJson(charxJsonPath))).toBe(false);
  });
});

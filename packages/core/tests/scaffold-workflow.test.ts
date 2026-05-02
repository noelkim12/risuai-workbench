import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runScaffoldWorkflow } from '../src/cli/scaffold/workflow';
import { RISUMODULE_FILENAME, RISUMODULE_KIND } from '../src/cli/shared/risumodule';

describe('src/cli scaffold workflow', () => {
  let tmpDir: string;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-workflow-test-'));
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('module scaffold', () => {
    it('emits .risumodule and canonical files with correct marker fields', () => {
      const outDir = path.join(tmpDir, 'rpg-module');
      const exitCode = runScaffoldWorkflow(['module', '--name', 'RPG Module', '--out', outDir]);

      expect(exitCode).toBe(0);

      // Generated files
      expect(fs.existsSync(path.join(outDir, RISUMODULE_FILENAME))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'lorebooks', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'toggle', 'RPG_Module.risutoggle'))).toBe(true);

      // No metadata.json
      expect(fs.existsSync(path.join(outDir, 'metadata.json'))).toBe(false);

      // Marker fields
      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, RISUMODULE_FILENAME), 'utf-8'));
      expect(manifest.kind).toBe(RISUMODULE_KIND);
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.sourceFormat).toBe('scaffold');
      expect(manifest.description).toBe('');
      expect(manifest.name).toBe('RPG Module');
      expect(manifest.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(manifest.modifiedAt).toBe(manifest.createdAt);
      expect(manifest.lowLevelAccess).toBe(false);
      expect(manifest.hideIcon).toBe(false);
      expect(manifest).not.toHaveProperty('namespace');

      // stdout next-step text
      const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
      const stdout = calls.map((c) => c.join(' ')).join('\n');
      expect(stdout).toContain('.risumodule');
      expect(stdout).not.toContain('metadata.json');
    });

    it('writes namespace into .risumodule when --namespace is provided', () => {
      const outDir = path.join(tmpDir, 'rpg-module-namespaced');
      const exitCode = runScaffoldWorkflow([
        'module',
        '--name',
        'RPG Module',
        '--namespace',
        'rpg',
        '--out',
        outDir,
      ]);

      expect(exitCode).toBe(0);

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, RISUMODULE_FILENAME), 'utf-8'));
      expect(manifest.name).toBe('RPG Module');
      expect(manifest.namespace).toBe('rpg');
    });
  });

  describe('preset scaffold', () => {
    it('still emits metadata.json and canonical preset files', () => {
      const outDir = path.join(tmpDir, 'my-preset');
      const exitCode = runScaffoldWorkflow(['preset', '--name', 'My Preset', '--out', outDir]);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'model.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'parameters.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'prompt_settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'instruct_settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'schema_settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'formatting_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'advanced.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'prompt_template', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'prompt_template', 'main.risuprompt'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'provider'))).toBe(true);

      const metadata = JSON.parse(fs.readFileSync(path.join(outDir, 'metadata.json'), 'utf-8'));
      expect(metadata.name).toBe('My Preset');
      expect(metadata.preset_type).toBe('risuai');
      expect(metadata.source_format).toBe('scaffold');
    });
  });

  describe('charx scaffold', () => {
    it('still emits .risuchar and canonical charx files', () => {
      const outDir = path.join(tmpDir, 'my-char');
      const exitCode = runScaffoldWorkflow([
        'charx',
        '--name',
        'My Character',
        '--creator',
        'TestAuthor',
        '--out',
        outDir,
      ]);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, '.risuchar'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'description.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'first_mes.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'system_prompt.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'replace_global_note.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'creator_notes.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'additional_text.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'alternate_greetings', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'lorebooks', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'variables', 'My_Character.risuvar'))).toBe(true);

      const risuchar = JSON.parse(fs.readFileSync(path.join(outDir, '.risuchar'), 'utf-8'));
      expect(risuchar.kind).toBe('risu.character');
      expect(risuchar.schemaVersion).toBe(1);
      expect(risuchar.sourceFormat).toBe('scaffold');
      expect(risuchar.name).toBe('My Character');
      expect(risuchar.creator).toBe('TestAuthor');
    });
  });
});

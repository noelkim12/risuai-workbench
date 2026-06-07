import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runScaffoldWorkflow } from '../src/cli/scaffold/workflow';
import { installDocsProviderBundle } from '../src/cli/shared/docs-provider';
import { RISUMODULE_FILENAME, RISUMODULE_KIND } from '../src/cli/shared/risumodule';

const RISULUA_SCAFFOLD_EXPECTED_FILES = [
  'lua/main.risulua',
  'lua/common/local_helpers.risulua',
  'lua/common/helpers.risulua',
  'lua/host_globals/global_functions.risulua',
  'lua/host_globals/duplicate_globals.risulua',
  'lua/host_globals/async_actions.risulua',
  'lua/button_actions/actions.risulua',
  'lua/runtime/start.risulua',
  'lua/runtime/input.risulua',
  'lua/runtime/output.risulua',
  'lua/runtime/button_click.risulua',
  'lua/runtime/listen_edit.risulua',
  'lua/runtime/listeners.risulua',
  'lua/handler_helpers/output_helpers.risulua',
  'lua/handler_helpers/input_helpers.risulua',
  'lua/handler_helpers/start_helpers.risulua',
  'lua/handler_helpers/button_click_helpers.risulua',
  'lua/handler_helpers/listen_edit_helpers.risulua',
  'lua/state/variable_store.risulua',
  'lua/prompts/instruction_store.risulua',
  'lua/domain/core.risulua',
  'lua/schema/constants.risulua',
  'lua/features/core.risulua',
  'legacy/original.risulua',
  'docs/risulua-split-plan.json',
  'docs/risulua-split-report.md',
  'docs/refactor-map.json',
  'docs/domain-candidates.json',
  'docs/risulua-export-manifest.json',
  'docs/risulua-button-action-index.json',
];

const DOCS_PROVIDER_EXPECTED_FILES = [
  'AGENTS.md',
  'docs/default-workspace-guide.md',
  'docs/extensions/risuchar.md',
  'docs/extensions/risumodule.md',
  'docs/refs/risuai-structured-output-pipeline-ko.md',
] as const;

function expectDocsProviderBundle(outDir: string): void {
  for (const filePath of DOCS_PROVIDER_EXPECTED_FILES) {
    expect(fs.existsSync(path.join(outDir, filePath))).toBe(true);
  }
}

function expectRisuLuaScaffoldStructure(outDir: string): void {
  for (const filePath of RISULUA_SCAFFOLD_EXPECTED_FILES) {
    expect(fs.existsSync(path.join(outDir, filePath))).toBe(true);
  }

  expect(fs.existsSync(path.join(outDir, 'lua', 'sections'))).toBe(true);
  expect(fs.existsSync(path.join(outDir, 'lua', 'preload'))).toBe(true);
  expect(fs.existsSync(path.join(outDir, 'dist'))).toBe(true);

  const starter = fs.readFileSync(path.join(outDir, 'lua', 'main.risulua'), 'utf-8');
  expect(starter).toContain('function onStart()');
  expect(starter).toContain('local runtime_start = require("runtime.start")');
  expect(starter).toContain('local button_actions_actions = require("button_actions.actions")');
  expect(starter).toContain('return runtime_start.onStart()');
  expect(starter).not.toContain('dofile(');
  expect(starter).not.toContain('loadfile(');

  const runtimeStart = fs.readFileSync(
    path.join(outDir, 'lua', 'runtime', 'start.risulua'),
    'utf-8',
  );
  expect(runtimeStart).toContain('local M = {}');
  expect(runtimeStart).toContain('return M');

  const plan = JSON.parse(
    fs.readFileSync(path.join(outDir, 'docs', 'risulua-split-plan.json'), 'utf-8'),
  );
  expect(plan.entryPath).toBe('lua/main.risulua');
  expect(plan.distBuildStrategy).toBe('concat-build-time-require');
}

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

      // Non-Lua module files
      expect(fs.existsSync(path.join(outDir, 'assets', 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'html', 'background.risuhtml'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'variables', 'RPG_Module.risuvar'))).toBe(true);

      // Modular Lua structure is the default
      expectRisuLuaScaffoldStructure(outDir);
      expectDocsProviderBundle(outDir);

      // No metadata.json
      expect(fs.existsSync(path.join(outDir, 'metadata.json'))).toBe(false);

      // Marker fields
      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, RISUMODULE_FILENAME), 'utf-8'));
      expect(manifest.kind).toBe(RISUMODULE_KIND);
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.sourceFormat).toBe('scaffold');
      expect(manifest.image).toBeNull();
      expect(manifest.description).toBe('');
      expect(manifest.name).toBe('RPG Module');
      expect(manifest.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
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

    describe('risulua scaffold mode', () => {
      it('risulua scaffold modular structure', () => {
        const outDir = path.join(tmpDir, 'modular-module');
        const exitCode = runScaffoldWorkflow([
          'module',
          '--name',
          'Modular Module',
          '--out',
          outDir,
          '--risulua-mode',
          'modular',
        ]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(path.join(outDir, RISUMODULE_FILENAME))).toBe(true);
        expectRisuLuaScaffoldStructure(outDir);
        expect(fs.existsSync(path.join(outDir, 'lua', 'manifest.json'))).toBe(false);
        expect(fs.existsSync(path.join(outDir, 'risulua.json'))).toBe(false);
        expect(fs.existsSync(path.join(outDir, 'dist', 'Modular_Module.risulua'))).toBe(false);
      });
    });
  });

  describe('docs-provider bundle', () => {
    it('does not overwrite existing workspace docs by default', () => {
      const outDir = path.join(tmpDir, 'existing-docs-workspace');
      const agentsPath = path.join(outDir, 'AGENTS.md');
      fs.mkdirSync(path.dirname(agentsPath), { recursive: true });
      fs.writeFileSync(agentsPath, 'custom workspace guidance', 'utf-8');

      const copiedCount = installDocsProviderBundle({ outputRoot: outDir });

      expect(copiedCount).toBeGreaterThan(0);
      expect(fs.readFileSync(agentsPath, 'utf-8')).toBe('custom workspace guidance');
      expectDocsProviderBundle(outDir);
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
      expectDocsProviderBundle(outDir);

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
      expect(fs.existsSync(path.join(outDir, 'character', 'replace_global_note.risutext'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(outDir, 'character', 'creator_notes.risutext'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'character', 'additional_text.risutext'))).toBe(true);
      expect(
        fs.existsSync(path.join(outDir, 'character', 'alternate_greetings', '_order.json')),
      ).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'lorebooks', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'variables', 'My_Character.risuvar'))).toBe(true);

      // Modular is now the default — charx also gets lua structure
      expectRisuLuaScaffoldStructure(outDir);
      expectDocsProviderBundle(outDir);

      const risuchar = JSON.parse(fs.readFileSync(path.join(outDir, '.risuchar'), 'utf-8'));
      expect(risuchar.kind).toBe('risu.character');
      expect(risuchar.schemaVersion).toBe(1);
      expect(risuchar.sourceFormat).toBe('scaffold');
      expect(risuchar.name).toBe('My Character');
      expect(risuchar.creator).toBe('TestAuthor');
    });

    it('risulua scaffold modular structure for charx', () => {
      const outDir = path.join(tmpDir, 'modular-charx');
      const exitCode = runScaffoldWorkflow([
        'charx',
        '--name',
        'Modular Character',
        '--creator',
        'TestAuthor',
        '--out',
        outDir,
        '--risulua-mode',
        'modular',
      ]);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, '.risuchar'))).toBe(true);
      expectRisuLuaScaffoldStructure(outDir);
      expect(fs.existsSync(path.join(outDir, 'lua', 'manifest.json'))).toBe(false);
      expect(fs.existsSync(path.join(outDir, 'risulua.json'))).toBe(false);
      expect(fs.existsSync(path.join(outDir, 'dist', 'Modular_Character.risulua'))).toBe(false);
    });
  });
});

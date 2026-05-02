import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RISUMODULE_FILENAME,
  RISUMODULE_KIND,
  RISUMODULE_SCHEMA_URL,
  RISUMODULE_SCHEMA_VERSION,
  buildExtractRisumoduleManifest,
  buildScaffoldRisumoduleManifest,
  readRisumoduleManifest,
  parseRisumoduleManifest,
  applyRisumoduleToModule,
} from '../src/cli/shared/risumodule';

describe('risumodule manifest helper', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risumodule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports correct constants', () => {
    expect(RISUMODULE_FILENAME).toBe('.risumodule');
    expect(RISUMODULE_KIND).toBe('risu.module');
    expect(RISUMODULE_SCHEMA_URL).toBe('https://risuai-workbench.dev/schemas/risumodule.schema.json');
    expect(RISUMODULE_SCHEMA_VERSION).toBe(1);
  });

  describe('buildExtractRisumoduleManifest', () => {
    it('builds a minimal extract manifest with null timestamps', () => {
      const module = { name: 'Test', id: 'test-id', description: 'desc' };
      const manifest = buildExtractRisumoduleManifest(module, 'json');

      expect(manifest.$schema).toBe(RISUMODULE_SCHEMA_URL);
      expect(manifest.kind).toBe(RISUMODULE_KIND);
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.id).toBe('test-id');
      expect(manifest.name).toBe('Test');
      expect(manifest.description).toBe('desc');
      expect(manifest.createdAt).toBeNull();
      expect(manifest.modifiedAt).toBeNull();
      expect(manifest.sourceFormat).toBe('json');
      expect(manifest).not.toHaveProperty('namespace');
      expect(manifest).not.toHaveProperty('lowLevelAccess');
      expect(manifest).not.toHaveProperty('hideIcon');
      expect(manifest).not.toHaveProperty('mcp');
      expect(manifest).not.toHaveProperty('cjs');
    });

    it('preserves risum sourceFormat', () => {
      const manifest = buildExtractRisumoduleManifest({ name: 'x', id: 'y' }, 'risum');
      expect(manifest.sourceFormat).toBe('risum');
    });

    it('copies optional packable fields only when type-valid', () => {
      const module = {
        name: 'Full',
        id: 'full-id',
        description: 'full desc',
        namespace: 'ns',
        cjs: 'cjs-val',
        lowLevelAccess: true,
        hideIcon: false,
        mcp: { server: 'srv' },
      };
      const manifest = buildExtractRisumoduleManifest(module, 'json');

      expect(manifest.namespace).toBe('ns');
      expect(manifest.cjs).toBe('cjs-val');
      expect(manifest.lowLevelAccess).toBe(true);
      expect(manifest.hideIcon).toBe(false);
      expect(manifest.mcp).toEqual({ server: 'srv' });
    });

    it('skips optional fields with wrong types', () => {
      const module = {
        name: 'Partial',
        id: 'partial-id',
        description: '',
        namespace: 123,
        cjs: true,
        lowLevelAccess: 'yes',
        hideIcon: 0,
        mcp: 'not-an-object',
      };
      const manifest = buildExtractRisumoduleManifest(module, 'json');

      expect(manifest).not.toHaveProperty('namespace');
      expect(manifest).not.toHaveProperty('cjs');
      expect(manifest).not.toHaveProperty('lowLevelAccess');
      expect(manifest).not.toHaveProperty('hideIcon');
      expect(manifest).not.toHaveProperty('mcp');
    });
  });

  describe('buildScaffoldRisumoduleManifest', () => {
    it('builds a scaffold manifest with nowIso timestamps', () => {
      const now = new Date().toISOString();
      const manifest = buildScaffoldRisumoduleManifest({
        id: 'scaffold-id',
        name: 'Scaffold',
        nowIso: now,
      });

      expect(manifest.$schema).toBe(RISUMODULE_SCHEMA_URL);
      expect(manifest.kind).toBe(RISUMODULE_KIND);
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.id).toBe('scaffold-id');
      expect(manifest.name).toBe('Scaffold');
      expect(manifest.description).toBe('');
      expect(manifest.createdAt).toBe(now);
      expect(manifest.modifiedAt).toBe(now);
      expect(manifest.sourceFormat).toBe('scaffold');
      expect(manifest.lowLevelAccess).toBe(false);
      expect(manifest.hideIcon).toBe(false);
      expect(manifest).not.toHaveProperty('namespace');
    });

    it('includes namespace only when scaffold params provide a string value', () => {
      const withNamespace = buildScaffoldRisumoduleManifest({
        id: 'scaffold-id',
        name: 'Scaffold',
        namespace: 'rpg',
        nowIso: '2026-04-30T00:00:00.000Z',
      });
      const withoutNamespace = buildScaffoldRisumoduleManifest({
        id: 'scaffold-id',
        name: 'Scaffold',
        nowIso: '2026-04-30T00:00:00.000Z',
      });

      expect(withNamespace.namespace).toBe('rpg');
      expect(withoutNamespace).not.toHaveProperty('namespace');
    });
  });

  describe('readRisumoduleManifest', () => {
    it('reads and parses existing .risumodule', () => {
      const content = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'read-id',
        name: 'Read',
        description: 'read desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      fs.writeFileSync(path.join(tmpDir, '.risumodule'), content, 'utf-8');

      const result = readRisumoduleManifest(tmpDir);
      expect(result.id).toBe('read-id');
      expect(result.name).toBe('Read');
      expect(result.description).toBe('read desc');
      expect(result.createdAt).toBeNull();
      expect(result.modifiedAt).toBeNull();
    });

    it('throws deterministic error when .risumodule is missing', () => {
      expect(() => readRisumoduleManifest(tmpDir)).toThrowError(
        `Missing .risumodule: ${path.join(tmpDir, '.risumodule')}`,
      );
    });
  });

  describe('parseRisumoduleManifest', () => {
    it('parses a valid minimal manifest', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      const manifest = parseRisumoduleManifest(text, '/tmp/.risumodule');

      expect(manifest.id).toBe('id');
      expect(manifest.name).toBe('Name');
      expect(manifest.createdAt).toBeNull();
      expect(manifest.modifiedAt).toBeNull();
    });

    it('parses a valid manifest with optional fields', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id2',
        name: 'Name2',
        description: 'Desc2',
        createdAt: '2024-01-01T00:00:00.000Z',
        modifiedAt: '2024-01-02T00:00:00.000Z',
        sourceFormat: 'scaffold',
        namespace: 'ns',
        cjs: 'cjs-val',
        lowLevelAccess: true,
        hideIcon: false,
        mcp: { server: 'srv' },
      });
      const manifest = parseRisumoduleManifest(text, '/tmp/.risumodule');

      expect(manifest.namespace).toBe('ns');
      expect(manifest.cjs).toBe('cjs-val');
      expect(manifest.lowLevelAccess).toBe(true);
      expect(manifest.hideIcon).toBe(false);
      expect(manifest.mcp).toEqual({ server: 'srv' });
    });

    it('rejects invalid JSON with exact phrase', () => {
      expect(() => parseRisumoduleManifest('not-json', '/tmp/.risumodule')).toThrowError(
        'Invalid .risumodule JSON: /tmp/.risumodule',
      );
    });

    it('rejects non-object JSON', () => {
      expect(() => parseRisumoduleManifest('[]', '/tmp/.risumodule')).toThrowError(
        'Invalid .risumodule: expected object at /tmp/.risumodule',
      );
      expect(() => parseRisumoduleManifest('"string"', '/tmp/.risumodule')).toThrowError(
        'Invalid .risumodule: expected object at /tmp/.risumodule',
      );
    });

    it('rejects missing required fields', () => {
      const text = JSON.stringify({ kind: RISUMODULE_KIND });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        /missing required fields.*\$schema.*schemaVersion.*id.*name.*description.*createdAt.*modifiedAt.*sourceFormat/,
      );
    });

    it('rejects wrong $schema value', () => {
      const text = JSON.stringify({
        $schema: 'https://wrong.url/schema.json',
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        `.risumodule $schema must be "${RISUMODULE_SCHEMA_URL}", got "https://wrong.url/schema.json" at /tmp/.risumodule`,
      );
    });

    it('rejects non-string $schema', () => {
      const text = JSON.stringify({
        $schema: 123,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        `.risumodule $schema must be "${RISUMODULE_SCHEMA_URL}", got 123 at /tmp/.risumodule`,
      );
    });

    it('rejects wrong kind', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: 'wrong.kind',
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule kind must be "risu.module", got "wrong.kind" at /tmp/.risumodule',
      );
    });

    it('rejects unsupported schemaVersion', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 99,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule schemaVersion must be 1, got 99 at /tmp/.risumodule',
      );
    });

    it('rejects non-number schemaVersion', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: '1',
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule schemaVersion must be 1, got "1" at /tmp/.risumodule',
      );
    });

    it('rejects non-string id', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 123,
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule id must be a string, got 123 at /tmp/.risumodule',
      );
    });

    it('rejects non-string name', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: true,
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule name must be a string, got true at /tmp/.risumodule',
      );
    });

    it('rejects non-string description', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: {},
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule description must be a string, got {} at /tmp/.risumodule',
      );
    });

    it('rejects invalid sourceFormat', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'invalid',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule sourceFormat must be one of: risum, json, scaffold, got "invalid" at /tmp/.risumodule',
      );
    });

    it('rejects customModuleToggle presence with toggle/*.risutoggle reference', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: null,
        sourceFormat: 'json',
        customModuleToggle: '<toggle/>',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        /customModuleToggle.*toggle\/\*\.risutoggle/,
      );
    });

    it('rejects non-string non-null timestamps', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: 123,
        modifiedAt: null,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule createdAt/modifiedAt must be string or null at /tmp/.risumodule',
      );
    });

    it('rejects non-string non-null modifiedAt', () => {
      const text = JSON.stringify({
        $schema: RISUMODULE_SCHEMA_URL,
        kind: RISUMODULE_KIND,
        schemaVersion: 1,
        id: 'id',
        name: 'Name',
        description: 'Desc',
        createdAt: null,
        modifiedAt: true,
        sourceFormat: 'json',
      });
      expect(() => parseRisumoduleManifest(text, '/tmp/.risumodule')).toThrowError(
        '.risumodule createdAt/modifiedAt must be string or null at /tmp/.risumodule',
      );
    });
  });

  describe('applyRisumoduleToModule', () => {
    it('copies only packable string fields', () => {
      const moduleObj: Record<string, unknown> = {};
      const manifest = parseRisumoduleManifest(
        JSON.stringify({
          $schema: RISUMODULE_SCHEMA_URL,
          kind: RISUMODULE_KIND,
          schemaVersion: 1,
          id: 'aid',
          name: 'A',
          description: 'B',
          createdAt: null,
          modifiedAt: null,
          sourceFormat: 'json',
          namespace: 'ns',
          cjs: 'cjs-val',
        }),
        '/tmp/.risumodule',
      );

      applyRisumoduleToModule(moduleObj, manifest);

      expect(moduleObj.name).toBe('A');
      expect(moduleObj.description).toBe('B');
      expect(moduleObj.id).toBe('aid');
      expect(moduleObj.namespace).toBe('ns');
      expect(moduleObj.cjs).toBe('cjs-val');
    });

    it('copies boolean and object fields', () => {
      const moduleObj: Record<string, unknown> = {};
      const manifest = parseRisumoduleManifest(
        JSON.stringify({
          $schema: RISUMODULE_SCHEMA_URL,
          kind: RISUMODULE_KIND,
          schemaVersion: 1,
          id: 'id',
          name: 'Name',
          description: 'Desc',
          createdAt: null,
          modifiedAt: null,
          sourceFormat: 'json',
          lowLevelAccess: true,
          hideIcon: false,
          mcp: { server: 's' },
        }),
        '/tmp/.risumodule',
      );

      applyRisumoduleToModule(moduleObj, manifest);

      expect(moduleObj.lowLevelAccess).toBe(true);
      expect(moduleObj.hideIcon).toBe(false);
      expect(moduleObj.mcp).toEqual({ server: 's' });
    });

    it('does not copy marker-only fields ($schema, kind, schemaVersion, createdAt, modifiedAt, sourceFormat)', () => {
      const moduleObj: Record<string, unknown> = {};
      const manifest = parseRisumoduleManifest(
        JSON.stringify({
          $schema: RISUMODULE_SCHEMA_URL,
          kind: RISUMODULE_KIND,
          schemaVersion: 1,
          id: 'id',
          name: 'Name',
          description: 'Desc',
          createdAt: '2024-01-01T00:00:00.000Z',
          modifiedAt: '2024-01-02T00:00:00.000Z',
          sourceFormat: 'scaffold',
        }),
        '/tmp/.risumodule',
      );

      applyRisumoduleToModule(moduleObj, manifest);

      expect(moduleObj).not.toHaveProperty('$schema');
      expect(moduleObj).not.toHaveProperty('kind');
      expect(moduleObj).not.toHaveProperty('schemaVersion');
      expect(moduleObj).not.toHaveProperty('createdAt');
      expect(moduleObj).not.toHaveProperty('modifiedAt');
      expect(moduleObj).not.toHaveProperty('sourceFormat');
    });

    it('does not overwrite existing fields with undefined optional values', () => {
      const moduleObj: Record<string, unknown> = { namespace: 'existing', lowLevelAccess: true };
      const manifest = parseRisumoduleManifest(
        JSON.stringify({
          $schema: RISUMODULE_SCHEMA_URL,
          kind: RISUMODULE_KIND,
          schemaVersion: 1,
          id: 'id',
          name: 'Name',
          description: 'Desc',
          createdAt: null,
          modifiedAt: null,
          sourceFormat: 'json',
        }),
        '/tmp/.risumodule',
      );

      applyRisumoduleToModule(moduleObj, manifest);

      // Optional fields absent from manifest should not be copied,
      // and existing fields should remain untouched.
      expect(moduleObj.namespace).toBe('existing');
      expect(moduleObj.lowLevelAccess).toBe(true);
    });
  });
});

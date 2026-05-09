import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  RISULUA_RECOVERY_FLAG,
  RisuLuaRecoveryError,
  collectRisuLuaRecoveryFiles,
  decodeRisuLuaRecoveryBlock,
  encodeRisuLuaRecoveryBlock,
  parseRisuLuaRecoveryMode,
  removeRisuLuaRecoveryBlock,
  restoreRisuLuaRecoveryFiles,
} from '../src/cli/shared';

function encodeRawRecoveryManifest(value: unknown): string {
  return `--[=[#risulua-bundle-manifest-v1\n${gzipSync(Buffer.from(JSON.stringify(value), 'utf8')).toString('base64')}\n]=]\n`;
}

describe('RisuLua recovery CLI parsing', () => {
  it('defaults to none when the flag is omitted', () => {
    const parsed = parseRisuLuaRecoveryMode(['--in', 'workspace']);

    expect(parsed.mode).toBe('none');
    expect(parsed.strippedArgv).toEqual(['--in', 'workspace']);
  });

  it('parses full-source and strips the recovery flag', () => {
    const parsed = parseRisuLuaRecoveryMode([
      '--in',
      'workspace',
      RISULUA_RECOVERY_FLAG,
      'full-source',
      '--out',
      'packed.charx',
    ]);

    expect(parsed.mode).toBe('full-source');
    expect(parsed.strippedArgv).toEqual(['--in', 'workspace', '--out', 'packed.charx']);
  });

  it('rejects unsupported recovery values', () => {
    expect(() => parseRisuLuaRecoveryMode([RISULUA_RECOVERY_FLAG, 'manifest-only'])).toThrow(
      'Invalid --risulua-recovery value: "manifest-only". Must be "none" or "full-source".',
    );
  });

  it('rejects a missing recovery value', () => {
    expect(() => parseRisuLuaRecoveryMode([RISULUA_RECOVERY_FLAG])).toThrow(
      'Invalid --risulua-recovery value: "". Must be "none" or "full-source".',
    );
  });
});

describe('RisuLua recovery manifest codec', () => {
  it('round-trips a compressed base64 manifest block and removes it from Lua code', () => {
    const manifest = {
      schema: 'risulua.bundle-recovery' as const,
      version: 1 as const,
      mode: 'full-source' as const,
      files: [
        {
          path: 'lua/main.risulua',
          content: 'return require("common.helper")\n',
          sha256: 'placeholder-sha',
        },
      ],
    };

    const block = encodeRisuLuaRecoveryBlock(manifest);
    expect(block).toContain('--[=[#risulua-bundle-manifest-v1');
    expect(block).toContain(']=]');

    const lua = `return true\n${block}`;
    const decoded = decodeRisuLuaRecoveryBlock(lua);

    expect(decoded?.manifest.files[0]?.path).toBe('lua/main.risulua');
    expect(removeRisuLuaRecoveryBlock(lua)).toBe('return true\n');
  });

  it('returns null when no recovery block is present', () => {
    expect(decodeRisuLuaRecoveryBlock('return true\n')).toBeNull();
  });

  it('rejects invalid manifest schema, version, mode, files, and paths', () => {
    const valid = {
      schema: 'risulua.bundle-recovery',
      version: 1,
      mode: 'full-source',
      files: [],
    };

    for (const invalid of [
      { ...valid, schema: 'other' },
      { ...valid, version: 2 },
      { ...valid, mode: 'manifest-only' },
      { ...valid, files: 'nope' },
      { ...valid, files: [{ path: '../escape.risulua', content: '', sha256: '' }] },
      { ...valid, files: [{ path: '/tmp/escape.risulua', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'lua\\main.risulua', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'lua/../main.risulua', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'lua/', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'docs/', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'legacy/', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'lua/common/', content: '', sha256: '' }] },
      { ...valid, files: [{ path: 'private/main.risulua', content: '', sha256: '' }] },
    ]) {
      expect(() => decodeRisuLuaRecoveryBlock(encodeRawRecoveryManifest(invalid))).toThrow(RisuLuaRecoveryError);
    }
  });

  it('collects allowed recovery files in deterministic path order', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-recovery-collect-'));
    fs.mkdirSync(path.join(root, 'lua', 'common'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'legacy'), { recursive: true });
    fs.mkdirSync(path.join(root, 'private'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lua', 'main.risulua'), 'local h = require("common.helper")\n', 'utf8');
    fs.writeFileSync(path.join(root, 'lua', 'common', 'helper.risulua'), 'return { value = 1 }\n', 'utf8');
    fs.writeFileSync(path.join(root, 'docs', 'refactor-map.json'), '{"version":1}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'legacy', 'original.risulua'), 'return true\n', 'utf8');
    fs.writeFileSync(path.join(root, 'private', 'secret.txt'), 'nope\n', 'utf8');

    try {
      const files = collectRisuLuaRecoveryFiles({ rootDir: root });

      expect(files.map((file) => file.path)).toEqual([
        'docs/refactor-map.json',
        'legacy/original.risulua',
        'lua/common/helper.risulua',
        'lua/main.risulua',
      ]);
      expect(files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores recovery files and rejects unsafe paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-recovery-restore-'));
    try {
      restoreRisuLuaRecoveryFiles({
        outputRoot: root,
        files: [
          {
            path: 'lua/main.risulua',
            content: 'return true\n',
            sha256: 'ea247e820cda9e68c4b2268fe9ff4f376a32f82a422a8c0cdd274ce08048cc34',
          },
        ],
      });

      expect(fs.readFileSync(path.join(root, 'lua', 'main.risulua'), 'utf8')).toBe('return true\n');
      expect(() => restoreRisuLuaRecoveryFiles({
        outputRoot: root,
        files: [
          {
            path: '../escape.risulua',
            content: 'return false\n',
            sha256: 'unused',
          },
        ],
      })).toThrow(RisuLuaRecoveryError);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks hashes before deleting existing output roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-recovery-hash-'));
    fs.mkdirSync(path.join(root, 'lua'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lua', 'existing.risulua'), 'keep me\n', 'utf8');

    try {
      expect(() => restoreRisuLuaRecoveryFiles({
        outputRoot: root,
        files: [{ path: 'lua/main.risulua', content: 'return true\n', sha256: 'bad-hash' }],
      })).toThrow(RisuLuaRecoveryError);
      expect(fs.readFileSync(path.join(root, 'lua', 'existing.risulua'), 'utf8')).toBe('keep me\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects directory-looking paths before deleting existing output roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-recovery-dir-entry-'));
    fs.mkdirSync(path.join(root, 'lua'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lua', 'existing.risulua'), 'keep me\n', 'utf8');

    try {
      expect(() => restoreRisuLuaRecoveryFiles({
        outputRoot: root,
        files: [
          {
            path: 'lua/',
            content: 'malformed directory entry\n',
            sha256: 'e5eec75a8721fa18bd75fb58fa81d151c2da36045caef3298083c570a3742544',
          },
        ],
      })).toThrow(RisuLuaRecoveryError);
      expect(fs.readFileSync(path.join(root, 'lua', 'existing.risulua'), 'utf8')).toBe('keep me\n');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

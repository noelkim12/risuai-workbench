import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  wipeArtifactDir,
  writeArtifactFiles,
  writeSchemaIfChanged,
  appendLogEntry,
  rewriteIndexArtifactsSection,
} from '@/cli/analyze/shared/wiki/write-protect';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-write-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('wiki/write-protect', () => {
  describe('wipeArtifactDir', () => {
    it('removes all files under the target _generated dir', () => {
      const target = path.join(tmpRoot, 'artifacts/char_a/_generated');
      fs.mkdirSync(path.join(target, 'lorebook'), { recursive: true });
      fs.writeFileSync(path.join(target, 'overview.md'), 'x');
      fs.writeFileSync(path.join(target, 'lorebook/강유라.md'), 'y');

      wipeArtifactDir(target);

      expect(fs.existsSync(target)).toBe(false);
    });

    it('refuses to operate on a path not ending in _generated', () => {
      const unsafe = path.join(tmpRoot, 'artifacts/char_a');
      fs.mkdirSync(unsafe, { recursive: true });
      expect(() => wipeArtifactDir(unsafe)).toThrow(/_generated/);
    });

    it('refuses to operate on a non-existent path silently', () => {
      const missing = path.join(tmpRoot, 'does-not-exist/_generated');
      expect(() => wipeArtifactDir(missing)).not.toThrow();
    });
  });

  describe('writeArtifactFiles', () => {
    it('creates directories and writes every file', () => {
      const target = path.join(tmpRoot, 'artifacts/char_a/_generated');
      writeArtifactFiles(target, [
        { relativePath: 'overview.md', content: '# Overview' },
        { relativePath: 'lorebook/강유라.md', content: '# 강유라' },
      ]);
      expect(fs.readFileSync(path.join(target, 'overview.md'), 'utf8')).toBe('# Overview');
      expect(fs.readFileSync(path.join(target, 'lorebook/강유라.md'), 'utf8')).toBe('# 강유라');
    });
  });

  describe('writeSchemaIfChanged', () => {
    it('writes when file does not exist', () => {
      const target = path.join(tmpRoot, 'SCHEMA.md');
      const result = writeSchemaIfChanged(target, 'hello');
      expect(result).toBe('written');
      expect(fs.readFileSync(target, 'utf8')).toBe('hello');
    });

    it('skips rewrite when content is identical', () => {
      const target = path.join(tmpRoot, 'SCHEMA.md');
      fs.writeFileSync(target, 'hello');
      const mtimeBefore = fs.statSync(target).mtimeMs;

      const result = writeSchemaIfChanged(target, 'hello');
      expect(result).toBe('unchanged');

      const mtimeAfter = fs.statSync(target).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);
    });

    it('rewrites when content differs', () => {
      const target = path.join(tmpRoot, 'SCHEMA.md');
      fs.writeFileSync(target, 'hello');
      const result = writeSchemaIfChanged(target, 'world');
      expect(result).toBe('written');
      expect(fs.readFileSync(target, 'utf8')).toBe('world');
    });
  });

  describe('appendLogEntry', () => {
    it('creates log file with entry if missing', () => {
      const target = path.join(tmpRoot, '_log.md');
      appendLogEntry(target, '## [2026-04-15] analyze | char_a\n- files: 10\n');
      expect(fs.readFileSync(target, 'utf8')).toContain('## [2026-04-15] analyze | char_a');
    });

    it('appends to existing log', () => {
      const target = path.join(tmpRoot, '_log.md');
      fs.writeFileSync(target, '## [2026-04-14] analyze | char_a\n- old\n');
      appendLogEntry(target, '## [2026-04-15] analyze | char_b\n- new\n');
      const content = fs.readFileSync(target, 'utf8');
      expect(content).toContain('## [2026-04-14]');
      expect(content).toContain('## [2026-04-15]');
      expect(content.indexOf('2026-04-14')).toBeLessThan(content.indexOf('2026-04-15'));
    });
  });

  describe('rewriteIndexArtifactsSection', () => {
    it('writes a fresh file with markers when missing', () => {
      const target = path.join(tmpRoot, '_index.md');
      rewriteIndexArtifactsSection(target, '### Characters\n- [char_a](...)\n');
      const content = fs.readFileSync(target, 'utf8');
      expect(content).toContain('<!-- BEGIN:artifacts -->');
      expect(content).toContain('### Characters');
      expect(content).toContain('<!-- END:artifacts -->');
    });

    it('replaces content between markers, preserving outside text', () => {
      const target = path.join(tmpRoot, '_index.md');
      fs.writeFileSync(
        target,
        [
          '# Workspace Wiki Index',
          '',
          '## Artifacts',
          '',
          '<!-- BEGIN:artifacts -->',
          '(old content)',
          '<!-- END:artifacts -->',
          '',
          '## Domain reference',
          'custom user note — must survive',
        ].join('\n'),
      );

      rewriteIndexArtifactsSection(target, '### Characters\n- [char_new](...)\n');

      const content = fs.readFileSync(target, 'utf8');
      expect(content).not.toContain('(old content)');
      expect(content).toContain('char_new');
      expect(content).toContain('custom user note — must survive');
    });
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadWorkspaceConfig } from '@/cli/analyze/shared/wiki/workspace/workspace-yaml';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-yaml-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('wiki/workspace-yaml', () => {
  it('returns empty config when file is missing', () => {
    const cfg = loadWorkspaceConfig(tmpRoot);
    expect(cfg.artifacts).toEqual([]);
    expect(cfg.companions).toEqual({});
    expect(cfg.labels).toEqual({});
  });

  it('parses a full workspace.yaml', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'workspace.yaml'),
      [
        'artifacts:',
        '  - path: ./character_foo',
        '    type: character',
        '  - path: ./module_dlc',
        '    type: module',
        'companions:',
        '  char_foo:',
        '    - module_dlc',
        'labels:',
        '  char_foo: "Main card"',
        '  module_dlc: "DLC"',
      ].join('\n'),
    );
    const cfg = loadWorkspaceConfig(tmpRoot);
    expect(cfg.artifacts).toHaveLength(2);
    expect(cfg.artifacts[0]).toEqual({ path: './character_foo', type: 'character' });
    expect(cfg.companions.char_foo).toEqual(['module_dlc']);
    expect(cfg.labels.char_foo).toBe('Main card');
    expect(cfg.labels.module_dlc).toBe('DLC');
  });

  it('ignores unknown top-level fields', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'workspace.yaml'),
      ['unknown: 42', 'artifacts: []'].join('\n'),
    );
    const cfg = loadWorkspaceConfig(tmpRoot);
    expect(cfg.artifacts).toEqual([]);
  });

  it('rejects invalid artifact type with a descriptive error', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'workspace.yaml'),
      ['artifacts:', '  - path: ./x', '    type: bogus'].join('\n'),
    );
    expect(() => loadWorkspaceConfig(tmpRoot)).toThrow(/type/);
  });

  it('throws on malformed YAML', () => {
    fs.writeFileSync(path.join(tmpRoot, 'workspace.yaml'), 'artifacts: [unclosed');
    expect(() => loadWorkspaceConfig(tmpRoot)).toThrow();
  });
});

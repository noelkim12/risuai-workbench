import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cliPath = path.join(process.cwd(), 'bin', 'risu-core.js');

describe('packages/core CLI smoke', () => {
  it('shows help for --help', () => {
    const result = spawnSync('node', [cliPath, '--help'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('risu-core CLI');
    expect(result.stdout).toContain('extract');
  });

  it('returns exit code 1 for an unknown command', () => {
    const result = spawnSync('node', [cliPath, 'not-a-command'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });
});

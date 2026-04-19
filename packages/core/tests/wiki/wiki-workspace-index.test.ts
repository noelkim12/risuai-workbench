import { describe, expect, it } from 'vitest';
import { buildArtifactsSection } from '@/cli/analyze/shared/wiki/workspace/index-md';
import { formatLogEntry } from '@/cli/analyze/shared/wiki/workspace/log';
import { EMPTY_WORKSPACE_CONFIG } from '@/cli/analyze/shared/wiki/types';

describe('wiki/workspace/index-md', () => {
  it('groups artifacts by type and uses literal labels', () => {
    const section = buildArtifactsSection(
      [
        { key: 'char_foo', type: 'character' },
        { key: 'module_dlc', type: 'module' },
        { key: 'preset_p', type: 'preset' },
      ],
      { ...EMPTY_WORKSPACE_CONFIG, labels: { char_foo: 'Main card', module_dlc: 'DLC' } },
    );
    expect(section).toContain('### Characters');
    expect(section).toContain('[char_foo](artifacts/char_foo/_generated/overview.md) — _"Main card"_');
    expect(section).toContain('### Modules');
    expect(section).toContain('[module_dlc](artifacts/module_dlc/_generated/overview.md) — _"DLC"_');
    expect(section).toContain('### Presets');
    expect(section).toContain('[preset_p](artifacts/preset_p/_generated/overview.md)');
  });

  it('omits label suffix when absent', () => {
    const section = buildArtifactsSection(
      [{ key: 'char_foo', type: 'character' }],
      EMPTY_WORKSPACE_CONFIG,
    );
    expect(section).toContain('[char_foo](artifacts/char_foo/_generated/overview.md)');
    expect(section).not.toContain('—');
  });

  it('shows "(none)" for empty category', () => {
    const section = buildArtifactsSection([{ key: 'char_foo', type: 'character' }], EMPTY_WORKSPACE_CONFIG);
    expect(section).toContain('### Modules');
    expect(section).toContain('(none)');
  });
});

describe('wiki/workspace/log', () => {
  it('formats a single-artifact log entry', () => {
    const entry = formatLogEntry({
      date: '2026-04-15',
      operation: 'analyze',
      scope: 'char_foo',
      bullets: ['regenerated _generated/ (42 files)', 'SCHEMA.md: no change'],
    });
    expect(entry).toContain('## [2026-04-15] analyze | char_foo');
    expect(entry).toContain('- regenerated _generated/ (42 files)');
    expect(entry).toContain('- SCHEMA.md: no change');
  });

  it('formats an --all log entry', () => {
    const entry = formatLogEntry({
      date: '2026-04-15',
      operation: 'analyze --all',
      scope: 'workspace',
      bullets: ['char_foo (42 files)', 'module_dlc (10 files)'],
    });
    expect(entry).toContain('## [2026-04-15] analyze --all | workspace');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  analyzeLorebookStructure,
  buildLorebookRegexCorrelation,
  buildUnifiedCBSGraph,
  collectRegexCBSFromCharx,
  parseDefaultVariablesJson,
  parseDefaultVariablesText,
  extractCBSVariableOccurrences,
  extractCBSVarOps,
  type CBSVariableOccurrence,
} from '@/domain';

describe('Phase 1-1 domain extraction', () => {
  it('analyzes lorebook structure from entries', () => {
    const result = analyzeLorebookStructure([
      { mode: 'folder', keys: ['f1'], name: 'Main Folder' },
      { mode: 'normal', folder: 'f1', name: 'Entry A', content: '{{getvar::foo}}', enabled: true },
      { mode: 'normal', key: 'alias', comment: 'Entry B', content: '{{setvar::bar}}', enabled: false },
    ]);

    expect(result.stats.totalEntries).toBe(2);
    expect(result.stats.totalFolders).toBe(1);
    expect(result.stats.withCBS).toBe(2);
    expect(result.keywords.all).toContain('alias');
    expect(result.entries[0].id).toBe('Main Folder/Entry A');
    expect(result.entries[0].folderId).toBe('f1');
  });

  it('preserves nested lorebook folder paths for downstream graphs and tree views', () => {
    const result = analyzeLorebookStructure([
      { mode: 'folder', keys: ['root-folder'], name: 'Root Folder' },
      { mode: 'folder', keys: ['child-folder'], folder: 'root-folder', name: 'Child Folder' },
      { mode: 'normal', folder: 'child-folder', name: 'Nested Entry', content: '{{setvar::nested}}' },
    ]);

    expect(result.folders).toEqual([
      { id: 'root-folder', name: 'Root Folder', path: 'Root Folder', parentId: null },
      { id: 'child-folder', name: 'Child Folder', path: 'Root Folder/Child Folder', parentId: 'root-folder' },
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].folder).toBe('Root Folder/Child Folder');
    expect(result.entries[0].id).toBe('Root Folder/Child Folder/Nested Entry');
    expect(result.keywords.overlaps).toEqual({});
  });

  it('collects regex CBS operations from card custom scripts', () => {
    const result = collectRegexCBSFromCharx({
      data: {
        extensions: {
          risuai: {
            customScripts: [
              { comment: 'script-1', in: '{{getvar::foo}}', out: '{{setvar::bar}}' },
              { name: 'script-2', script: '{{addvar::baz}}' },
            ],
          },
        },
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0].elementName).toBe('script-1');
    expect(result[0].reads.has('foo')).toBe(true);
    expect(result[0].writes.has('bar')).toBe(true);
    expect(result[1].writes.has('baz')).toBe(true);
  });

  it('builds unified graph and lorebook-regex correlation', () => {
    const lorebook = [{
      elementType: 'lorebook',
      elementName: 'lb',
      reads: new Set<string>(),
      writes: new Set<string>(['shared']),
    }];
    const regex = [{
      elementType: 'regex',
      elementName: 'rx',
      reads: new Set<string>(['shared']),
      writes: new Set<string>(),
    }];

    const graph = buildUnifiedCBSGraph([...lorebook, ...regex], { shared: '1' });
    const correlation = buildLorebookRegexCorrelation(lorebook, regex);

    expect(graph.has('shared')).toBe(true);
    expect(graph.get('shared')?.direction).toBe('bridged');
    expect(correlation.summary.totalShared).toBe(1);
    expect(correlation.sharedVars[0].direction).toBe('lorebook->regex');
  });

  it('keeps all unified variables for downstream analyzers instead of truncating at domain level', () => {
    const collected = Array.from({ length: 81 }, (_, index) => ({
      elementType: 'prompt',
      elementName: `prompt-${index}`,
      reads: new Set<string>([`var_${index}`]),
      writes: new Set<string>(),
    }));

    const graph = buildUnifiedCBSGraph(collected, {});

    expect(graph.size).toBe(81);
    expect(graph.has('var_80')).toBe(true);
  });

  it('parses default variables from text and json payloads', () => {
    expect(parseDefaultVariablesText('a=1\nb\n')).toEqual({ a: '1', b: '' });
    expect(parseDefaultVariablesJson([{ key: 'x', value: 3 }, { name: 'y', value: null }])).toEqual({ x: '3', y: '' });
  });
});

function collectDomainFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDomainFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('domain purity guard', () => {
  it('keeps Node.js imports out of src/domain', () => {
    const domainRoot = path.join(process.cwd(), 'src', 'domain');
    const files = collectDomainFiles(domainRoot);
    const forbiddenPatterns = [
      /from\s+['"]node:/,
      /from\s+['"]fs['"]/, /from\s+['"]path['"]/, /from\s+['"]child_process['"]/, 
      /require\(['"]node:/,
      /require\(['"]fs['"]\)/, /require\(['"]path['"]\)/, /require\(['"]child_process['"]\)/,
    ];

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});

describe('CBS variable occurrence extraction', () => {
  it('extracts exact occurrence metadata with direction and range', () => {
    const text = '{{getvar::hp}} {{setvar::mp::10}}';
    const occurrences = extractCBSVariableOccurrences(text);

    expect(occurrences).toHaveLength(2);

    // First occurrence: getvar (read)
    expect(occurrences[0].variableName).toBe('hp');
    expect(occurrences[0].direction).toBe('read');
    expect(occurrences[0].operation).toBe('getvar');
    expect(occurrences[0].range).toBeDefined();
    expect(occurrences[0].keyStart).toBeDefined();
    expect(occurrences[0].keyEnd).toBeDefined();

    // Second occurrence: setvar (write)
    expect(occurrences[1].variableName).toBe('mp');
    expect(occurrences[1].direction).toBe('write');
    expect(occurrences[1].operation).toBe('setvar');
  });

  it('handles all supported variable operations', () => {
    const text = '{{getvar::a}} {{setvar::b::1}} {{addvar::c::2}} {{setdefaultvar::d::3}}';
    const occurrences = extractCBSVariableOccurrences(text);

    expect(occurrences).toHaveLength(4);
    expect(occurrences[0]).toMatchObject({ variableName: 'a', direction: 'read', operation: 'getvar' });
    expect(occurrences[1]).toMatchObject({ variableName: 'b', direction: 'write', operation: 'setvar' });
    expect(occurrences[2]).toMatchObject({ variableName: 'c', direction: 'write', operation: 'addvar' });
    expect(occurrences[3]).toMatchObject({ variableName: 'd', direction: 'write', operation: 'setdefaultvar' });
  });

  it('skips dynamic or non-plain keys deterministically', () => {
    // Dynamic key with nested macro - inner dynamic key is extracted as separate occurrence
    // but the outer macro with dynamic key is skipped
    const textWithDynamic = '{{getvar::{{getvar::key}}}} {{setvar::static::value}}';
    const occurrences = extractCBSVariableOccurrences(textWithDynamic);

    // The inner {{getvar::key}} is a valid static occurrence
    // The outer {{getvar::...}} has dynamic key so it's skipped
    // The {{setvar::static::value}} is a valid static occurrence
    expect(occurrences.some(o => o.variableName === 'key')).toBe(true);
    expect(occurrences.some(o => o.variableName === 'static')).toBe(true);
    // The outer dynamic macro should not create an occurrence
    expect(occurrences.some(o => o.variableName === '{{getvar::key}}')).toBe(false);
  });

  it('provides accurate key ranges for exact local occurrence metadata', () => {
    // text: '{{getvar::  health  }}'
    //        01234567890123456789012
    //        {{getvar::  health  }}
    //        0         1         2
    // Positions:
    //        0-9:   '{{getvar::' (10 chars)
    //        10-11: '  ' (2 leading spaces)
    //        12-17: 'health' (6 chars, trimmed key)
    //        18-19: '  ' (2 trailing spaces)
    //        20-21: '}}' (2 chars)
    // range.start: line 0, char 10 (after '{{getvar::')
    // range.end: line 0, char 20 (before '}}')
    // keyStart: line 0, char 12 (after '{{getvar::  ')
    // keyEnd: line 0, char 18 (after 'health', before '  ')
    const text = '{{getvar::  health  }}';
    const occurrences = extractCBSVariableOccurrences(text);

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].variableName).toBe('health');

    // Exact position assertions for trimmed key boundaries
    const { keyStart, keyEnd, range } = occurrences[0];
    expect(keyStart.line).toBe(0);
    expect(keyStart.character).toBe(12); // after '{{getvar::' + 2 leading spaces
    expect(keyEnd.line).toBe(0);
    expect(keyEnd.character).toBe(18); // keyStart + 6 ('health') = 18

    // Verify range encompasses the full argument including spaces
    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(10); // after '{{getvar::'
    expect(range.end.line).toBe(0);
    expect(range.end.character).toBe(20); // before '}}'
  });

  it('returns empty array for empty or non-string input', () => {
    expect(extractCBSVariableOccurrences('')).toEqual([]);
    expect(extractCBSVariableOccurrences('   ')).toEqual([]);
    expect(extractCBSVariableOccurrences('no cbs here')).toEqual([]);
  });

  it('maintains backward compatibility with extractCBSVarOps', () => {
    const text = '{{getvar::foo}} {{setvar::bar::1}} {{addvar::baz::2}}';

    const occurrences = extractCBSVariableOccurrences(text);
    const varOps = extractCBSVarOps(text);

    // Verify that extractCBSVarOps derives from occurrence data
    expect(varOps.reads.has('foo')).toBe(true);
    expect(varOps.writes.has('bar')).toBe(true);
    expect(varOps.writes.has('baz')).toBe(true);

    // Verify consistency between both APIs
    const occurrenceReads = new Set(occurrences.filter(o => o.direction === 'read').map(o => o.variableName));
    const occurrenceWrites = new Set(occurrences.filter(o => o.direction === 'write').map(o => o.variableName));

    expect(varOps.reads).toEqual(occurrenceReads);
    expect(varOps.writes).toEqual(occurrenceWrites);
  });

  it('handles multiline CBS with accurate line positions', () => {
    const text = '{{getvar::line1}}\n{{setvar::line2::val}}';
    const occurrences = extractCBSVariableOccurrences(text);

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].variableName).toBe('line1');
    expect(occurrences[0].range.start.line).toBe(0);
    expect(occurrences[1].variableName).toBe('line2');
    expect(occurrences[1].range.start.line).toBe(1);
  });

  it('provides exact positions for whitespace-padded keys across lines', () => {
    // Multiline text with padded variable key
    // Line 0: {{getvar::  padded
    //         0123456789012345
    //         {{getvar::  (12 chars: 0-11)
    //         padded (6 chars: 12-17)
    // Line 1: key  }}
    //         012345
    //         key  (5 chars: 0-4, includes 2 trailing spaces)
    //         }} (2 chars: 5-6)
    const text = '{{getvar::  padded\nkey  }}';
    const occurrences = extractCBSVariableOccurrences(text);

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].variableName).toBe('padded\nkey');

    const { keyStart, keyEnd, range } = occurrences[0];
    // keyStart should be after '{{getvar::' + 2 spaces on line 0
    expect(keyStart.line).toBe(0);
    expect(keyStart.character).toBe(12); // after '{{getvar::  '
    // keyEnd should be before 2 trailing spaces on line 1
    expect(keyEnd.line).toBe(1);
    expect(keyEnd.character).toBe(3); // 'key' ends at char 3 (3 chars: 0-2)

    // Full range includes the padding
    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(10); // after '{{getvar::'
    expect(range.end.line).toBe(1);
    expect(range.end.character).toBe(5); // after 'key  ' (before '}}')
  });

  it('falls back to regex extraction on parse errors', () => {
    // Malformed CBS that might cause parser issues
    const text = '{{getvar::valid}} {{malformed';
    const occurrences = extractCBSVariableOccurrences(text);

    // Should still extract the valid occurrence via fallback
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
    expect(occurrences.some(o => o.variableName === 'valid')).toBe(true);
  });
});

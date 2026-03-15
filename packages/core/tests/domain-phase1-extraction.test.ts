import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  analyzeLorebookStructure,
  buildLorebookRegexCorrelation,
  buildUnifiedCBSGraph,
  collectRegexCBSFromCard,
  parseDefaultVariablesJson,
  parseDefaultVariablesText,
} from '../src/domain';

describe('Phase 1-1 domain extraction', () => {
  it('analyzes lorebook structure from card data', () => {
    const result = analyzeLorebookStructure({
      data: {
        character_book: {
          entries: [
            { mode: 'folder', keys: ['f1'], name: 'Main Folder' },
            { mode: 'normal', folder: 'f1', name: 'Entry A', content: '{{getvar::foo}}', enabled: true },
            { mode: 'normal', key: 'alias', comment: 'Entry B', content: '{{setvar::bar}}', enabled: false },
          ],
        },
      },
    });

    expect(result.stats.totalEntries).toBe(2);
    expect(result.stats.totalFolders).toBe(1);
    expect(result.stats.withCBS).toBe(2);
    expect(result.keywords.all).toContain('alias');
  });

  it('collects regex CBS operations from card custom scripts', () => {
    const result = collectRegexCBSFromCard({
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

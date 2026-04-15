import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAnalyzeWorkflow } from '@/cli/analyze/workflow';

const FIXTURE_EXTRACT = path.resolve(
  __dirname,
  '../../../../../playground/260406-test/output/charx/alternate-hunters-v2/extract',
);

let tmpWorkspace: string;
let resolvedExtractDir: string;

beforeAll(() => {
  if (!fs.existsSync(FIXTURE_EXTRACT)) {
    throw new Error(`Fixture extract missing at ${FIXTURE_EXTRACT}`);
  }

  tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-integration-'));
  resolvedExtractDir = path.join(tmpWorkspace, 'character_alternate-hunters-v2');
  fs.cpSync(FIXTURE_EXTRACT, resolvedExtractDir, { recursive: true });

  const wikiRoot = path.join(tmpWorkspace, 'wiki');
  fs.mkdirSync(wikiRoot, { recursive: true });
  fs.writeFileSync(
    path.join(wikiRoot, 'workspace.yaml'),
    ['artifacts:', '  - path: ./character_alternate-hunters-v2', '    type: character'].join('\n'),
  );
});

afterAll(() => {
  fs.rmSync(tmpWorkspace, { recursive: true, force: true });
});

describe('wiki integration — alternate-hunters-v2', () => {
  it('runs top-level --all and produces expected file tree under wiki/artifacts/char_.../_generated/', () => {
    const wikiRoot = path.join(tmpWorkspace, 'wiki');
    const code = runAnalyzeWorkflow(['--all', '--wiki-only', '--wiki-root', wikiRoot]);
    expect(code).toBe(0);

    const artifactDir = path.join(
      wikiRoot,
      'artifacts',
      'char_character_alternate-hunters-v2',
      '_generated',
    );
    expect(fs.existsSync(path.join(artifactDir, 'overview.md'))).toBe(true);
    expect(fs.existsSync(path.join(artifactDir, 'variables.md'))).toBe(true);
    expect(fs.existsSync(path.join(artifactDir, 'lorebook/_index.md'))).toBe(true);
    expect(fs.existsSync(path.join(artifactDir, 'chains/_index.md'))).toBe(true);
  });

  it('writes SCHEMA.md and _schema/ files at workspace level', () => {
    const wikiRoot = path.join(tmpWorkspace, 'wiki');
    expect(fs.existsSync(path.join(wikiRoot, 'SCHEMA.md'))).toBe(true);
    expect(fs.existsSync(path.join(wikiRoot, '_schema/page-classes.md'))).toBe(true);
    expect(fs.existsSync(path.join(wikiRoot, '_schema/frontmatter.md'))).toBe(true);
    expect(fs.existsSync(path.join(wikiRoot, '_schema/recipes/edit-entity.md'))).toBe(true);
    expect(fs.existsSync(path.join(wikiRoot, '_schema/recipes/manage-companions.md'))).toBe(true);
  });

  it('produces lorebook entity pages for all entries', () => {
    const wikiRoot = path.join(tmpWorkspace, 'wiki');
    const entityDir = path.join(
      wikiRoot,
      'artifacts',
      'char_character_alternate-hunters-v2',
      '_generated/lorebook',
    );
    const entities = fs
      .readdirSync(entityDir)
      .filter((fileName) => fileName !== '_index.md' && fileName.endsWith('.md'));
    expect(entities.length).toBeGreaterThan(50);
  });

  it('contains no forbidden narrative phrases in _generated/', () => {
    const wikiRoot = path.join(tmpWorkspace, 'wiki');
    const generatedDir = path.join(
      wikiRoot,
      'artifacts',
      'char_character_alternate-hunters-v2',
      '_generated',
    );
    const forbidden = [
      'Korean hunter RPG',
      'composition ratio',
      'Opening (first',
      'this character is',
      'A-rank hunter',
    ];
    const allFiles = listFilesRecursive(generatedDir);
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const phrase of forbidden) {
        if (content.includes(phrase)) {
          throw new Error(`Forbidden narrative phrase "${phrase}" found in ${file}`);
        }
      }
    }
  });

  it('second run is idempotent — SCHEMA.md hash unchanged', () => {
    const wikiRoot = path.join(tmpWorkspace, 'wiki');
    const schemaPath = path.join(wikiRoot, 'SCHEMA.md');
    const mtimeBefore = fs.statSync(schemaPath).mtimeMs;
    const code = runAnalyzeWorkflow(['--all', '--wiki-only', '--wiki-root', wikiRoot]);
    expect(code).toBe(0);
    const mtimeAfter = fs.statSync(schemaPath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

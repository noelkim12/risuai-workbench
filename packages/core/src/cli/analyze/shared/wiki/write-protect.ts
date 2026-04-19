import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { WikiFile } from './types';

/**
 * Recursively remove the contents of a `_generated` directory.
 *
 * SAFETY: The target path MUST end in `/_generated`. Any other path is rejected
 * with an exception to prevent accidental deletion of parent or sibling dirs.
 */
export function wipeArtifactDir(targetDir: string): void {
  const normalized = path.resolve(targetDir);
  if (!normalized.endsWith(`${path.sep}_generated`) && !normalized.endsWith('/_generated')) {
    throw new Error(
      `wipeArtifactDir refuses to operate on ${targetDir}: path must end in _generated`,
    );
  }
  if (!fs.existsSync(normalized)) return;
  fs.rmSync(normalized, { recursive: true, force: true });
}

/**
 * Write a list of WikiFile entries under the target directory,
 * creating sub-directories as needed.
 */
export function writeArtifactFiles(targetDir: string, files: WikiFile[]): void {
  for (const file of files) {
    const fullPath = path.join(targetDir, file.relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }
}

export type SchemaWriteResult = 'written' | 'unchanged';

/**
 * Write the content to the target path only if the on-disk hash differs.
 * Returns 'written' for new or changed files, 'unchanged' for a no-op.
 */
export function writeSchemaIfChanged(targetPath: string, content: string): SchemaWriteResult {
  const newHash = crypto.createHash('sha256').update(content).digest('hex');
  if (fs.existsSync(targetPath)) {
    const existing = fs.readFileSync(targetPath, 'utf8');
    const existingHash = crypto.createHash('sha256').update(existing).digest('hex');
    if (existingHash === newHash) return 'unchanged';
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
  return 'written';
}

/** Append a log entry to _log.md, creating the file if it does not exist. */
export function appendLogEntry(logPath: string, entry: string): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const separator = fs.existsSync(logPath) ? '\n' : '';
  fs.appendFileSync(logPath, separator + entry, 'utf8');
}

/**
 * Rewrite the content between `<!-- BEGIN:artifacts -->` and `<!-- END:artifacts -->`
 * markers in _index.md. If the file or markers do not exist, write a full template.
 */
export function rewriteIndexArtifactsSection(
  indexPath: string,
  artifactsMarkdown: string,
): void {
  const BEGIN = '<!-- BEGIN:artifacts -->';
  const END = '<!-- END:artifacts -->';

  if (!fs.existsSync(indexPath)) {
    const template = buildIndexTemplate(artifactsMarkdown);
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, template, 'utf8');
    return;
  }

  const existing = fs.readFileSync(indexPath, 'utf8');
  const beginIdx = existing.indexOf(BEGIN);
  const endIdx = existing.indexOf(END);

  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    const template = buildIndexTemplate(artifactsMarkdown);
    fs.writeFileSync(indexPath, template, 'utf8');
    return;
  }

  const before = existing.substring(0, beginIdx + BEGIN.length);
  const after = existing.substring(endIdx);
  const replaced = `${before}\n\n${artifactsMarkdown}\n${after}`;
  fs.writeFileSync(indexPath, replaced, 'utf8');
}

function buildIndexTemplate(artifactsMarkdown: string): string {
  return [
    '---',
    'source: generated',
    'page-class: index',
    '---',
    '',
    '# Workspace Wiki Index',
    '',
    '## Artifacts',
    '',
    '<!-- BEGIN:artifacts -->',
    '',
    artifactsMarkdown,
    '',
    '<!-- END:artifacts -->',
    '',
    '## Domain reference',
    '',
    'See [`domain/_index.md`](domain/_index.md).',
    '',
    '## Log',
    '',
    'See [`_log.md`](_log.md) for analyze history.',
    '',
    '## How to use',
    '',
    'Read [`SCHEMA.md`](SCHEMA.md) first if this is your first session.',
    '',
  ].join('\n');
}

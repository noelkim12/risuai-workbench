import fs from 'node:fs';
import path from 'node:path';

interface InstallDocsProviderOptions {
  outputRoot: string;
  overwrite?: boolean;
}

const DOCS_PROVIDER_SOURCE_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'assets',
  'docs-provider',
);

export function installDocsProviderBundle(options: InstallDocsProviderOptions): number {
  const sourceRoot = DOCS_PROVIDER_SOURCE_ROOT;
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`docs-provider asset bundle not found: ${sourceRoot}`);
  }

  const overwrite = options.overwrite === true;
  let copied = 0;
  copied += copyFileIfNeeded(
    path.join(sourceRoot, 'AGENTS.md'),
    path.join(options.outputRoot, 'AGENTS.md'),
    overwrite,
  );
  copied += copyDirectory(path.join(sourceRoot, 'docs'), path.join(options.outputRoot, 'docs'), overwrite);
  return copied;
}

function copyFileIfNeeded(sourcePath: string, targetPath: string, overwrite: boolean): number {
  if (!overwrite && fs.existsSync(targetPath)) return 0;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return 1;
}

function copyDirectory(sourceDir: string, targetDir: string, overwrite: boolean): number {
  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copied += copyDirectory(sourcePath, targetPath, overwrite);
      continue;
    }

    if (!entry.isFile()) continue;
    copied += copyFileIfNeeded(sourcePath, targetPath, overwrite);
  }

  return copied;
}

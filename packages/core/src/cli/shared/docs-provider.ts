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

const LLM_REFERENCE_FILENAMES = ['CBS_FOR_LLM.md', 'LUA_FOR_LLM.md'] as const;
const WORKSPACE_REFERENCE_SOURCE_ROOT = path.resolve(
  DOCS_PROVIDER_SOURCE_ROOT,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'reference',
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

  const bundledReferenceRoot = path.join(sourceRoot, 'docs', 'reference');
  const hasBundledReferences = LLM_REFERENCE_FILENAMES.every((filename) =>
    fs.existsSync(path.join(bundledReferenceRoot, filename)),
  );
  if (!hasBundledReferences) {
    for (const filename of LLM_REFERENCE_FILENAMES) {
      const sourcePath = path.join(WORKSPACE_REFERENCE_SOURCE_ROOT, filename);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`LLM reference document not found: ${sourcePath}`);
      }
      copied += copyFileIfNeeded(
        sourcePath,
        path.join(options.outputRoot, 'docs', 'reference', filename),
        overwrite,
      );
    }
  }
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

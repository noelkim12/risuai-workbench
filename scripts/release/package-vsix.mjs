import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionRoot = path.join(repoRoot, 'packages/vscode');
const run = promisify(execFile);
const require = createRequire(import.meta.url);
const { createVSIX } = require('@vscode/vsce');
const localPackages = ['lua-analyzer-wasm', 'core', 'cbs-lsp'];

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

async function npm(args, cwd) {
  const { stdout } = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd,
    shell: process.platform === 'win32',
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function checkNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Symlink in VSIX staging: ${filename}`);
    if (entry.isDirectory()) await checkNoSymlinks(filename);
  }
}

async function packLocal(directory, tempRoot) {
  const source = path.join(repoRoot, 'packages', directory);
  const manifest = await readJson(path.join(source, 'package.json'));
  const output = await npm([
    'pack', '--workspace', manifest.name, '--pack-destination', tempRoot, '--json', '--ignore-scripts',
  ], repoRoot);
  const [packed] = JSON.parse(output);
  assert(packed?.filename && packed.files?.length, `No tarball produced for ${manifest.name}`);
  return { source, manifest, packed, tarball: path.join(tempRoot, packed.filename) };
}

async function verifyLocalInstall(stage, packages) {
  const lock = await readJson(path.join(stage, 'package-lock.json'));
  for (const { source, manifest, packed, tarball } of packages) {
    const key = `node_modules/${manifest.name}`;
    assert.equal(lock.packages[key]?.integrity, packed.integrity, `Non-local install: ${manifest.name}`);
    assert.equal(path.resolve(stage, lock.packages[key].resolved.replace(/^file:/, '')), tarball);
    for (const installed of Object.keys(lock.packages)) {
      assert(!installed.endsWith(`/${key}`), `Nested registry copy: ${installed}`);
    }
    for (const file of packed.files) {
      const actual = await readFile(path.join(stage, key, file.path));
      const expected = await readFile(path.join(source, file.path));
      assert(actual.equals(expected), `Local package content differs: ${manifest.name}/${file.path}`);
    }
    console.log(`[vsix] Local tarball verified: ${manifest.name}@${manifest.version}`);
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/release/package-vsix.mjs\nRun npm run build:extension-dev first.');
    return;
  }
  assert.equal(process.argv.length, 2, 'Unexpected arguments; use --help.');
  const target = `${process.platform}-${process.arch}`;
  assert(['linux-x64', 'win32-x64', 'darwin-arm64'].includes(target), `Unsupported VSIX build host: ${target}`);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'risu-vsix-package-'));
  const stage = path.join(tempRoot, 'extension');
  const installRoot = path.join(tempRoot, 'install');
  await mkdir(stage);
  await mkdir(installRoot);
  console.log(`[vsix] Staging retained at ${tempRoot}`);
  const manifest = await readJson(path.join(extensionRoot, 'package.json'));
  delete manifest.scripts;
  delete manifest.devDependencies;
  delete manifest.workspaces;
  delete manifest.files;
  delete manifest.vsce;
  const packages = [];
  for (const directory of localPackages) packages.push(await packLocal(directory, tempRoot));
  const runtimeDependencies = { ...manifest.dependencies };
  for (const { manifest: dependency, tarball } of packages) {
    runtimeDependencies[dependency.name] = dependency.version;
    manifest.dependencies[dependency.name] = `file:${tarball}`;
  }
  await writeFile(path.join(installRoot, 'package.json'), JSON.stringify(manifest, null, 2));
  for (const entry of ['dist', 'resources', 'syntaxes', 'language-configuration.json', 'README.md']) {
    await cp(path.join(extensionRoot, entry), path.join(stage, entry), {
      recursive: true,
      filter: (filename) => !/\.(?:ts|map)$/.test(filename),
    });
  }
  await cp(path.join(repoRoot, 'LICENSE'), path.join(stage, 'LICENSE'));
  for (const entry of ['dist/extension.js', 'dist/webview/index.html', 'dist/risuai-hmr-provider.js']) {
    assert((await lstat(path.join(stage, entry))).isFile(), `Build output missing: ${entry}`);
  }
  console.log('[vsix] Installing production dependencies (native install scripts enabled).');
  await npm(['install', '--omit=dev', '--no-audit', '--no-fund'], installRoot);
  await verifyLocalInstall(installRoot, packages);
  await cp(path.join(installRoot, 'node_modules'), path.join(stage, 'node_modules'), {
    recursive: true,
    filter: (filename) => path.basename(filename) !== '.bin',
  });
  manifest.dependencies = runtimeDependencies;
  await writeFile(path.join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(stage, '.vscodeignore'), 'dist/**/*.map\ndist/**/*.ts\n');
  await checkNoSymlinks(stage);
  const outputDirectory = path.join(repoRoot, 'dist/vsix');
  await mkdir(outputDirectory, { recursive: true });
  const packagePath = path.join(outputDirectory, `${manifest.name}-${target}-${manifest.version}.vsix`);
  await createVSIX({ cwd: stage, packagePath, target, useYarn: false, dependencies: true });
  console.log(`[vsix] Created ${packagePath}`);
  console.log(`[vsix] Native dependencies packaged for ${target}; install only on this extension-host platform.`);
}

main().catch((error) => {
  console.error(error.stderr || error.stack || String(error));
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(repoRoot, 'packages/core/package.json'));
const { unzipSync } = require('fflate');

async function runtimeProbe() {
  const { default: assert } = await import('node:assert/strict');
  const { fork, execFile } = await import('node:child_process');
  const { once } = await import('node:events');
  const { createRequire } = await import('node:module');
  const { default: path } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { promisify } = await import('node:util');
  const root = process.cwd();
  const require = createRequire(path.join(root, 'package.json'));
  const resolve = (name) => {
    const filename = require.resolve(name);
    assert(filename.startsWith(`${root}${path.sep}`), `Dependency escaped VSIX: ${name}`);
    return filename;
  };
  const core = await import(pathToFileURL(resolve('@risuai-workbench/core/node')).href);
  assert.equal(typeof core.parseCardFile, 'function');
  assert.equal(typeof core.encodeRPack, 'function');
  resolve('create-risu-plugin/bin/index.js');
  resolve('vscode-languageclient/node');
  const wasm = require(resolve('@risuai-workbench/lua-analyzer-wasm'));
  const analysis = JSON.parse(wasm.analyze_lua("return getState('mode')", JSON.stringify({ includeStateAccesses: true })));
  assert.equal(analysis.ok, true);
  assert.equal(analysis.parser, 'rust-wasm-lua');
  assert.equal(analysis.stateAccesses[0].key, 'mode');
  const coreRequire = createRequire(resolve('@risuai-workbench/core'));
  const Parser = coreRequire('tree-sitter');
  const grammar = await import(pathToFileURL(coreRequire.resolve('@tree-sitter-grammars/tree-sitter-lua')).href);
  const parser = new Parser();
  parser.setLanguage(grammar.default ?? grammar);
  assert.equal(parser.parse('return 42').rootNode.hasError, false);
  const cli = await promisify(execFile)(process.execPath, [resolve('@risuai-workbench/core/bin/risu-core.js'), '--help'], {
    cwd: root, env: process.env, timeout: 15_000,
  });
  assert.match(cli.stdout, /Usage:\s+risu-core/);
  console.log('[verify-vsix] Core import, WASM state analysis, native Lua parse, CLI help: passed');
  const lspManifest = resolve('@risuai-workbench/cbs-language-server/package.json');
  const lspRequire = createRequire(lspManifest);
  const { createMessageConnection, IPCMessageReader, IPCMessageWriter } = lspRequire('vscode-jsonrpc/node');
  const child = fork(path.join(path.dirname(lspManifest), 'dist/embedded.js'), ['--node-ipc'], {
    cwd: root, env: process.env, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const exit = once(child, 'exit');
  const connection = createMessageConnection(new IPCMessageReader(child), new IPCMessageWriter(child));
  connection.onRequest('workspace/configuration', ({ items }) => items.map(() => null));
  connection.onRequest('client/registerCapability', () => null);
  connection.listen();
  let timer;
  try {
    await Promise.race([
      (async () => {
        const result = await connection.sendRequest('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
        assert(result.capabilities.completionProvider, 'Missing LSP completion capability');
        await connection.sendNotification('initialized', {});
        assert.equal(await connection.sendRequest('shutdown'), null);
        await connection.sendNotification('exit');
        const [code] = await exit;
        assert.equal(code, 0, logs);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`LSP timed out: ${logs}`)), 20_000); }),
    ]);
    console.log('[verify-vsix] Packaged embedded LSP IPC initialize/shutdown/exit: passed');
  } finally {
    clearTimeout(timer);
    connection.dispose();
    if (child.exitCode === null) child.kill();
  }
}

async function verifyArchive(entries, manifest) {
  const required = ['package.json', manifest.main.replace(/^\.\//, ''), 'readme.md', 'LICENSE.txt',
    'language-configuration.json', 'dist/webview/index.html', 'dist/risuai-hmr-provider.js'];
  for (const grammar of manifest.contributes.grammars) required.push(grammar.path.replace(/^\.\//, ''));
  for (const language of manifest.contributes.languages) {
    if (language.icon) required.push(language.icon.light.replace(/^\.\//, ''), language.icon.dark.replace(/^\.\//, ''));
  }
  for (const filename of required) assert(entries[`extension/${filename}`], `Missing asset: ${filename}`);
  assert(!manifest.scripts && !manifest.devDependencies, 'Development manifest fields leaked');
  const allowed = new Set(['package.json', 'readme.md', 'LICENSE.txt', 'language-configuration.json', 'dist', 'resources', 'syntaxes', 'node_modules']);
  for (const filename of Object.keys(entries).filter((name) => name.startsWith('extension/'))) {
    const relative = filename.slice('extension/'.length);
    assert(allowed.has(relative.split('/')[0]), `Unexpected extension file: ${relative}`);
    assert(!/^dist\/.*\.(?:ts|map)$/.test(relative), `Development output leaked: ${relative}`);
    assert(!relative.includes('/node_modules/@risuai-workbench/'), `Nested workspace dependency: ${relative}`);
  }
  for (const [directory, files] of [
    ['core', ['package.json', 'dist/node/index.js', 'dist/cli/main.js', 'bin/risu-core.js', 'assets/rpack_map.bin']],
    ['cbs-lsp', ['package.json', 'dist/embedded.js', 'dist/server.js']],
    ['lua-analyzer-wasm', ['package.json', 'pkg/lua_analyzer_wasm.js', 'pkg/lua_analyzer_wasm_bg.wasm']],
  ]) {
    const sourceRoot = path.join(repoRoot, 'packages', directory);
    const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
    const prefix = `extension/node_modules/${sourceManifest.name}/`;
    assert.equal(manifest.dependencies[sourceManifest.name], sourceManifest.version);
    for (const filename of files) {
      assert(entries[prefix + filename], `Missing local runtime: ${prefix + filename}`);
      assert(Buffer.from(entries[prefix + filename]).equals(await readFile(path.join(sourceRoot, filename))),
        `Archive differs from local build: ${sourceManifest.name}/${filename}`);
    }
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/release/verify-vsix.mjs [archive.vsix]\nVerifies against the current local build in an isolated OS temp directory.');
    return;
  }
  assert(process.argv.length <= 3, 'Unexpected arguments; use --help.');
  const sourceManifest = JSON.parse(await readFile(path.join(repoRoot, 'packages/vscode/package.json'), 'utf8'));
  const target = `${process.platform}-${process.arch}`;
  const archive = path.resolve(process.argv[2] ?? path.join(repoRoot, 'dist/vsix', `${sourceManifest.name}-${target}-${sourceManifest.version}.vsix`));
  const entries = unzipSync(await readFile(archive));
  assert(entries['extension.vsixmanifest'] && entries['[Content_Types].xml'], 'Not a VSIX archive');
  assert(Buffer.from(entries['extension.vsixmanifest']).toString('utf8').includes(`TargetPlatform="${target}"`),
    `VSIX target must match the verification host: ${target}`);
  const manifest = JSON.parse(Buffer.from(entries['extension/package.json']).toString('utf8'));
  assert.equal(manifest.name, sourceManifest.name);
  assert.equal(manifest.version, sourceManifest.version);
  await verifyArchive(entries, manifest);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'risu-vsix-verify-'));
  console.log(`[verify-vsix] Extracting ${archive} to ${tempRoot} (retained)`);
  for (const [filename, bytes] of Object.entries(entries)) {
    assert(!filename.includes('\\') && !filename.split('/').includes('..') && !path.isAbsolute(filename), `Unsafe ZIP path: ${filename}`);
    const destination = path.join(tempRoot, filename);
    await mkdir(filename.endsWith('/') ? destination : path.dirname(destination), { recursive: true });
    if (!filename.endsWith('/')) await writeFile(destination, bytes);
  }
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', `(${runtimeProbe.toString()})()`], {
    cwd: path.join(tempRoot, 'extension'),
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
    timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.log(`[verify-vsix] PASS: ${Object.keys(entries).length} archive entries; runtime verified on ${process.platform}-${process.arch}, Node ${process.versions.node}.`);
}

main().catch((error) => {
  console.error(error.stderr || error.stack || String(error));
  process.exitCode = 1;
});

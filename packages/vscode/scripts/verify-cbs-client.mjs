#!/usr/bin/env node
/**
 * Verification script for CBS language client integration.
 * Asserts server module path and document selectors without drift.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const EXPECTED_SELECTORS = [
  '**/*.risulorebook',
  '**/*.risuregex',
  '**/*.risuprompt',
  '**/*.risuhtml',
  '**/*.risulua',
];
const EXPECTED_PATTERN_SELECTOR_COUNT = EXPECTED_SELECTORS.length + 1;

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

function fail(message) {
  console.error(`❌ FAIL: ${message}`);
  process.exit(EXIT_FAILURE);
}

function pass(message) {
  console.log(`✅ PASS: ${message}`);
}

const builtLaunchResolverPath = join(__dirname, '..', 'dist', 'lsp', 'cbsLanguageServerLaunch.js');
if (!existsSync(builtLaunchResolverPath)) {
  fail(`Built launch resolver not found at: ${builtLaunchResolverPath}. Run the vscode package build first.`);
}
pass(`Built launch resolver exists: ${builtLaunchResolverPath}`);

const {
  defaultCbsLanguageServerSettings,
  getEmbeddedCbsServerModulePath,
  getWorkspaceLocalCbsBinaryPath,
  resolveCbsLanguageServerLaunch,
} = require(builtLaunchResolverPath);

const extensionRoot = join(__dirname, '..');
const embeddedServerModule = getEmbeddedCbsServerModulePath(extensionRoot);
if (!existsSync(embeddedServerModule)) {
  fail(`CBS embedded server module not found at: ${embeddedServerModule}`);
}
pass(`CBS embedded server module exists: ${embeddedServerModule}`);

const builtBoundaryPath = join(__dirname, '..', 'dist', 'lsp', 'cbsLanguageClientBoundary.js');
if (!existsSync(builtBoundaryPath)) {
  fail(`Built CBS language client boundary not found at: ${builtBoundaryPath}. Run the vscode package build first.`);
}
pass(`Built CBS language client boundary exists: ${builtBoundaryPath}`);

const {
  buildCbsClientBoundarySnapshot,
  CBS_DOCUMENT_SELECTORS,
} = require(builtBoundaryPath);

// Read and parse the language client boundary source (where selectors live)
const boundarySourcePath = join(__dirname, '..', 'src', 'lsp', 'cbsLanguageClientBoundary.ts');
if (!existsSync(boundarySourcePath)) {
  fail(`Language client boundary source not found at: ${boundarySourcePath}`);
}
pass(`Language client boundary source exists: ${boundarySourcePath}`);

const boundarySource = readFileSync(boundarySourcePath, 'utf-8');

// Also read the runtime client source for transport contract checks
const clientSourcePath = join(__dirname, '..', 'src', 'lsp', 'cbsLanguageClient.ts');
if (!existsSync(clientSourcePath)) {
  fail(`Language client source not found at: ${clientSourcePath}`);
}
pass(`Language client source exists: ${clientSourcePath}`);

const clientSource = readFileSync(clientSourcePath, 'utf-8');

// Verify CBS_DOCUMENT_SELECTORS contains exactly the expected selectors
const selectorsMatch = boundarySource.match(/CBS_DOCUMENT_SELECTORS[^=]*=\s*\[([^\]]+)\]/s);
if (!selectorsMatch) {
  fail('Could not find CBS_DOCUMENT_SELECTORS array in source');
}

const selectorsBlock = selectorsMatch[1];
const foundSelectors = [];
for (const pattern of EXPECTED_SELECTORS) {
  if (selectorsBlock.includes(pattern)) {
    foundSelectors.push(pattern);
  }
}

if (foundSelectors.length !== EXPECTED_SELECTORS.length) {
  const missing = EXPECTED_SELECTORS.filter((s) => !foundSelectors.includes(s));
  fail(`Missing selectors: ${missing.join(', ')}`);
}

if (!selectorsBlock.includes("language: 'lua'") || !selectorsBlock.includes("pattern: '**/*.risulua'")) {
  fail('Missing Lua-language .risulua compatibility selector');
}

// Check for unexpected pattern selectors (5 file selectors + lua-language .risulua compatibility selector)
const allPatternMatches = selectorsBlock.match(/\*\/\*\.\w+/g) || [];
if (allPatternMatches.length !== EXPECTED_PATTERN_SELECTOR_COUNT) {
  fail(
    `Unexpected selector count: found ${allPatternMatches.length}, expected ${EXPECTED_PATTERN_SELECTOR_COUNT}`,
  );
}

pass(`Document selectors include CBS file patterns and Lua-language .risulua compatibility selector`);

if (!boundarySource.includes('resolveCbsLanguageServerLaunch')) {
  fail('cbsLanguageClientBoundary.ts does not use the shared launch resolver');
}
pass('cbsLanguageClientBoundary.ts uses the shared launch resolver');

if (!clientSource.includes('TransportKind.stdio')) {
  fail('cbsLanguageClient.ts does not configure standalone stdio transport');
}
pass('cbsLanguageClient.ts configures standalone stdio transport');

if (!clientSource.includes('TransportKind.ipc')) {
  fail('cbsLanguageClient.ts does not retain embedded IPC transport');
}
pass('cbsLanguageClient.ts retains embedded IPC transport');

if (!clientSource.includes('./cbsLanguageClientBoundary')) {
  fail('cbsLanguageClient.ts does not import from the boundary seam file');
}
pass('cbsLanguageClient.ts imports from boundary seam file');

// Verify extension.ts imports and calls the client
const extensionPath = join(__dirname, '..', 'src', 'extension.ts');
if (!existsSync(extensionPath)) {
  fail(`Extension source not found at: ${extensionPath}`);
}

const extensionSource = readFileSync(extensionPath, 'utf-8');

if (!extensionSource.includes('./lsp/cbsLanguageClient')) {
  fail('extension.ts does not import from ./lsp/cbsLanguageClient');
}
pass('extension.ts imports CBS language client module');

if (!extensionSource.includes('startCbsLanguageClient')) {
  fail('extension.ts does not call startCbsLanguageClient');
}
pass('extension.ts calls startCbsLanguageClient()');

if (!extensionSource.includes('stopCbsLanguageClient')) {
  fail('extension.ts does not call stopCbsLanguageClient');
}
pass('extension.ts calls stopCbsLanguageClient() in deactivate');

// Verify package.json has activation events for the 5 languages
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const activationEvents = packageJson.activationEvents || [];
const languageActivations = [
  'onLanguage:risulorebook',
  'onLanguage:risuregex',
  'onLanguage:risuprompt',
  'onLanguage:risuhtml',
  'onLanguage:risulua',
];

for (const event of languageActivations) {
  if (!activationEvents.includes(event)) {
    fail(`Missing activation event: ${event}`);
  }
}
pass('package.json has activation events for all 5 CBS-bearing languages');

for (const event of ['onLanguage:lua', 'workspaceContains:**/*.risulua']) {
  if (!activationEvents.includes(event)) {
    fail(`Missing Lua-compatible risulua activation event: ${event}`);
  }
}
pass('package.json activates when .risulua files are manually associated as Lua');

// Verify vscode-languageclient dependency
const deps = packageJson.dependencies || {};
if (!deps['vscode-languageclient']) {
  fail('Missing vscode-languageclient dependency in package.json');
}
pass(`vscode-languageclient dependency present: ${deps['vscode-languageclient']}`);

// Verify contributes.languages entries for the 5 file types
const contributes = packageJson.contributes || {};
const languages = contributes.languages || [];
const expectedLanguages = ['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua'];

for (const langId of expectedLanguages) {
  const langEntry = languages.find((l) => l.id === langId);
  if (!langEntry) {
    fail(`Missing contributes.languages entry for: ${langId}`);
  }
  const expectedExt = `.${langId}`;
  if (!langEntry.extensions || !langEntry.extensions.includes(expectedExt)) {
    fail(`Language ${langId} missing expected extension: ${expectedExt}`);
  }
}
pass(`contributes.languages has all 5 CBS-bearing file types with correct extensions`);

const configurationProperties = packageJson.contributes?.configuration?.properties ?? {};
const requiredConfigurationKeys = [
  'risuWorkbench.cbs.server.launchMode',
  'risuWorkbench.cbs.server.installMode',
  'risuWorkbench.cbs.server.path',
  'risuWorkbench.cbs.server.luaLsPath',
];

for (const key of requiredConfigurationKeys) {
  if (!configurationProperties[key]) {
    fail(`Missing configuration property: ${key}`);
  }
}
pass(`package.json exposes CBS client settings: ${requiredConfigurationKeys.join(', ')}`);

if (!clientSource.includes('CBS_LSP_LUALS_PATH')) {
  fail('cbsLanguageClient.ts does not forward configured LuaLS path via CBS_LSP_LUALS_PATH');
}
pass('cbsLanguageClient.ts forwards configured LuaLS path to CBS server env');

if (!clientSource.includes('cbs/runtimeAvailability') || !clientSource.includes('LuaLS sidecar status=')) {
  fail('cbsLanguageClient.ts does not surface LuaLS runtime availability in the Output channel');
}
pass('cbsLanguageClient.ts surfaces LuaLS runtime availability in the Output channel');

if (!clientSource.includes("getConfiguration('Lua.misc')") || !clientSource.includes("getExtension('sumneko.lua')")) {
  fail('cbsLanguageClient.ts does not auto-discover LuaLS from the installed sumneko.lua extension');
}
pass('cbsLanguageClient.ts auto-discovers LuaLS from the installed sumneko.lua extension');

if (!packageJson.scripts?.['verify:cbs-client']) {
  fail('Missing verify:cbs-client script in package.json');
}
pass('package.json exposes verify:cbs-client script');

const workspaceRoot = join(__dirname, '..', '..', '..', 'playground');
const extensionEmbeddedPath = getEmbeddedCbsServerModulePath(extensionRoot);
const workspaceLocalBinaryPath = getWorkspaceLocalCbsBinaryPath(workspaceRoot);

assert.equal(defaultCbsLanguageServerSettings().launchMode, 'auto');
assert.equal(defaultCbsLanguageServerSettings().installMode, 'local-devDependency');
pass('Default CBS client settings prefer auto + local-devDependency');

const standaloneLocalPlan = resolveCbsLanguageServerLaunch({
  exists(filePath) {
    return filePath === workspaceLocalBinaryPath;
  },
  extensionRootPath: extensionRoot,
  platform: 'linux',
  settings: defaultCbsLanguageServerSettings(),
  workspaceRootPath: workspaceRoot,
});
assert.equal(standaloneLocalPlan.kind, 'standalone');
if (standaloneLocalPlan.kind !== 'standalone') {
  fail('Expected local-devDependency plan to resolve to standalone mode');
}
assert.equal(standaloneLocalPlan.command, workspaceLocalBinaryPath);
assert.deepEqual([...standaloneLocalPlan.args], ['--stdio']);
pass('Local-devDependency install mode resolves workspace binary + --stdio');

const fallbackPlan = resolveCbsLanguageServerLaunch({
  exists(filePath) {
    return filePath === extensionEmbeddedPath;
  },
  extensionRootPath: extensionRoot,
  platform: 'linux',
  settings: defaultCbsLanguageServerSettings(),
  workspaceRootPath: workspaceRoot,
});
assert.equal(fallbackPlan.kind, 'embedded');
pass('Auto mode falls back to embedded module when standalone local binary is unavailable');

const overridePlan = resolveCbsLanguageServerLaunch({
  exists(filePath) {
    return filePath === join(workspaceRoot, 'tools', 'cbs-language-server');
  },
  extensionRootPath: extensionRoot,
  platform: 'linux',
  settings: {
    ...defaultCbsLanguageServerSettings(),
    pathOverride: './tools/cbs-language-server',
  },
  workspaceRootPath: workspaceRoot,
});
assert.equal(overridePlan.kind, 'standalone');
if (overridePlan.kind !== 'standalone') {
  fail('Expected path override to resolve to standalone mode');
}
assert.equal(overridePlan.command, join(workspaceRoot, 'tools', 'cbs-language-server'));
pass('Explicit path override resolves relative to the workspace root');

const forcedStandaloneFailure = resolveCbsLanguageServerLaunch({
  exists() {
    return false;
  },
  extensionRootPath: extensionRoot,
  platform: 'linux',
  settings: {
    ...defaultCbsLanguageServerSettings(),
    launchMode: 'standalone',
  },
  workspaceRootPath: workspaceRoot,
});
assert.equal(forcedStandaloneFailure.kind, 'failure');
pass('Forced standalone mode surfaces a resolution failure instead of silently falling back');

const globalPlan = resolveCbsLanguageServerLaunch({
  exists() {
    return false;
  },
  extensionRootPath: extensionRoot,
  platform: 'linux',
  settings: {
    ...defaultCbsLanguageServerSettings(),
    installMode: 'global',
  },
  workspaceRootPath: workspaceRoot,
});
assert.equal(globalPlan.kind, 'standalone');
if (globalPlan.kind !== 'standalone') {
  fail('Expected global install mode to return a standalone command plan');
}
assert.equal(globalPlan.command, 'cbs-language-server');
assert.deepEqual([...globalPlan.args], ['--stdio']);
pass('Global install mode resolves to cbs-language-server --stdio');

// --- Client boundary snapshot assertions through the seam ---

// Scenario 1: standalone local-devDependency success
const standaloneSnapshot = buildCbsClientBoundarySnapshot({
  extensionPath: extensionRoot,
  settings: defaultCbsLanguageServerSettings(),
  workspaceFolders: [{ fsPath: workspaceRoot }],
}, (filePath) => filePath === workspaceLocalBinaryPath);

assert.equal(standaloneSnapshot.launchPlan.kind, 'standalone');
assert.equal(standaloneSnapshot.transport, 'stdio');
assert.equal(standaloneSnapshot.forwardedWorkspaceRootPath, workspaceRoot);
assert.deepEqual(standaloneSnapshot.clientOptions.documentSelector, CBS_DOCUMENT_SELECTORS);
assert.equal(standaloneSnapshot.clientOptions.fileWatcherPattern, '**/.risu*');
assert.equal(standaloneSnapshot.initializePayloadPreview.clientCapabilities.workspaceFolders, true);
assert.equal(standaloneSnapshot.initializePayloadPreview.rootPath, workspaceRoot);
assert.equal(standaloneSnapshot.initializePayloadPreview.workspaceFolders?.length, 1);
assert.equal(standaloneSnapshot.initializePayloadPreview.workspaceFolders?.[0]?.fsPath, workspaceRoot);
if (standaloneSnapshot.launchPlan.kind === 'standalone') {
  assert.equal(standaloneSnapshot.launchPlan.command, workspaceLocalBinaryPath);
}
if (standaloneSnapshot.serverOptions && 'command' in standaloneSnapshot.serverOptions) {
  assert.equal(standaloneSnapshot.serverOptions.command, workspaceLocalBinaryPath);
  assert.deepEqual([...standaloneSnapshot.serverOptions.args], ['--stdio']);
  assert.equal(standaloneSnapshot.serverOptions.options.cwd, workspaceRoot);
}
pass('Client boundary: standalone local-devDependency forwards workspace root, stdio transport, correct selectors');

// Scenario 2: embedded auto fallback
const embeddedSnapshot = buildCbsClientBoundarySnapshot({
  extensionPath: extensionRoot,
  settings: defaultCbsLanguageServerSettings(),
  workspaceFolders: [{ fsPath: workspaceRoot }],
}, (filePath) => filePath === extensionEmbeddedPath);

assert.equal(embeddedSnapshot.launchPlan.kind, 'embedded');
assert.equal(embeddedSnapshot.transport, 'ipc');
assert.equal(embeddedSnapshot.forwardedWorkspaceRootPath, workspaceRoot);
assert.deepEqual(embeddedSnapshot.clientOptions.documentSelector, CBS_DOCUMENT_SELECTORS);
assert.equal(embeddedSnapshot.initializePayloadPreview.workspaceFolders?.length, 1);
if (embeddedSnapshot.serverOptions && 'run' in embeddedSnapshot.serverOptions) {
  assert.equal(embeddedSnapshot.serverOptions.run.module, extensionEmbeddedPath);
}
pass('Client boundary: auto fallback chooses embedded IPC, preserves selectors and watcher');

// Scenario 3: forced standalone invalid override failure UX
const invalidOverrideSnapshot = buildCbsClientBoundarySnapshot({
  extensionPath: extensionRoot,
  settings: {
    ...defaultCbsLanguageServerSettings(),
    launchMode: 'standalone',
    pathOverride: './nonexistent-binary',
  },
  workspaceFolders: [{ fsPath: workspaceRoot }],
}, () => false);

assert.equal(invalidOverrideSnapshot.launchPlan.kind, 'failure');
assert.equal(invalidOverrideSnapshot.transport, null);
assert.equal(invalidOverrideSnapshot.serverOptions, null);
assert.ok(invalidOverrideSnapshot.failureInfo);
if (invalidOverrideSnapshot.failureInfo) {
  assert.ok(invalidOverrideSnapshot.failureInfo.userMessage.includes('could not start'));
  assert.deepEqual([...invalidOverrideSnapshot.failureInfo.actions], ['Open Output', 'Open Settings']);
  assert.ok(invalidOverrideSnapshot.failureInfo.attemptedModes.includes('standalone:pathOverride'));
}
pass('Client boundary: forced standalone invalid override surfaces failure UX with actions and attempted modes');

// Scenario 4: multi-root reduced client boundary snapshot
const multiRootSnapshot = buildCbsClientBoundarySnapshot({
  extensionPath: extensionRoot,
  settings: defaultCbsLanguageServerSettings(),
  workspaceFolders: [
    { fsPath: '/first/project' },
    { fsPath: '/second/project' },
  ],
}, (filePath) => filePath === getWorkspaceLocalCbsBinaryPath('/second/project'));

assert.equal(multiRootSnapshot.forwardedWorkspaceRootPath, '/first/project');
assert.equal(multiRootSnapshot.launchPlan.kind, 'failure');
assert.ok(multiRootSnapshot.failureInfo);
assert.equal(multiRootSnapshot.initializePayloadPreview.rootPath, '/first/project');
assert.equal(multiRootSnapshot.initializePayloadPreview.workspaceFolders?.length, 2);
assert.equal(multiRootSnapshot.initializePayloadPreview.workspaceFolders?.[0]?.fsPath, '/first/project');
assert.equal(multiRootSnapshot.initializePayloadPreview.workspaceFolders?.[1]?.fsPath, '/second/project');
if (multiRootSnapshot.failureInfo) {
  assert.ok(
    multiRootSnapshot.failureInfo.detail.includes('needs an open workspace folder') ||
    multiRootSnapshot.failureInfo.detail.includes('was not found'),
  );
}
pass('Client boundary: multi-root reduces to first folder only; second-folder binary is ignored');

console.log('\n🎉 All CBS language client verifications passed!');
process.exit(EXIT_SUCCESS);

/**
 * Extension-host runtime suite for the CBS language client.
 * @file packages/vscode/tests/e2e/extension-host/suite.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';

import * as vscode from 'vscode';

import type { RisuWorkbenchExtensionApi } from '../../../src/extension';

const EXTENSION_ID = 'risuai.risu-workbench-vscode';
const HOVER_FIXTURE_NAME = 'runtime-hover.risuhtml';
const HOVER_NEEDLE = '{{getvar::mood}}';

/**
 * sleep 함수.
 * retry loop 사이에 짧게 대기함.
 *
 * @param milliseconds - 다음 재시도 전까지 기다릴 시간
 * @returns 지정한 시간 뒤 resolve되는 promise
 */
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * toHoverText 함수.
 * VS Code hover payload를 문자열로 평탄화해 assertion 친화적으로 만듦.
 *
 * @param hover - `vscode.executeHoverProvider`가 반환한 hover
 * @returns 사람이 읽을 수 있는 hover text
 */
function toHoverText(hover: vscode.Hover): string {
  return hover.contents
    .map((content) => {
      if (typeof content === 'string') {
        return content;
      }

      return content.value;
    })
    .join('\n');
}

/**
 * updateWorkspaceServerSettings 함수.
 * runtime suite가 필요한 CBS client launch 설정을 workspace scope에 씀.
 *
 * @param settings - runtime suite가 강제할 CBS client launch 설정
 */
async function updateWorkspaceServerSettings(
  settings: {
    installMode: 'global' | 'local-devDependency' | 'npx';
    launchMode: 'auto' | 'embedded' | 'standalone';
    path: string;
  },
): Promise<void> {
  const config = vscode.workspace.getConfiguration('risuWorkbench.cbs.server');
  await config.update('launchMode', settings.launchMode, vscode.ConfigurationTarget.Workspace);
  await config.update('installMode', settings.installMode, vscode.ConfigurationTarget.Workspace);
  await config.update('path', settings.path, vscode.ConfigurationTarget.Workspace);
}

/**
 * resolveStandaloneCliPath 함수.
 * runtime suite가 붙을 built standalone CLI absolute path를 계산하고 executable bit를 보장함.
 *
 * @param extensionPath - 현재 VS Code extension 개발 경로
 * @returns explicit path override로 넘길 standalone CLI 절대 경로
 */
function resolveStandaloneCliPath(extensionPath: string): string {
  const cliPath = path.resolve(extensionPath, '..', 'cbs-lsp', 'dist', 'cli.js');
  assert.ok(existsSync(cliPath), `Built standalone CLI not found: ${cliPath}`);
  chmodSync(cliPath, 0o755);
  return cliPath;
}

/**
 * waitForHoverResult 함수.
 * live LanguageClient가 didOpen/hover 왕복을 마칠 때까지 hover 결과를 재시도함.
 *
 * @param documentUri - hover를 요청할 fixture 문서 URI
 * @param position - hover를 요청할 커서 위치
 * @returns 비어 있지 않은 hover 결과 배열
 */
async function waitForHoverResult(
  documentUri: vscode.Uri,
  position: vscode.Position,
): Promise<readonly vscode.Hover[]> {
  let lastResult: readonly vscode.Hover[] = [];

  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastResult = await vscode.commands.executeCommand<readonly vscode.Hover[]>(
      'vscode.executeHoverProvider',
      documentUri,
      position,
    );

    if (lastResult.length > 0) {
      return lastResult;
    }

    await sleep(100);
  }

  return lastResult;
}

/**
 * getWorkspaceFixtureUri 함수.
 * extension-host workspace 아래의 hover fixture 파일 URI를 계산함.
 *
 * @returns hover fixture 절대 URI
 */
function getWorkspaceFixtureUri(): vscode.Uri {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(workspaceRoot, 'Expected extension-host test workspace to be open');
  return vscode.Uri.file(path.join(workspaceRoot, HOVER_FIXTURE_NAME));
}

/**
 * runRuntimeRoundtrip 함수.
 * initialize → didOpen → hover → shutdown의 실제 LanguageClient 왕복을 검증함.
 */
async function runRuntimeRoundtrip(): Promise<void> {
  const extension = vscode.extensions.getExtension<RisuWorkbenchExtensionApi>(EXTENSION_ID);
  assert.ok(extension, `Extension not found: ${EXTENSION_ID}`);

  const standaloneCliPath = resolveStandaloneCliPath(extension.extensionPath);
  await updateWorkspaceServerSettings({
    installMode: 'local-devDependency',
    launchMode: 'standalone',
    path: standaloneCliPath,
  });
  const api = await extension.activate();
  await api.awaitCbsLanguageClientReady();

  const startedState = api.getCbsLanguageClientRuntimeState();
  assert.equal(startedState.isStarted, true);
  assert.ok(startedState.client, 'Expected live LanguageClient instance');
  assert.ok(startedState.outputChannel, 'Expected output channel to exist while client is running');
  assert.equal(startedState.boundarySnapshot?.launchPlan.kind, 'standalone');

  const fixtureUri = getWorkspaceFixtureUri();
  const document = await vscode.workspace.openTextDocument(fixtureUri);
  await vscode.window.showTextDocument(document);

  const hoverPosition = document.positionAt(HOVER_NEEDLE.indexOf('getvar') + 2);
  const hovers = await waitForHoverResult(fixtureUri, hoverPosition);
  assert.ok(hovers.length > 0, 'Expected live hover result from the CBS language client');
  assert.match(toHoverText(hovers[0]), /getvar/i);

  await api.stopCbsLanguageClient();

  const stoppedState = api.getCbsLanguageClientRuntimeState();
  assert.equal(stoppedState.isStarted, false);
  assert.equal(stoppedState.client, undefined);
  assert.equal(stoppedState.outputChannel, undefined);
  assert.equal(stoppedState.boundarySnapshot, undefined);
}

/**
 * run 함수.
 * VS Code test-electron runner가 호출하는 extension-host suite 진입점.
 */
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<RisuWorkbenchExtensionApi>(EXTENSION_ID);
  try {
    await runRuntimeRoundtrip();
  } catch (error) {
    console.error('[cbs-client-runtime] suite failed', error);
    throw error;
  } finally {
    if (extension?.isActive) {
      await extension.exports.stopCbsLanguageClient();
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}

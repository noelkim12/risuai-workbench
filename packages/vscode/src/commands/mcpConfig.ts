/** VS Code command helpers for copying risuai-workbench MCP client configuration.
 * @file packages/vscode/src/commands/mcpConfig.ts
 */

type VsCodeApi = typeof import('vscode');

export const RISU_COPY_MCP_CONFIG_COMMAND = 'risuaiWorkbench.copyMcpConfig';

/** 이 확장 릴리스와 함께 검증한 `@risuai-workbench/mcp` 버전. MCP package 버전과 boundary test로 동기화함. */
export const RISU_MCP_PACKAGE_VERSION = '0.1.1';

export const RISU_MCP_SETUP_GUIDE_URL =
  'https://github.com/noelkim12/risuai-workbench/blob/main/packages/risuai-workbench-mcp/docs/HARNESS_SETUP.md';

const SERVER_NAME = 'risuai-workbench';

export type McpClientId =
  | 'claude-cli'
  | 'claude-json'
  | 'codex-cli'
  | 'codex-toml'
  | 'opencode-json'
  | 'hermes-yaml';

export interface McpClientOption {
  id: McpClientId;
  label: string;
  description: string;
}

export const MCP_CLIENT_OPTIONS: readonly McpClientOption[] = [
  { id: 'claude-cli', label: 'Claude Code', description: 'claude mcp add 명령' },
  { id: 'claude-json', label: 'Claude Code', description: '.mcp.json' },
  { id: 'codex-cli', label: 'Codex', description: 'codex mcp add 명령' },
  { id: 'codex-toml', label: 'Codex', description: '~/.codex/config.toml' },
  { id: 'opencode-json', label: 'OpenCode', description: 'opencode.json' },
  { id: 'hermes-yaml', label: 'Hermes', description: '~/.hermes/config.yaml' },
];

/** buildMcpServerArgs 함수.
 * 버전을 고정한 `npx` MCP server 실행 인자를 만듦.
 *
 * @param version - 고정할 `@risuai-workbench/mcp` 버전
 * @returns `npx` 뒤에 붙는 인자 목록
 */
export function buildMcpServerArgs(version: string): string[] {
  return [
    '--yes',
    '--package',
    `@risuai-workbench/mcp@${version}`,
    'risuai-workbench-mcp',
    '--stdio',
  ];
}

/** buildMcpConfigSnippet 함수.
 * 선택한 MCP client에 붙여 넣을 설정 snippet 또는 등록 명령을 만듦.
 *
 * @param client - 대상 MCP client 형식
 * @param version - 고정할 `@risuai-workbench/mcp` 버전
 * @returns clipboard에 복사할 텍스트
 */
export function buildMcpConfigSnippet(
  client: McpClientId,
  version: string = RISU_MCP_PACKAGE_VERSION,
): string {
  const args = buildMcpServerArgs(version);
  const shellCommand = ['npx', ...args].join(' ');

  switch (client) {
    case 'claude-cli':
      return `claude mcp add --transport stdio --scope local ${SERVER_NAME} -- ${shellCommand}`;
    case 'claude-json':
      return JSON.stringify(
        { mcpServers: { [SERVER_NAME]: { type: 'stdio', command: 'npx', args } } },
        null,
        2,
      );
    case 'codex-cli':
      return `codex mcp add ${SERVER_NAME} -- ${shellCommand}`;
    case 'codex-toml':
      return [
        `[mcp_servers.${SERVER_NAME}]`,
        'command = "npx"',
        `args = [${args.map((arg) => JSON.stringify(arg)).join(', ')}]`,
        'startup_timeout_sec = 20',
        'enabled = true',
      ].join('\n');
    case 'opencode-json':
      return JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            [SERVER_NAME]: {
              type: 'local',
              command: ['npx', ...args],
              enabled: true,
              timeout: 10000,
            },
          },
        },
        null,
        2,
      );
    case 'hermes-yaml':
      return [
        'mcp_servers:',
        `  ${SERVER_NAME}:`,
        "    command: 'npx'",
        '    args:',
        ...args.map((arg) => `      - '${arg}'`),
        '    enabled: true',
        '    connect_timeout: 60',
        '    timeout: 300',
      ].join('\n');
  }
}

/** copyMcpConfig 함수.
 * MCP client를 고른 뒤 설정 snippet을 clipboard에 복사하고 설정 가이드 링크를 안내함.
 */
export async function copyMcpConfig(): Promise<void> {
  const vscodeApi: VsCodeApi = await import('vscode');
  const selected = await vscodeApi.window.showQuickPick(
    MCP_CLIENT_OPTIONS.map((option) => ({ ...option })),
    {
      title: `Copy MCP config (@risuai-workbench/mcp@${RISU_MCP_PACKAGE_VERSION})`,
      placeHolder: 'MCP 설정을 붙여 넣을 client를 선택하세요.',
    },
  );
  if (!selected) {
    return;
  }

  await vscodeApi.env.clipboard.writeText(buildMcpConfigSnippet(selected.id));

  const openGuide = 'Open Setup Guide';
  const action = await vscodeApi.window.showInformationMessage(
    `${selected.label} (${selected.description}) MCP 설정을 클립보드에 복사했습니다. Node.js 20 이상이 필요합니다.`,
    openGuide,
  );
  if (action === openGuide) {
    await vscodeApi.env.openExternal(vscodeApi.Uri.parse(RISU_MCP_SETUP_GUIDE_URL));
  }
}

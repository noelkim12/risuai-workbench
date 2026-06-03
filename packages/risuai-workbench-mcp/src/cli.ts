#!/usr/bin/env node
/**
 * CLI entry for the RisuAI Workbench MCP server package.
 * @file packages/risuai-workbench-mcp/src/cli.ts
 */

import packageJson from '../package.json';

import { isMutationMode, type MutationMode } from './mutation/mode';
import { startStdioServer } from './transport/stdio';

export interface ParsedCliArgs {
  command: 'help' | 'stdio' | 'version';
  error: string | null;
  mutationMode?: MutationMode;
  root?: string;
}

/**
 * buildHelpText 함수.
 * stdio 시작 전 안전하게 stdout로 출력할 usage text를 만듦.
 *
 * @returns CLI help text
 */
export function buildHelpText(): string {
  return [
    'risuai-workbench-mcp',
    '',
    'Usage:',
    '  risuai-workbench-mcp --stdio',
    '  risuai-workbench-mcp --help',
    '  risuai-workbench-mcp --version',
    '',
    'Options:',
    '  --stdio     Start the MCP server over stdio. stdout is reserved for JSON-RPC.',
    '  --help      Show this help message without starting MCP stdio.',
    '  --version   Show the package version.',
  ].join('\n');
}

/**
 * readFlagValue 함수.
 * `--flag value`와 `--flag=value` 형태를 같은 방식으로 읽음.
 *
 * @param argv - CLI 인자 목록
 * @param index - 읽을 flag 위치
 * @returns flag 값과 다음 index
 */
function readFlagValue(argv: readonly string[], index: number): { nextIndex: number; value: string | null } {
  const token = argv[index];
  const [, inlineValue] = token.split('=', 2);
  if (inlineValue !== undefined) {
    return { nextIndex: index, value: inlineValue };
  }

  return {
    nextIndex: index + 1,
    value: argv[index + 1] ?? null,
  };
}

/**
 * parseCliArgs 함수.
 * MCP stdio startup 전에 CLI 인자와 root override를 검증함.
 *
 * @param argv - 사용자 입력 CLI 인자 목록
 * @returns 실행 command와 validation 결과
 */
export function parseCliArgs(argv: readonly string[] = process.argv.slice(2)): ParsedCliArgs {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
    return { command: 'help', error: null };
  }

  if (argv.length === 1 && argv[0] === '--version') {
    return { command: 'version', error: null };
  }

  let command: ParsedCliArgs['command'] | null = null;
  let mutationMode: MutationMode | undefined;
  let root: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--stdio') {
      command = 'stdio';
      continue;
    }

    if (token === '--root' || token.startsWith('--root=')) {
      const { nextIndex, value } = readFlagValue(argv, index);
      if (!value) {
        return { command: 'help', error: 'Missing value for --root.' };
      }
      root = value;
      index = nextIndex;
      continue;
    }

    if (token === '--mutation' || token.startsWith('--mutation=')) {
      const { nextIndex, value } = readFlagValue(argv, index);
      if (!value) {
        mutationMode = 'enabled';
      } else if (!isMutationMode(value)) {
        return { command: 'help', error: `Unsupported mutation mode: ${value}` };
      } else {
        mutationMode = value;
      }
      index = nextIndex;
      continue;
    }

    return { command: 'help', error: `Unsupported arguments: ${argv.join(' ')}` };
  }

  if (command !== 'stdio') {
    return { command: 'help', error: 'Startup flags require --stdio.' };
  }

  return { command, error: null, mutationMode, root };
}

/**
 * run 함수.
 * bin wrapper에서 호출하는 package CLI 실행 진입점.
 *
 * @param argv - package binary에 전달된 CLI 인자 목록
 * @returns 종료 코드 또는 stdio server lifecycle promise
 */
export function run(argv: readonly string[] = process.argv.slice(2)): number | Promise<void> {
  const parsed = parseCliArgs(argv);

  if (parsed.error) {
    console.error(parsed.error);
    console.error('Run `risuai-workbench-mcp --help` to see supported flags.');
    return 1;
  }

  if (parsed.command === 'help') {
    console.log(buildHelpText());
    return 0;
  }

  if (parsed.command === 'version') {
    console.log(packageJson.version);
    return 0;
  }

  return startStdioServer({ mutationMode: parsed.mutationMode, root: parsed.root });
}

if (require.main === module) {
  const result = run();
  if (typeof result === 'number') {
    process.exitCode = result;
  } else {
    result.catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}

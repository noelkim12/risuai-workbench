#!/usr/bin/env node
/**
 * Standalone CLI entry for the CBS language server package.
 * @file packages/cbs-lsp/src/cli.ts
 */

import packageJson from '../package.json';

import type { CbsLspLogLevel, CbsLspRuntimeConfigOverrides } from './config/runtime-config';
import { startServer } from './server';

export interface CliExecutionResult {
  exitCode: number | null;
  startedServer: boolean;
}

interface ParsedStandaloneCli {
  command: 'help' | 'stdio' | 'version';
  error: string | null;
  runtimeConfig: CbsLspRuntimeConfigOverrides;
}

function buildHelpText(): string {
  return [
    'CBS Language Server CLI',
    '',
    'Usage:',
    '  cbs-language-server --stdio',
    '    [--config ./cbs-language-server.json]',
    '    [--workspace ./workspace]',
    '    [--luals-path ./lua-language-server]',
    '    [--log-level info]',
    '  cbs-language-server --help',
    '  cbs-language-server --version',
    '',
    'Options:',
    '  --stdio    Start the language server over stdio.',
    '  --config   Read runtime settings from a JSON config file.',
    '  --help     Show this help message.',
    '  --log-level  Set standalone log verbosity (error|warn|info|debug).',
    '  --luals-path Override the LuaLS executable path.',
    '  --version  Show the package version.',
    '  --workspace Override the workspace root used for standalone startup.',
    '',
    'Scope honesty:',
    '  Standalone settings resolve as CLI flag > env > config file > initialize option.',
  ].join('\n');
}

function parseLogLevel(value: string): CbsLspLogLevel | null {
  const normalized = value.trim().toLowerCase();
  return ['error', 'warn', 'info', 'debug'].includes(normalized)
    ? (normalized as CbsLspLogLevel)
    : null;
}

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
 * parseStandaloneCli 함수.
 * stdio 실행용 CLI 인자와 runtime config override를 해석함.
 *
 * @param argv - 사용자 입력 CLI 인자 목록
 * @returns 실행 command와 validation 결과
 */
export function parseStandaloneCli(argv: readonly string[] = process.argv.slice(2)): ParsedStandaloneCli {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
    return { command: 'help', error: null, runtimeConfig: {} };
  }

  if (argv.length === 1 && argv[0] === '--version') {
    return { command: 'version', error: null, runtimeConfig: {} };
  }

  const runtimeConfig: CbsLspRuntimeConfigOverrides = {};
  let command: ParsedStandaloneCli['command'] | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--stdio') {
      command = 'stdio';
      continue;
    }

    if (
      token === '--config' ||
      token.startsWith('--config=') ||
      token === '--workspace' ||
      token.startsWith('--workspace=') ||
      token === '--luals-path' ||
      token.startsWith('--luals-path=') ||
      token === '--log-level' ||
      token.startsWith('--log-level=')
    ) {
      const { nextIndex, value } = readFlagValue(argv, index);
      if (!value) {
        return {
          command: 'help',
          error: `Missing value for ${token.split('=')[0]}.`,
          runtimeConfig: {},
        };
      }

      if (token === '--config' || token.startsWith('--config=')) {
        runtimeConfig.configPath = value;
      } else if (token === '--workspace' || token.startsWith('--workspace=')) {
        runtimeConfig.workspacePath = value;
      } else if (token === '--luals-path' || token.startsWith('--luals-path=')) {
        runtimeConfig.luaLsExecutablePath = value;
      } else {
        const logLevel = parseLogLevel(value);
        if (!logLevel) {
          return {
            command: 'help',
            error: `Unsupported log level: ${value}. Use error|warn|info|debug.`,
            runtimeConfig: {},
          };
        }
        runtimeConfig.logLevel = logLevel;
      }

      index = nextIndex;
      continue;
    }

    return {
      command: 'help',
      error: `Unsupported arguments: ${argv.join(' ')}`,
      runtimeConfig: {},
    };
  }

  if (command !== 'stdio') {
    return {
      command: 'help',
      error: 'Standalone config flags require --stdio.',
      runtimeConfig: {},
    };
  }

  return {
    command,
    error: null,
    runtimeConfig,
  };
}

/**
 * executeCli 함수.
 * 최소 standalone CLI 계약(--stdio/--help/--version)을 처리함.
 *
 * @param argv - 패키지 실행 시 전달된 CLI 인자 목록
 * @returns 즉시 종료 코드가 있으면 반환하고, stdio 서버를 시작하면 null을 반환함
 */
export function executeCli(argv: readonly string[] = process.argv.slice(2)): CliExecutionResult {
  const parsed = parseStandaloneCli(argv);

  if (parsed.error) {
    console.error(parsed.error);
    console.error('Run `cbs-language-server --help` to see the supported baseline flags.');
    return { exitCode: 1, startedServer: false };
  }

  if (parsed.command === 'help') {
    console.log(buildHelpText());
    return { exitCode: 0, startedServer: false };
  }

  if (parsed.command === 'version') {
    console.log(packageJson.version);
    return { exitCode: 0, startedServer: false };
  }

  if (parsed.command === 'stdio') {
    startServer({ runtimeConfig: parsed.runtimeConfig });
    return { exitCode: null, startedServer: true };
  }

  return { exitCode: 1, startedServer: false };
}

if (require.main === module) {
  const result = executeCli();
  if (result.exitCode !== null) {
    process.exit(result.exitCode);
  }
}

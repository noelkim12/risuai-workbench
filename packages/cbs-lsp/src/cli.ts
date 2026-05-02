#!/usr/bin/env node
/**
 * Standalone CLI entry for the CBS language server package.
 * @file packages/cbs-lsp/src/cli.ts
 */

import packageJson from '../package.json';

import type { CbsLspLogLevel, CbsLspRuntimeConfigOverrides } from './config/runtime-config';
import { executeQueryCommand, type QueryCliCommand } from './cli/query';
import { executeReportCommand, type ReportCliCommand } from './cli/report';
import { startServer } from './server';

export interface CliExecutionResult {
  exitCode: number | null;
  startedServer: boolean;
}

interface ParsedStandaloneBaseCli {
  command: 'help' | 'stdio' | 'version';
  error: string | null;
  runtimeConfig: CbsLspRuntimeConfigOverrides;
}

interface ParsedQueryCli {
  command: 'query';
  error: string | null;
  query: QueryCliCommand;
  runtimeConfig: CbsLspRuntimeConfigOverrides;
}

interface ParsedReportCli {
  command: 'report';
  error: string | null;
  report: ReportCliCommand;
  runtimeConfig: CbsLspRuntimeConfigOverrides;
}

type ParsedStandaloneCli = ParsedStandaloneBaseCli | ParsedQueryCli | ParsedReportCli;

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
    '  cbs-language-server report availability',
    '    [--config ./cbs-language-server.json]',
    '    [--workspace ./workspace]',
    '  cbs-language-server report layer1 --workspace ./workspace',
    '  cbs-language-server query variable sharedVar --workspace ./workspace',
    '  cbs-language-server query variable-at --path lorebooks/entry.risulorebook --offset 42 --workspace ./workspace',
    '  cbs-language-server query activation-entry Alpha --workspace ./workspace',
    '  cbs-language-server query activation-uri --path lorebooks/alpha.risulorebook --workspace ./workspace',
    '  cbs-language-server query activation-at --path lorebooks/alpha.risulorebook --offset 10 --workspace ./workspace',
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
    'Auxiliary JSON surfaces:',
    '  report availability   Emit runtime availability/operator snapshot JSON.',
    '  report layer1         Emit ElementRegistry + UnifiedVariableGraph snapshot JSON.',
    '  query variable        Emit VariableFlowService.queryVariable() JSON.',
    '  query variable-at     Emit VariableFlowService.queryAt() JSON for a host offset.',
    '  query activation-entry Emit ActivationChainService.queryEntry() JSON.',
    '  query activation-uri  Emit ActivationChainService.queryByUri() JSON.',
    '  query activation-at   Emit ActivationChainService.queryAt() JSON for a host offset.',
    '  query/report output always writes machine-readable JSON to stdout.',
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

function buildHelpResult(error: string | null = null): ParsedStandaloneBaseCli {
  return { command: 'help', error, runtimeConfig: {} };
}

function extractRuntimeFlags(argv: readonly string[]): {
  error: string | null;
  remainingArgs: string[];
  runtimeConfig: CbsLspRuntimeConfigOverrides;
} {
  const runtimeConfig: CbsLspRuntimeConfigOverrides = {};
  const remainingArgs: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

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
          error: `Missing value for ${token.split('=')[0]}.`,
          remainingArgs: [],
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
            error: `Unsupported log level: ${value}. Use error|warn|info|debug.`,
            remainingArgs: [],
            runtimeConfig: {},
          };
        }
        runtimeConfig.logLevel = logLevel;
      }

      index = nextIndex;
      continue;
    }

    remainingArgs.push(token);
  }

  return {
    error: null,
    remainingArgs,
    runtimeConfig,
  };
}

function parsePathUriOffsetFlags(argv: readonly string[]): {
  error: string | null;
  hostOffset?: number;
  pathValue?: string | null;
  uriValue?: string | null;
} {
  let pathValue: string | null = null;
  let uriValue: string | null = null;
  let hostOffset: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--path' || token.startsWith('--path=')) {
      const { nextIndex, value } = readFlagValue(argv, index);
      if (!value) {
        return { error: 'Missing value for --path.' };
      }
      pathValue = value;
      index = nextIndex;
      continue;
    }

    if (token === '--uri' || token.startsWith('--uri=')) {
      const { nextIndex, value } = readFlagValue(argv, index);
      if (!value) {
        return { error: 'Missing value for --uri.' };
      }
      uriValue = value;
      index = nextIndex;
      continue;
    }

    if (token === '--offset' || token.startsWith('--offset=')) {
      const { nextIndex, value } = readFlagValue(argv, index);
      const parsedOffset = value ? Number.parseInt(value, 10) : Number.NaN;
      if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
        return { error: 'Expected --offset to be a non-negative integer.' };
      }
      hostOffset = parsedOffset;
      index = nextIndex;
      continue;
    }

    return { error: `Unsupported query arguments: ${argv.join(' ')}` };
  }

  return {
    error: null,
    hostOffset,
    pathValue,
    uriValue,
  };
}

function parseReportCli(argv: readonly string[]): ParsedStandaloneCli {
  const extracted = extractRuntimeFlags(argv);
  if (extracted.error) {
    return buildHelpResult(extracted.error);
  }

  if (extracted.remainingArgs.length !== 1) {
    return buildHelpResult('Report commands expect exactly one target: availability or layer1.');
  }

  const target = extracted.remainingArgs[0];
  if (target === 'availability' || target === 'layer1') {
    return {
      command: 'report',
      error: null,
      report: { kind: target },
      runtimeConfig: extracted.runtimeConfig,
    };
  }

  return buildHelpResult(`Unsupported report target: ${target}`);
}

function parseQueryCli(argv: readonly string[]): ParsedStandaloneCli {
  const extracted = extractRuntimeFlags(argv);
  if (extracted.error) {
    return buildHelpResult(extracted.error);
  }

  const [target, ...rest] = extracted.remainingArgs;
  if (!target) {
    return buildHelpResult('Query commands require a target.');
  }

  if (target === 'variable') {
    if (rest.length !== 1) {
      return buildHelpResult('The `query variable` command expects exactly one variable name.');
    }

    return {
      command: 'query',
      error: null,
      query: { kind: 'variable', variableName: rest[0] },
      runtimeConfig: extracted.runtimeConfig,
    };
  }

  if (target === 'activation-entry') {
    if (rest.length !== 1) {
      return buildHelpResult('The `query activation-entry` command expects exactly one lorebook entry id.');
    }

    return {
      command: 'query',
      error: null,
      query: { entryId: rest[0], kind: 'activation-entry' },
      runtimeConfig: extracted.runtimeConfig,
    };
  }

  if (target === 'variable-at' || target === 'activation-uri' || target === 'activation-at') {
    const parsedFlags = parsePathUriOffsetFlags(rest);
    if (parsedFlags.error) {
      return buildHelpResult(parsedFlags.error);
    }

    if (!parsedFlags.pathValue && !parsedFlags.uriValue) {
      return buildHelpResult(`The  query ${target}  command requires --path or --uri.`.replaceAll(' ', '`'));
    }

    if ((target === 'variable-at' || target === 'activation-at') && parsedFlags.hostOffset === undefined) {
      return buildHelpResult(`The  query ${target}  command requires --offset.`.replaceAll(' ', '`'));
    }

    return {
      command: 'query',
      error: null,
      query:
        target === 'variable-at'
          ? {
              hostOffset: parsedFlags.hostOffset!,
              kind: 'variable-at',
              pathValue: parsedFlags.pathValue,
              uriValue: parsedFlags.uriValue,
            }
          : target === 'activation-uri'
            ? {
                kind: 'activation-uri',
                pathValue: parsedFlags.pathValue,
                uriValue: parsedFlags.uriValue,
              }
            : {
                hostOffset: parsedFlags.hostOffset!,
                kind: 'activation-at',
                pathValue: parsedFlags.pathValue,
                uriValue: parsedFlags.uriValue,
              },
      runtimeConfig: extracted.runtimeConfig,
    };
  }

  return buildHelpResult(`Unsupported query target: ${target}`);
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
    return buildHelpResult();
  }

  if (argv.length === 1 && argv[0] === '--version') {
    return { command: 'version', error: null, runtimeConfig: {} };
  }

  if (argv[0] === 'query') {
    return parseQueryCli(argv.slice(1));
  }

  if (argv[0] === 'report') {
    return parseReportCli(argv.slice(1));
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
          return buildHelpResult(`Missing value for ${token.split('=')[0]}.`);
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
          return buildHelpResult(`Unsupported log level: ${value}. Use error|warn|info|debug.`);
        }
        runtimeConfig.logLevel = logLevel;
      }

      index = nextIndex;
      continue;
    }

    return buildHelpResult(`Unsupported arguments: ${argv.join(' ')}`);
  }

  if (command !== 'stdio') {
    return buildHelpResult('Standalone config flags require --stdio.');
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

  try {
    if (parsed.command === 'report') {
      console.log(JSON.stringify(executeReportCommand(parsed.report, parsed.runtimeConfig), null, 2));
      return { exitCode: 0, startedServer: false };
    }

    if (parsed.command === 'query') {
      console.log(JSON.stringify(executeQueryCommand(parsed.query, parsed.runtimeConfig), null, 2));
      return { exitCode: 0, startedServer: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return { exitCode: 1, startedServer: false };
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
    process.exitCode = result.exitCode;
  }
}

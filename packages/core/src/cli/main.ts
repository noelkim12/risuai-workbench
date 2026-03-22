import { runAnalyzeCommand } from './analyze';
import { runAnalyzeCardWorkflow } from './analyze/charx/workflow';
import { runBuildCommand } from './build';
import { runExtractCommand } from './extract';
import { runPackCommand } from './pack';

type CommandRunner = (argv: readonly string[]) => number;

const COMMANDS: Record<string, CommandRunner> = {
  extract: runExtractCommand,
  pack: runPackCommand,
  analyze: runAnalyzeCommand,
  'analyze-card': runAnalyzeCardWorkflow,
  build: runBuildCommand,
};

function printHelp(): void {
  console.log(`
  🐿️ risu-core CLI

  Usage:  risu-core <command> [options]

  Commands:
    extract        캐릭터 카드 / 프리셋 / 모듈 추출 (.charx / .png / .risum / .json)
    pack           캐릭터 카드 패킹
    analyze        Lua 스크립트 분석
    analyze-card   카드 종합 분석
    build          컴포넌트 빌드

  Options:
    -h, --help     도움말

  Run 'risu-core <command> --help' for command-specific help.
`);
}

export function run(argv: readonly string[] = process.argv.slice(2)): number {
  const subcommand = argv[0];
  const rest = argv.slice(1);

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    printHelp();
    return 0;
  }

  const command = COMMANDS[subcommand];
  if (!command) {
    console.error(`\n  ❌ Unknown command: ${subcommand}`);
    console.error(`  Available commands: ${Object.keys(COMMANDS).join(', ')}\n`);
    return 1;
  }

  return command(rest);
}

if (require.main === module) {
  process.exit(run());
}

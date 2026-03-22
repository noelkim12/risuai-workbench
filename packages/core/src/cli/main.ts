import { runExtractWorkflow } from './extract/workflow';
import { runPackWorkflow } from './pack/workflow';
import { runAnalyzeWorkflow } from './analyze/workflow';
import { runBuildWorkflow } from './build/workflow';

type CommandRunner = (argv: readonly string[]) => number;

interface CommandDef {
  run: CommandRunner;
  description: string;
}

const COMMANDS: Record<string, CommandDef> = {
  extract: {
    run: runExtractWorkflow,
    description: '캐릭터 카드 / 프리셋 / 모듈 추출',
  },
  pack: {
    run: runPackWorkflow,
    description: '캐릭터 카드 패킹',
  },
  analyze: {
    run: runAnalyzeWorkflow,
    description: 'Lua 스크립트 / 카드 종합 분석',
  },
  build: {
    run: runBuildWorkflow,
    description: '컴포넌트 빌드',
  },
};

function printHelp(): void {
  const lines = Object.entries(COMMANDS).map(
    ([name, def]) => `    ${name.padEnd(15)}${def.description}`,
  );

  console.log(`
  🐿️ risu-core CLI

  Usage:  risu-core <command> [options]

  Commands:
${lines.join('\n')}

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

  return command.run(rest);
}

if (require.main === module) {
  process.exit(run());
}

import { runAnalyzeWorkflow } from './analyze/lua/workflow';

export function runAnalyzeCommand(argv: readonly string[]): number {
  return runAnalyzeWorkflow(argv);
}

if (require.main === module) {
  process.exit(runAnalyzeCommand(process.argv.slice(2)));
}

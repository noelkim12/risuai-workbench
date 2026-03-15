import { runAnalyzeCardWorkflow } from './analyze-card/workflow';

export function runAnalyzeCardCommand(argv: readonly string[]): number {
  return runAnalyzeCardWorkflow(argv);
}

if (require.main === module) {
  process.exit(runAnalyzeCardCommand(process.argv.slice(2)));
}

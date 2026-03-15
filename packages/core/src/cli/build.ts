import { runBuildWorkflow } from './build/workflow';

export function runBuildCommand(argv: readonly string[]): number {
  return runBuildWorkflow(argv);
}

if (require.main === module) {
  process.exit(runBuildCommand(process.argv.slice(2)));
}

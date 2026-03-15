import { runPackWorkflow } from './pack/workflow';

export function runPackCommand(argv: readonly string[]): number {
  return runPackWorkflow(argv);
}

if (require.main === module) {
  process.exit(runPackCommand(process.argv.slice(2)));
}

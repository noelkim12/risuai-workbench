/// <reference types="node" />

import { runExtractWorkflow } from './extract/workflow';

export function runExtractCommand(argv: readonly string[]): number {
  return runExtractWorkflow(argv);
}

if (require.main === module) {
  process.exit(runExtractCommand(process.argv.slice(2)));
}

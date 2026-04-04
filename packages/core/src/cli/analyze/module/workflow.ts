const HELP_TEXT = `
  🐿️ RisuAI Module Analyzer

  Usage:  risu-core analyze --type module <extracted-module-dir> [options]

  Options:
    --help, -h    Show this help
`;

/** module analyze CLI 진입점. Phase 2에서 구현 예정. */
export function runAnalyzeModuleWorkflow(argv: readonly string[]): number {
  const helpMode = argv.length === 0 || argv.includes('-h') || argv.includes('--help');

  if (helpMode) {
    console.log(HELP_TEXT);
    return 0;
  }

  console.log('  ⚠️  Module analysis is not yet implemented.');
  return 1;
}

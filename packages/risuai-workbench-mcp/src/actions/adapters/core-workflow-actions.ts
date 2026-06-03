/**
 * Core workflow action adapters.
 * Thin wrappers over existing mutation handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/core-workflow-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationResultEnvelope } from '../../contracts/mutation-result';

import { RunExtractInputSchema } from '../schemas/core-workflow-schemas';

import type { RunExtractInput } from '../../tools/mutation/run-extract';

import { handleRunExtract } from '../../tools/mutation';

/**
 * registerCoreWorkflowActions 함수.
 * Populates the ActionRegistry with core workflow actions.
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerCoreWorkflowActions(registry: ActionRegistry): void {
  registry.register({
    id: 'core.run_extract',
    legacyToolName: 'workbench.run_extract',
    title: 'Run extract workflow',
    summary: 'Extract a .risum, .charx, or .risup file into a canonical workspace directory, then run post-extract analyze/wiki generation.',
    capability: 'mutation.direct',
    risk: 'external_process',
    inputSchema: RunExtractInputSchema,
    aliases: ['extract', 'run_extract', 'risum', '.risum', 'charx', '.charx', 'risup', '.risup', 'unpack', 'import', '추출', '가져오기'],
    searchText: 'risu-core extract risum extract risup charx module character preset import unpack canonical workspace output directory post-extract analyze wiki',
    examples: [{ sourcePath: 'test_suites/example.risum', outDir: 'test_suites/extraction_targets', type: 'module' }],
    execute: (input, context) => handleRunExtract(input, context.workspace, context.mutationMode),
  } as WorkbenchAction<RunExtractInput, DiagnosticEnvelope | MutationResultEnvelope>);
}

/**
 * Core workflow action adapters.
 * Thin wrappers over existing mutation handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/core-workflow-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationResultEnvelope } from '../../contracts/mutation-result';

import { RunExtractInputSchema, RunPackInputSchema } from '../schemas/core-workflow-schemas';

import type { RunExtractInput } from '../../tools/mutation/run-extract';
import type { RunPackData, RunPackInput } from '../../tools/mutation/run-pack';

import { handleRunExtract, handleRunPack } from '../../tools/mutation';

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

  registry.register({
    id: 'core.run_pack',
    title: 'Run module pack workflow',
    summary: 'Pack a canonical .risumodule workspace into a .risum archive using an explicit output policy.',
    capability: 'pack',
    risk: 'external_process',
    inputSchema: RunPackInputSchema,
    aliases: ['pack', 'module pack', 'risum pack', '.risum', 'modular', 'RisuLua', 'bundle', 'archive'],
    searchText: 'risu-core pack repack build bundle canonical risumodule module risum RisuLua modular classic generated dist distributable archive output',
    examples: [{ inputRoot: 'module', outputPath: 'packed.risum', outputPolicy: 'create-new', risuluaMode: 'modular' }],
    inputGuidance: {
      fields: {
        inputRoot: { type: 'string', description: 'Workspace-relative canonical .risumodule root directory.' },
        outputPath: { type: 'string', description: 'Workspace-relative .risum archive path.' },
        outputPolicy: { type: 'enum', description: 'create-new rejects an existing output; replace-atomic writes a sibling temporary file and atomically replaces it.', enumValues: ['create-new', 'replace-atomic'], defaultValue: 'create-new' },
        risuluaMode: { type: 'enum', enumValues: ['classic', 'modular'], defaultValue: 'modular' },
        risuluaRecovery: { type: 'enum', enumValues: ['none', 'full-source'], defaultValue: 'none' },
      },
    },
    execute: (input, context) => handleRunPack(input, context.workspace, context.mutationMode),
  } as WorkbenchAction<RunPackInput, DiagnosticEnvelope<RunPackData>>);
}

import fs from 'node:fs';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import {
  buildModuleFromCanonicalDirectory,
  discoverRisuLuaBundleTarget,
  encodeModuleRisumWithAssets,
} from 'risu-workbench-core/node';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationMode } from '../../mutation/mode';
import { evaluateMutationSafetyGate } from '../../mutation/safety-gate';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import { handleValidateArtifact } from '../validate/validate-artifact';

export interface RunPackInput {
  readonly inputRoot: string;
  readonly outputPath: string;
  readonly risuluaMode: 'classic' | 'modular';
  readonly risuluaRecovery: 'none' | 'full-source';
}

export interface RunPackData {
  readonly artifactKind: 'module';
  readonly bytesWritten: number;
  readonly generatedFiles: readonly string[];
  readonly outputPath: string;
  readonly risuluaMode: 'classic' | 'modular';
  readonly validation: {
    readonly errorCount: number;
    readonly warningCount: number;
  };
}

const TOOL_NAME = 'workbench.run_pack';

function resolveContainedPath(workspaceRoot: string, inputPath: string): string | null {
  if (path.isAbsolute(inputPath)) return null;
  const resolved = path.resolve(workspaceRoot, inputPath);
  const relative = path.relative(workspaceRoot, resolved);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : resolved;
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function handleRunPack(
  input: RunPackInput,
  workspace: WorkspaceRootStatus,
  mutationMode: MutationMode,
): Promise<DiagnosticEnvelope<RunPackData>> {
  if (!workspace.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'workspace',
        id: 'WORKSPACE_ROOT_UNAVAILABLE',
        message: 'Workspace root is not available.',
        path: null,
        ruleId: 'workspace.unavailable',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const workspaceRoot = fs.realpathSync(workspace.path);
  const inputRootCandidate = resolveContainedPath(workspaceRoot, input.inputRoot);
  const outputPathCandidate = resolveContainedPath(workspaceRoot, input.outputPath);
  const inputRoot = inputRootCandidate && fs.existsSync(inputRootCandidate)
    ? fs.realpathSync(inputRootCandidate)
    : inputRootCandidate;
  const outputParentCandidate = outputPathCandidate ? path.dirname(outputPathCandidate) : null;
  const outputParent = outputParentCandidate && fs.existsSync(outputParentCandidate)
    ? fs.realpathSync(outputParentCandidate)
    : outputParentCandidate;
  const outputPath = outputPathCandidate && outputParent
    ? path.join(outputParent, path.basename(outputPathCandidate))
    : outputPathCandidate;
  if (!inputRoot || !outputPath) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'path',
        id: 'RUN_PACK_PATH_OUTSIDE_WORKSPACE',
        message: 'Pack input and output paths must be workspace-relative and contained by the workspace root.',
        path: !inputRoot ? input.inputRoot : input.outputPath,
        ruleId: 'run-pack.workspace-containment',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }
  if (!isPathInside(workspaceRoot, inputRoot) || !outputParent || !isPathInside(workspaceRoot, outputParent)) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'path',
        id: 'RUN_PACK_PATH_OUTSIDE_WORKSPACE',
        message: 'Pack input and output paths must not traverse workspace-external symlinks.',
        path: !isPathInside(workspaceRoot, inputRoot) ? input.inputRoot : input.outputPath,
        ruleId: 'run-pack.workspace-realpath-containment',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }
  if (!fs.existsSync(inputRoot) || !fs.statSync(inputRoot).isDirectory()) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'path',
        id: 'RUN_PACK_INPUT_NOT_DIRECTORY',
        message: `Pack input root is not a directory: ${input.inputRoot}.`,
        path: input.inputRoot,
        ruleId: 'run-pack.input-directory',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const validation = await handleValidateArtifact({ artifactRoot: input.inputRoot }, workspace);
  if (validation.summary.errorCount > 0 || validation.data?.artifactKind !== 'module') {
    return createDiagnosticEnvelope({
      diagnostics: validation.diagnostics,
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const bundleTarget = input.risuluaMode === 'modular'
    ? discoverRisuLuaBundleTarget({ rootDir: inputRoot, mode: 'modular' })
    : null;
  if (path.extname(outputPath).toLowerCase() !== '.risum' || fs.existsSync(outputPath)) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'path',
        id: 'RUN_PACK_OUTPUT_INVALID',
        message: 'Pack output must be a new workspace-relative .risum file.',
        path: input.outputPath,
        ruleId: 'run-pack.output-file',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  if (!fs.existsSync(outputParent) || !fs.statSync(outputParent).isDirectory()) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'path',
        id: 'RUN_PACK_OUTPUT_PARENT_MISSING',
        message: `Pack output parent directory does not exist: ${path.dirname(input.outputPath)}.`,
        path: input.outputPath,
        ruleId: 'run-pack.output-parent',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  if (mutationMode === 'preview-only') {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'mutation-safety',
        id: 'RUN_PACK_PREVIEW_ONLY',
        message: 'Pack execution is disabled while mutation mode is preview-only.',
        path: input.outputPath,
        ruleId: 'run-pack.preview-only',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  const safetyResult = await evaluateMutationSafetyGate({
    mode: mutationMode,
    targets: [
      { intent: 'read-existing', path: input.inputRoot },
      { intent: 'create-missing', path: input.outputPath },
      ...(bundleTarget
        ? [{
            intent: fs.existsSync(bundleTarget.distPath) ? 'write-existing' as const : 'create-missing' as const,
            path: path.relative(workspaceRoot, bundleTarget.distPath),
          }]
        : []),
    ],
    toolName: TOOL_NAME,
    workspace,
  });
  if (!safetyResult.ok) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'mutation-safety',
        id: 'RUN_PACK_SAFETY_REJECTED',
        message: `Pack safety gate rejected the request: ${safetyResult.reason}.`,
        path: input.outputPath,
        ruleId: `run-pack.${safetyResult.reason}`,
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }

  try {
    const packed = buildModuleFromCanonicalDirectory(inputRoot, {
      risuluaMode: input.risuluaMode,
      risuluaRecovery: input.risuluaRecovery,
      writeRisuLuaDist: input.risuluaMode === 'modular',
    });
    const archive = encodeModuleRisumWithAssets(packed.module, packed.assetBuffers);
    await writeFile(outputPath, archive, { flag: 'wx' });
    return createDiagnosticEnvelope({
      data: {
        artifactKind: 'module',
        bytesWritten: archive.byteLength,
        generatedFiles: bundleTarget ? [bundleTarget.distRelativePath] : [],
        outputPath: input.outputPath,
        risuluaMode: input.risuluaMode,
        validation: {
          errorCount: validation.summary.errorCount,
          warningCount: validation.summary.warningCount,
        },
      },
      diagnostics: [],
      status: 'ok',
      tool: TOOL_NAME,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'pack',
        id: 'RUN_PACK_FAILED',
        message: error.message,
        path: input.inputRoot,
        ruleId: 'run-pack.failed',
        severity: 'error',
      }],
      status: 'domain_error',
      tool: TOOL_NAME,
    });
  }
}

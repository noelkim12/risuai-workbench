/**
 * build_path tool handler.
 * Build canonical relative path from target/artifact/stem components.
 * @file packages/risuai-workbench-mcp/src/tools/build-path.ts
 */

import {
  buildCanonicalArtifactPath,
  isCustomExtensionTarget,
  isCustomExtensionArtifact,
  type CustomExtensionTarget,
  type CustomExtensionArtifact,
} from 'risu-workbench-core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';

export interface BuildPathInput {
  target: string;
  artifact: string;
  targetName?: string;
  stem?: string;
}

/**
 * handleBuildPath 함수.
 * target/artifact/stem 구성 요소에서 canonical relative path를 생성함.
 *
 * @param input - target, artifact, 선택적 targetName/stem
 * @returns diagnostic envelope에 감싸진 build path 결과
 */
export async function handleBuildPath(
  input: BuildPathInput,
): Promise<DiagnosticEnvelope> {
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!isCustomExtensionTarget(input.target)) {
    diagnostics.push({
      category: 'build-path',
      id: 'INVALID_TARGET',
      message: `"${input.target}" is not a valid target. Expected one of: charx, module, preset.`,
      path: null,
      ruleId: 'build-path.invalid-target',
      severity: 'error',
    });
  }

  if (!isCustomExtensionArtifact(input.artifact)) {
    diagnostics.push({
      category: 'build-path',
      id: 'INVALID_ARTIFACT',
      message: `"${input.artifact}" is not a valid artifact type.`,
      path: null,
      ruleId: 'build-path.invalid-artifact',
      severity: 'error',
    });
  }

  if (diagnostics.length > 0) {
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_error',
      tool: 'workbench.build_path',
    });
  }

  try {
    const canonicalPath = buildCanonicalArtifactPath({
      artifact: input.artifact as CustomExtensionArtifact,
      stem: input.stem,
      target: input.target as CustomExtensionTarget,
      targetName: input.targetName,
    });

    return createDiagnosticEnvelope({
      data: { canonicalPath },
      diagnostics: [],
      status: 'ok',
      tool: 'workbench.build_path',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error building canonical path.';
    return createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'build-path',
          id: 'BUILD_PATH_FAILED',
          message,
          path: null,
          ruleId: 'build-path.failed',
          severity: 'error',
        },
      ],
      status: 'domain_error',
      tool: 'workbench.build_path',
    });
  }
}

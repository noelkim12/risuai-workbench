import fs from 'node:fs';
import path from 'node:path';

import {
  RISULUA_DIST_GENERATED_HEADER,
  analyzeRisuLuaDistOutput,
  bundleRisuLuaModularGraph,
  resolveRisuLuaModularGraph,
  writeRisuLuaDist,
  type RisuLuaBundleTarget,
  type RisuLuaDistDiagnostic,
} from '../../../cli/shared';
import type { DistBuildStrategy, RisuLuaSplitPlan } from '../shared/types';

export interface BuildRisuLuaSplitDistOptions {
  outputRoot: string;
  plan: RisuLuaSplitPlan;
}

export interface RisuLuaSplitDistBuildResult {
  strategy: DistBuildStrategy;
  distPath: string | null;
  distRelativePath: string | null;
  wroteDist: boolean;
  distBlocked?: boolean;
  staleDistDetected: boolean;
  code: string | null;
  diagnostics?: RisuLuaDistDiagnostic[];
}

export function buildRisuLuaSplitDist(
  options: BuildRisuLuaSplitDistOptions,
): RisuLuaSplitDistBuildResult {
  const { outputRoot, plan } = options;
  if (plan.buildStrategy === 'concat-build-time-require') {
    return buildPlainDist(outputRoot, plan);
  }
  if (plan.buildStrategy === 'section-order-concat') {
    return buildSectionDist(outputRoot, plan);
  }
  return buildNoDistResult(outputRoot, plan);
}

function buildPlainDist(outputRoot: string, plan: RisuLuaSplitPlan): RisuLuaSplitDistBuildResult {
  const target = createModularTarget(outputRoot, plan);
  const graph = resolveRisuLuaModularGraph({ target });
  const bundled = bundleRisuLuaModularGraph({ graph });
  const bundledWithLocalFragments = plan.mode === 'coarse'
    ? prependPlainLocalFragments(outputRoot, plan, bundled.code)
    : bundled.code;
  const writeResult = writeRisuLuaDist({ target, bundled: bundledWithLocalFragments });
  const diagnostics = analyzeRisuLuaDistOutput({
    code: writeResult.code,
    distPath: writeResult.distPath,
    distRelativePath: writeResult.distRelativePath,
  });
  const blockingDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity !== 'warning');
  if (blockingDiagnostics.length > 0) {
    fs.rmSync(writeResult.distPath, { force: true });
    return {
      strategy: plan.buildStrategy,
      distPath: writeResult.distPath,
      distRelativePath: writeResult.distRelativePath,
      wroteDist: false,
      distBlocked: true,
      staleDistDetected: false,
      code: null,
      diagnostics,
    };
  }
  return {
    strategy: plan.buildStrategy,
    distPath: writeResult.distPath,
    distRelativePath: writeResult.distRelativePath,
    wroteDist: true,
    distBlocked: false,
    staleDistDetected: false,
    code: writeResult.code,
    diagnostics: [],
  };
}

function prependPlainLocalFragments(outputRoot: string, plan: RisuLuaSplitPlan, bundledCode: string): string {
  const localFragments = plan.files
    .filter((file) => file.kind === 'chunk-fragment' && file.path.startsWith('lua/'))
    .sort((left, right) => left.preserveOrderIndex - right.preserveOrderIndex)
    .map((file) => fs.readFileSync(path.join(outputRoot, ...file.path.split('/')), 'utf8'));
  if (localFragments.length === 0) return bundledCode;
  return [
    '-- Build-time local helper fragments; prepended before bundled main to preserve lexical local scope.',
    ...localFragments.map((fragment) => fragment.trimEnd()),
    bundledCode,
  ].join('\n\n');
}

function buildSectionDist(outputRoot: string, plan: RisuLuaSplitPlan): RisuLuaSplitDistBuildResult {
  const distRelativePath = requireDistPath(plan);
  const distPath = path.join(outputRoot, ...distRelativePath.split('/'));
  const code = `${RISULUA_DIST_GENERATED_HEADER}${readOrderedSections(outputRoot, plan)}`;
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(distPath, code, 'utf8');
  return {
    strategy: plan.buildStrategy,
    distPath,
    distRelativePath,
    wroteDist: true,
    distBlocked: false,
    staleDistDetected: false,
    code,
    diagnostics: [],
  };
}

function buildNoDistResult(outputRoot: string, plan: RisuLuaSplitPlan): RisuLuaSplitDistBuildResult {
  const distRelativePath = plan.distPath;
  const distPath = distRelativePath ? path.join(outputRoot, ...distRelativePath.split('/')) : null;
  return {
    strategy: plan.buildStrategy,
    distPath,
    distRelativePath,
    wroteDist: false,
    distBlocked: false,
    staleDistDetected: distPath !== null && fs.existsSync(distPath),
    code: null,
    diagnostics: [],
  };
}

function readOrderedSections(outputRoot: string, plan: RisuLuaSplitPlan): string {
  return plan.files
    .filter((file) => file.kind === 'chunk-fragment')
    .sort((left, right) => left.preserveOrderIndex - right.preserveOrderIndex)
    .map((file) => fs.readFileSync(path.join(outputRoot, ...file.path.split('/')), 'utf8'))
    .join('');
}

function createModularTarget(outputRoot: string, plan: RisuLuaSplitPlan): RisuLuaBundleTarget {
  const distRelativePath = requireDistPath(plan);
  return {
    rootDir: outputRoot,
    markerPath: path.join(outputRoot, '.risumodule'),
    markerKind: 'risu.module',
    rawTargetName: plan.targetName,
    targetName: plan.targetName,
    mode: 'modular',
    entryPath: path.join(outputRoot, 'lua', 'main.risulua'),
    entryRelativePath: 'lua/main.risulua',
    sourceRoot: path.join(outputRoot, 'lua'),
    distPath: path.join(outputRoot, ...distRelativePath.split('/')),
    distRelativePath,
  };
}

function requireDistPath(plan: RisuLuaSplitPlan): string {
  if (plan.distPath === null) {
    throw new Error(`RisuLua split strategy ${plan.buildStrategy} has no distPath`);
  }
  return plan.distPath;
}

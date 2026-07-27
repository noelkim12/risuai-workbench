import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { analyzeLuaSource } from 'risu-workbench-core';
import { listRisuLuaSourceModules } from 'risu-workbench-core/node';

type LuaArtifact = ReturnType<typeof analyzeLuaSource>;

export interface WorkspaceLuaCallEdge {
  readonly caller: string;
  readonly callee: string;
  readonly line: number;
  readonly memberName: string;
  readonly moduleName: string;
  readonly status: 'resolved' | 'unresolved';
  readonly targetPath: string | null;
}

export interface WorkspaceLuaCallGraphResult {
  readonly crossModuleEdges: readonly WorkspaceLuaCallEdge[];
  readonly workspaceCallGraph: ReadonlyArray<{
    readonly caller: string;
    readonly callees: readonly string[];
  }>;
}

function findLuaSourceRoot(entryPath: string): string {
  let candidate = path.dirname(path.resolve(entryPath));
  while (true) {
    if (path.basename(candidate) === 'lua') return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) return path.dirname(path.resolve(entryPath));
    candidate = parent;
  }
}

function qualifiedCaller(moduleId: string, artifact: LuaArtifact, caller: string): string {
  const fn = artifact.collected.functions.find((candidate) => candidate.name === caller);
  const displayName = fn?.displayName ?? caller;
  const memberName = displayName.split('.').at(-1) ?? displayName;
  return `${moduleId}.${memberName}`;
}

function resolvesExport(artifact: LuaArtifact | undefined, memberName: string): boolean {
  return artifact?.collected.moduleExports?.some((moduleExport) => (
    moduleExport.memberName === memberName
  )) ?? false;
}

export async function buildWorkspaceLuaCallGraph(entryPath: string): Promise<WorkspaceLuaCallGraphResult> {
  const sourceRoot = findLuaSourceRoot(entryPath);
  const modules = listRisuLuaSourceModules(sourceRoot);
  const analyzedModules = await Promise.all(modules.map(async (moduleFile) => ({
    artifact: analyzeLuaSource({
      charxData: null,
      filePath: moduleFile.filePath,
      source: await readFile(moduleFile.filePath, 'utf8'),
    }),
    id: moduleFile.id,
    path: moduleFile.filePath,
  })));
  const artifactsById = new Map(analyzedModules.map((moduleFile) => [moduleFile.id, moduleFile]));
  const edges: WorkspaceLuaCallEdge[] = [];

  for (const moduleFile of analyzedModules) {
    for (const moduleCall of moduleFile.artifact.collected.moduleMemberCalls) {
      if (!moduleCall.caller) continue;
      const binding = moduleFile.artifact.collected.requireBindings.find((candidate) => (
        candidate.localName === moduleCall.aliasName
        && candidate.containingFunction === moduleCall.caller
      )) ?? moduleFile.artifact.collected.requireBindings.find((candidate) => (
        candidate.localName === moduleCall.aliasName && candidate.containingFunction === null
      ));
      if (!binding) continue;

      const target = artifactsById.get(binding.moduleName);
      edges.push({
        caller: qualifiedCaller(moduleFile.id, moduleFile.artifact, moduleCall.caller),
        callee: `${binding.moduleName}.${moduleCall.memberName}`,
        line: moduleCall.line,
        memberName: moduleCall.memberName,
        moduleName: binding.moduleName,
        status: resolvesExport(target?.artifact, moduleCall.memberName) ? 'resolved' : 'unresolved',
        targetPath: target?.path ?? null,
      });
    }
  }

  edges.sort((left, right) => (
    left.caller.localeCompare(right.caller)
    || left.callee.localeCompare(right.callee)
    || left.line - right.line
  ));
  const calleesByCaller = new Map<string, Set<string>>();
  for (const edge of edges) {
    const callees = calleesByCaller.get(edge.caller) ?? new Set<string>();
    callees.add(edge.callee);
    calleesByCaller.set(edge.caller, callees);
  }

  return {
    crossModuleEdges: edges,
    workspaceCallGraph: [...calleesByCaller.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([caller, callees]) => ({ caller, callees: [...callees].sort() })),
  };
}

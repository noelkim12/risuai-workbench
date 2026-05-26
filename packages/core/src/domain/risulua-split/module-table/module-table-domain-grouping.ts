import type { RisuLuaDomainGroupingMetadata } from './module-table-contracts';

export interface RisuLuaDomainGroupingContext {
  pathForName(name: string): string;
  groupingForName(name: string): RisuLuaDomainGroupingMetadata;
}

export interface RisuLuaDomainGroupingOptions {
  dependencies?: ReadonlyMap<string, readonly string[]>;
}

const WEAK_DOMAIN_TOKENS = new Set([
  'add',
  'and',
  'apply',
  'build',
  'calc',
  'clear',
  'collect',
  'convert',
  'count',
  'create',
  'decode',
  'detect',
  'draw',
  'encode',
  'ensure',
  'execute',
  'extract',
  'fill',
  'find',
  'float',
  'format',
  'from',
  'generate',
  'get',
  'handle',
  'has',
  'is',
  'join',
  'literal',
  'load',
  'make',
  'normalize',
  'number',
  'parse',
  'percent',
  'pick',
  'placeholder',
  'process',
  'read',
  'rebuild',
  'remove',
  'render',
  'reset',
  'resolve',
  'restore',
  'round',
  'save',
  'set',
  'shuffle',
  'split',
  'sync',
  'text',
  'to',
  'trim',
  'try',
  'tenth',
  'update',
  'write',
]);

type UtilityFamily = 'array' | 'number' | 'text';
type ActionFamily = 'render';

const UTILITY_FAMILY_TOKENS: Record<UtilityFamily, ReadonlySet<string>> = {
  array: new Set(['array']),
  text: new Set(['join', 'literal', 'normalize', 'placeholder', 'split', 'text', 'trim']),
  number: new Set(['clamp', 'float', 'initiative', 'number', 'percent', 'round', 'tenth', 'int']),
};

const UTILITY_FAMILY_PATHS: Record<UtilityFamily, string> = {
  array: 'lua/domain/array.risulua',
  text: 'lua/domain/text.risulua',
  number: 'lua/domain/number.risulua',
};

const ACTION_FAMILY_PATHS: Record<ActionFamily, string> = {
  render: 'lua/domain/render.risulua',
};

export function createRisuLuaDomainGroupingContext(
  names: readonly string[],
  options: RisuLuaDomainGroupingOptions = {},
): RisuLuaDomainGroupingContext {
  const uniqueNames = [...new Set(names)].sort();
  const tokenCounts = new Map<string, number>();
  const normalizedPhraseCounts = new Map<string, number>();

  for (const name of uniqueNames) {
    for (const token of strongTokensForName(name)) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
    const phrase = normalizedTokenPhraseForName(name);
    if (phrase !== undefined)
      normalizedPhraseCounts.set(phrase, (normalizedPhraseCounts.get(phrase) ?? 0) + 1);
  }

  const groupedPaths = new Map<string, string>();
  const groupingByName = new Map<string, RisuLuaDomainGroupingMetadata>();
  for (const name of uniqueNames) {
    const groupToken = bestRepeatedToken(name, tokenCounts);
    const normalizedPhrase = normalizedTokenPhraseForName(name);
    const normalizedPhraseGroup =
      normalizedPhrase !== undefined && (normalizedPhraseCounts.get(normalizedPhrase) ?? 0) >= 2
        ? normalizedPhrase
        : undefined;
    const repeatedTokenPeers =
      groupToken !== undefined
        ? uniqueNames.filter((candidate) => strongTokensForName(candidate).includes(groupToken))
        : undefined;
    const normalizedPhrasePeers =
      normalizedPhraseGroup !== undefined
        ? uniqueNames.filter(
            (candidate) => normalizedTokenPhraseForName(candidate) === normalizedPhraseGroup,
          )
        : undefined;
    const shouldPreferNormalizedPhrase =
      normalizedPhraseGroup !== undefined &&
      repeatedTokenPeers !== undefined &&
      normalizedPhrasePeers !== undefined &&
      repeatedTokenPeers.length === normalizedPhrasePeers.length &&
      repeatedTokenPeers.every((peer, index) => peer === normalizedPhrasePeers[index]);
    const repeatedTokenGroup = shouldPreferNormalizedPhrase ? undefined : groupToken;
    const path =
      repeatedTokenGroup !== undefined
        ? `lua/domain/${groupToken}.risulua`
        : normalizedPhraseGroup !== undefined
          ? `lua/domain/${normalizedPhraseGroup}.risulua`
          : domainFunctionPath(name);
    const peers =
      repeatedTokenGroup !== undefined
        ? repeatedTokenPeers!
        : normalizedPhraseGroup !== undefined
          ? normalizedPhrasePeers!
          : [name];
    groupedPaths.set(name, path);
    groupingByName.set(name, {
      reason:
        repeatedTokenGroup !== undefined
          ? 'repeated-token'
          : normalizedPhraseGroup !== undefined
            ? 'normalized-token'
            : 'singleton',
      path,
      token: repeatedTokenGroup ?? normalizedPhraseGroup,
      peers,
    });
  }

  coalesceUtilityFamilyGroups(uniqueNames, groupedPaths, groupingByName);
  const semanticGroupedPaths = new Map(groupedPaths);
  const semanticGroupingByName = new Map(groupingByName);

  for (const component of cyclicDomainComponents(uniqueNames, options.dependencies)) {
    if (component.length < 2) continue;
    const componentPath = pathForComponent(component, tokenCounts, groupedPaths);
    for (const name of component) {
      groupedPaths.set(name, componentPath);
      groupingByName.set(name, {
        reason: 'cycle-coalesced',
        path: componentPath,
        peers: [...component].sort(),
      });
    }
  }

  coalesceCyclicModuleGroups(
    uniqueNames,
    options.dependencies,
    tokenCounts,
    groupedPaths,
    groupingByName,
  );
  restoreSafeSemanticClusters(
    uniqueNames,
    options.dependencies,
    semanticGroupedPaths,
    semanticGroupingByName,
    groupedPaths,
    groupingByName,
  );
  restoreSafeUtilityFamilyGroups(uniqueNames, options.dependencies, groupedPaths, groupingByName);
  coalesceActionFamilyGroups(uniqueNames, groupedPaths, groupingByName);

  return {
    pathForName(name: string): string {
      return groupedPaths.get(name) ?? domainFunctionPath(name);
    },
    groupingForName(name: string): RisuLuaDomainGroupingMetadata {
      return (
        groupingByName.get(name) ?? {
          reason: 'singleton',
          path: domainFunctionPath(name),
          peers: [name],
        }
      );
    },
  };
}

function coalesceUtilityFamilyGroups(
  names: readonly string[],
  groupedPaths: Map<string, string>,
  groupingByName: Map<string, RisuLuaDomainGroupingMetadata>,
): void {
  const namesByFamily = new Map<UtilityFamily, string[]>();
  for (const name of names) {
    const family = utilityFamilyForName(name);
    if (family === undefined) continue;
    namesByFamily.set(family, [...(namesByFamily.get(family) ?? []), name]);
  }

  for (const family of (Object.keys(UTILITY_FAMILY_PATHS) as UtilityFamily[]).sort()) {
    const familyNames = uniqueSorted(namesByFamily.get(family) ?? []);
    if (familyNames.length === 0) continue;
    const path = UTILITY_FAMILY_PATHS[family];
    for (const name of familyNames) {
      groupedPaths.set(name, path);
      groupingByName.set(name, {
        reason: 'utility-family',
        path,
        family,
        peers: familyNames,
      });
    }
  }
}

function coalesceActionFamilyGroups(
  names: readonly string[],
  groupedPaths: Map<string, string>,
  groupingByName: Map<string, RisuLuaDomainGroupingMetadata>,
): void {
  const namesByFamily = new Map<ActionFamily, string[]>();
  for (const name of names) {
    const family = actionFamilyForName(name);
    if (family === undefined) continue;
    namesByFamily.set(family, [...(namesByFamily.get(family) ?? []), name]);
  }

  for (const family of (Object.keys(ACTION_FAMILY_PATHS) as ActionFamily[]).sort()) {
    const familyNames = uniqueSorted(namesByFamily.get(family) ?? []);
    if (familyNames.length < 2) continue;
    const path = ACTION_FAMILY_PATHS[family];
    for (const name of familyNames) {
      groupedPaths.set(name, path);
      groupingByName.set(name, {
        reason: 'action-family',
        path,
        family,
        peers: familyNames,
      });
    }
  }
}

function coalesceCyclicModuleGroups(
  names: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]> | undefined,
  tokenCounts: Map<string, number>,
  groupedPaths: Map<string, string>,
  groupingByName: Map<string, RisuLuaDomainGroupingMetadata>,
): void {
  if (dependencies === undefined) return;
  let changed = true;
  while (changed) {
    changed = false;
    for (const moduleComponent of cyclicModuleComponents(names, dependencies, groupedPaths)) {
      const componentNames = names.filter((name) =>
        moduleComponent.includes(groupedPaths.get(name) ?? domainFunctionPath(name)),
      );
      if (componentNames.length < 2) continue;
      const componentPath = pathForComponent(componentNames, tokenCounts, groupedPaths);
      const peers = [...componentNames].sort();
      for (const name of componentNames) {
        if (groupedPaths.get(name) !== componentPath) {
          groupedPaths.set(name, componentPath);
          changed = true;
        }
        groupingByName.set(name, {
          reason: 'cycle-coalesced',
          path: componentPath,
          peers,
        });
      }
    }
  }
}

interface SafeSemanticCluster {
  path: string;
  names: string[];
  reason: RisuLuaDomainGroupingMetadata['reason'];
  token?: string;
  family?: RisuLuaDomainGroupingMetadata['family'];
}

function semanticClusters(
  names: readonly string[],
  semanticGroupedPaths: ReadonlyMap<string, string>,
  semanticGroupingByName: ReadonlyMap<string, RisuLuaDomainGroupingMetadata>,
): SafeSemanticCluster[] {
  const namesByPath = new Map<string, string[]>();
  for (const name of names) {
    const path = semanticGroupedPaths.get(name) ?? domainFunctionPath(name);
    namesByPath.set(path, [...(namesByPath.get(path) ?? []), name]);
  }

  return [...namesByPath.entries()]
    .map(([path, pathNames]) => {
      const clusterNames = uniqueSorted(pathNames);
      const representative = clusterNames
        .map((name) => semanticGroupingByName.get(name))
        .find((grouping) => grouping !== undefined && grouping.path === path);
      return {
        path,
        names: clusterNames,
        reason: representative?.reason ?? 'singleton',
        token: representative?.token,
        family: representative?.family,
      } satisfies SafeSemanticCluster;
    })
    .sort((left, right) => {
      const sizeDiff = right.names.length - left.names.length;
      if (sizeDiff !== 0) return sizeDiff;
      return left.path.localeCompare(right.path);
    });
}

function restoreSafeSemanticClusters(
  names: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]> | undefined,
  semanticGroupedPaths: ReadonlyMap<string, string>,
  semanticGroupingByName: ReadonlyMap<string, RisuLuaDomainGroupingMetadata>,
  groupedPaths: Map<string, string>,
  groupingByName: Map<string, RisuLuaDomainGroupingMetadata>,
): void {
  if (dependencies === undefined) return;
  for (const cluster of semanticClusters(names, semanticGroupedPaths, semanticGroupingByName)) {
    if (cluster.names.length < 2) continue;
    if (cluster.reason === 'singleton') continue;
    const namesAtClusterPath = names.filter((name) => groupedPaths.get(name) === cluster.path);
    if (
      namesAtClusterPath.length === cluster.names.length &&
      cluster.names.every((name) => groupedPaths.get(name) === cluster.path)
    )
      continue;

    const trialGroupedPaths = new Map(groupedPaths);
    for (const name of cluster.names) trialGroupedPaths.set(name, cluster.path);
    if (cyclicModuleComponents(names, dependencies, trialGroupedPaths).length > 0) continue;

    for (const name of cluster.names) {
      groupedPaths.set(name, cluster.path);
      groupingByName.set(name, {
        reason: cluster.reason,
        path: cluster.path,
        token: cluster.token,
        family: cluster.family,
        peers: cluster.names,
      });
    }
  }
}

function restoreSafeUtilityFamilyGroups(
  names: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]> | undefined,
  groupedPaths: Map<string, string>,
  groupingByName: Map<string, RisuLuaDomainGroupingMetadata>,
): void {
  if (dependencies === undefined) return;
  for (const name of names) {
    const family = utilityFamilyForName(name);
    if (family === undefined) continue;
    const path = UTILITY_FAMILY_PATHS[family];
    if (groupedPaths.get(name) === path) continue;

    const trialGroupedPaths = new Map(groupedPaths);
    trialGroupedPaths.set(name, path);
    if (cyclicModuleComponents(names, dependencies, trialGroupedPaths).length > 0) continue;

    groupedPaths.set(name, path);
    const familyNames = uniqueSorted(
      names.filter((candidate) => utilityFamilyForName(candidate) === family),
    );
    groupingByName.set(name, {
      reason: 'utility-family',
      path,
      family,
      peers: familyNames,
    });
  }
}

function cyclicModuleComponents(
  names: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]>,
  groupedPaths: Map<string, string>,
): string[][] {
  const modulePaths = uniqueSorted(
    names.map((name) => groupedPaths.get(name) ?? domainFunctionPath(name)),
  );
  const nameSet = new Set(names);
  const graph = new Map<string, string[]>();
  for (const modulePath of modulePaths) graph.set(modulePath, []);

  for (const name of names) {
    const fromPath = groupedPaths.get(name) ?? domainFunctionPath(name);
    const toPaths = (dependencies.get(name) ?? [])
      .filter((dependency) => nameSet.has(dependency))
      .map((dependency) => groupedPaths.get(dependency) ?? domainFunctionPath(dependency))
      .filter((toPath) => toPath !== fromPath);
    graph.set(fromPath, uniqueSorted([...(graph.get(fromPath) ?? []), ...toPaths]));
  }

  return stronglyConnectedComponents(modulePaths, graph).filter(
    (component) => component.length > 1,
  );
}

function cyclicDomainComponents(
  names: readonly string[],
  dependencies: ReadonlyMap<string, readonly string[]> | undefined,
): string[][] {
  if (dependencies === undefined) return [];
  const nameSet = new Set(names);
  const graph = new Map<string, string[]>();
  for (const name of names) graph.set(name, []);

  for (const name of names) {
    graph.set(
      name,
      uniqueSorted(
        (dependencies.get(name) ?? []).filter(
          (dependency) => nameSet.has(dependency) && dependency !== name,
        ),
      ),
    );
  }

  return stronglyConnectedComponents(names, graph).filter((component) => component.length > 1);
}

function stronglyConnectedComponents(
  nodes: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const indexByName = new Map<string, number>();
  const lowlinkByName = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  function connect(name: string): void {
    indexByName.set(name, nextIndex);
    lowlinkByName.set(name, nextIndex);
    nextIndex += 1;
    stack.push(name);
    onStack.add(name);

    for (const dependency of graph.get(name) ?? []) {
      if (!indexByName.has(dependency)) {
        connect(dependency);
        lowlinkByName.set(name, Math.min(lowlinkByName.get(name)!, lowlinkByName.get(dependency)!));
      } else if (onStack.has(dependency)) {
        lowlinkByName.set(name, Math.min(lowlinkByName.get(name)!, indexByName.get(dependency)!));
      }
    }

    if (lowlinkByName.get(name) !== indexByName.get(name)) return;

    const component: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
      if (current === name) break;
    }
    components.push(component.sort());
  }

  for (const node of nodes) {
    if (!indexByName.has(node)) connect(node);
  }
  return components;
}

function pathForComponent(
  names: readonly string[],
  tokenCounts: Map<string, number>,
  groupedPaths: Map<string, string>,
): string {
  const tokenScores = new Map<string, number>();
  for (const name of names) {
    for (const token of strongTokensForName(name)) {
      tokenScores.set(token, (tokenScores.get(token) ?? 0) + 1);
    }
  }

  const bestToken = [...tokenScores.entries()].sort((left, right) => {
    const componentDiff = right[1] - left[1];
    if (componentDiff !== 0) return componentDiff;
    const globalDiff = (tokenCounts.get(right[0]) ?? 0) - (tokenCounts.get(left[0]) ?? 0);
    if (globalDiff !== 0) return globalDiff;
    return left[0].localeCompare(right[0]);
  })[0]?.[0];

  if (bestToken !== undefined) return `lua/domain/${bestToken}.risulua`;
  return groupedPaths.get(names[0]) ?? domainFunctionPath(names[0]);
}

export function domainFunctionPath(name: string): string {
  return `lua/domain/${toSnakeCase(name)}.risulua`;
}

function bestRepeatedToken(name: string, tokenCounts: Map<string, number>): string | undefined {
  const candidates = strongTokensForName(name)
    .filter((token) => (tokenCounts.get(token) ?? 0) >= 2)
    .sort((left, right) => {
      const countDiff = (tokenCounts.get(right) ?? 0) - (tokenCounts.get(left) ?? 0);
      if (countDiff !== 0) return countDiff;
      return left.localeCompare(right);
    });
  return candidates[0];
}

function strongTokensForName(name: string): string[] {
  const normalizedTokens = tokenizeName(name).map(normalizeDomainToken);
  const semanticAliases =
    normalizedTokens.includes('state') && normalizedTokens.includes('history') ? ['string'] : [];
  return uniqueSorted(
    normalizedTokens
      .concat(semanticAliases)
      .filter((token) => token.length >= 3 && !WEAK_DOMAIN_TOKENS.has(token)),
  );
}

function normalizedTokenPhraseForName(name: string): string | undefined {
  const tokens = tokenizeName(name)
    .map(normalizeDomainToken)
    .filter((token) => token.length >= 3 && !WEAK_DOMAIN_TOKENS.has(token));
  if (tokens.length === 0) return undefined;
  return tokens.join('_');
}

function utilityFamilyForName(name: string): UtilityFamily | undefined {
  const tokens = tokenizeName(name).map(normalizeDomainToken);
  const specificTokens = tokens.filter((token) => token !== 'normalize');
  const matchingTokens = specificTokens.length > 0 ? specificTokens : tokens;
  let family: UtilityFamily | undefined;
  for (const token of matchingTokens) {
    for (const candidate of Object.keys(UTILITY_FAMILY_TOKENS) as UtilityFamily[]) {
      if (UTILITY_FAMILY_TOKENS[candidate].has(token)) family = candidate;
    }
  }
  return family;
}

function actionFamilyForName(name: string): ActionFamily | undefined {
  const [head] = tokenizeName(name).map(normalizeDomainToken);
  return head === 'render' ? 'render' : undefined;
}

function normalizeDomainToken(token: string): string {
  if (token === 'choices') return 'choice';
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es') && token.length > 4 && !token.endsWith('ses')) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenizeName(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .split('_')
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

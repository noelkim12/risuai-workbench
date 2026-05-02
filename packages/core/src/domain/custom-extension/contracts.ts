import { sanitizeFilename } from '../../utils/filenames';

/** Canonical custom-extension target discriminator. */
export const CUSTOM_EXTENSION_TARGETS = ['charx', 'module', 'preset'] as const;

/** Canonical custom-extension target. */
export type CustomExtensionTarget = (typeof CUSTOM_EXTENSION_TARGETS)[number];

/** Canonical custom-extension artifact discriminator. */
export const CUSTOM_EXTENSION_ARTIFACTS = [
  'lorebook',
  'regex',
  'lua',
  'prompt',
  'toggle',
  'variable',
  'html',
  'text',
] as const;

/** Canonical custom-extension artifact. */
export type CustomExtensionArtifact = (typeof CUSTOM_EXTENSION_ARTIFACTS)[number];

/** Ordering marker discriminator. */
export const CUSTOM_EXTENSION_MARKER_KINDS = ['order', 'folders'] as const;

/** Ordering marker kind. */
export type CustomExtensionMarkerKind = (typeof CUSTOM_EXTENSION_MARKER_KINDS)[number];

/** Shared marker file names. */
export const CUSTOM_EXTENSION_MARKER_FILES = Object.freeze({
  order: '_order.json',
  folders: '_folders.json',
} as const satisfies Record<CustomExtensionMarkerKind, string>);

type FileStemPolicy = 'stem' | 'target_name' | 'fixed' | 'target_name_or_fixed';

/** Canonical artifact contract. */
export interface CustomExtensionArtifactContract {
  artifact: CustomExtensionArtifact;
  directory: string;
  suffix: string;
  supportedTargets: readonly CustomExtensionTarget[];
  markerFiles: readonly CustomExtensionMarkerKind[];
  stemPolicy: FileStemPolicy;
  fixedStem?: string;
  fixedStemByTarget?: Partial<Record<CustomExtensionTarget, string>>;
  fallbackStem: string;
}

/** Canonical artifact contracts keyed by artifact id. */
export const CUSTOM_EXTENSION_ARTIFACT_CONTRACTS = Object.freeze({
  lorebook: {
    artifact: 'lorebook',
    directory: 'lorebooks',
    suffix: '.risulorebook',
    supportedTargets: ['charx', 'module'],
    markerFiles: ['order', 'folders'],
    stemPolicy: 'stem',
    fallbackStem: 'entry',
  },
  regex: {
    artifact: 'regex',
    directory: 'regex',
    suffix: '.risuregex',
    supportedTargets: ['charx', 'module', 'preset'],
    markerFiles: ['order'],
    stemPolicy: 'stem',
    fallbackStem: 'regex',
  },
  lua: {
    artifact: 'lua',
    directory: 'lua',
    suffix: '.risulua',
    supportedTargets: ['charx', 'module'],
    markerFiles: [],
    stemPolicy: 'target_name',
    fallbackStem: 'script',
  },
  prompt: {
    artifact: 'prompt',
    directory: 'prompt_template',
    suffix: '.risuprompt',
    supportedTargets: ['preset'],
    markerFiles: ['order'],
    stemPolicy: 'stem',
    fallbackStem: 'prompt',
  },
  toggle: {
    artifact: 'toggle',
    directory: 'toggle',
    suffix: '.risutoggle',
    supportedTargets: ['module', 'preset'],
    markerFiles: [],
    stemPolicy: 'target_name_or_fixed',
    fixedStemByTarget: {
      preset: 'prompt_template',
    },
    fallbackStem: 'toggle',
  },
  variable: {
    artifact: 'variable',
    directory: 'variables',
    suffix: '.risuvar',
    supportedTargets: ['charx', 'module'],
    markerFiles: [],
    stemPolicy: 'target_name',
    fallbackStem: 'variables',
  },
  html: {
    artifact: 'html',
    directory: 'html',
    suffix: '.risuhtml',
    supportedTargets: ['charx', 'module'],
    markerFiles: [],
    stemPolicy: 'fixed',
    fixedStem: 'background',
    fallbackStem: 'background',
  },
  text: {
    artifact: 'text',
    directory: 'character',
    suffix: '.risutext',
    supportedTargets: ['charx'],
    markerFiles: [],
    stemPolicy: 'stem',
    fallbackStem: 'description',
  },
} as const satisfies Record<CustomExtensionArtifact, CustomExtensionArtifactContract>);

const ARTIFACT_BY_SUFFIX = new Map<string, CustomExtensionArtifact>(
  Object.values(CUSTOM_EXTENSION_ARTIFACT_CONTRACTS).map((contract) => [contract.suffix, contract.artifact]),
);

/** isCustomExtensionTarget checks whether a value is a canonical target id. */
export function isCustomExtensionTarget(value: string): value is CustomExtensionTarget {
  return CUSTOM_EXTENSION_TARGETS.includes(value as CustomExtensionTarget);
}

/** isCustomExtensionArtifact checks whether a value is a canonical artifact id. */
export function isCustomExtensionArtifact(value: string): value is CustomExtensionArtifact {
  return CUSTOM_EXTENSION_ARTIFACTS.includes(value as CustomExtensionArtifact);
}

/** assertCustomExtensionTarget validates a canonical target id. */
export function assertCustomExtensionTarget(value: string): asserts value is CustomExtensionTarget {
  if (!isCustomExtensionTarget(value)) {
    throw new Error(`Unsupported custom-extension target: ${value}`);
  }
}

/** assertCustomExtensionArtifact validates a canonical artifact id. */
export function assertCustomExtensionArtifact(
  value: string,
): asserts value is CustomExtensionArtifact {
  if (!isCustomExtensionArtifact(value)) {
    throw new Error(`Unsupported custom-extension artifact: ${value}`);
  }
}

/** getCustomExtensionArtifactContract returns the frozen contract for one artifact. */
export function getCustomExtensionArtifactContract(
  artifact: CustomExtensionArtifact,
): CustomExtensionArtifactContract {
  return CUSTOM_EXTENSION_ARTIFACT_CONTRACTS[artifact];
}

/** listOwnedCustomExtensionArtifacts returns the artifacts owned by one target. */
export function listOwnedCustomExtensionArtifacts(
  target: CustomExtensionTarget,
): readonly CustomExtensionArtifact[] {
  return CUSTOM_EXTENSION_ARTIFACTS.filter((artifact) =>
    getCustomExtensionArtifactContract(artifact).supportedTargets.includes(target),
  );
}

/** supportsCustomExtensionArtifact checks whether a target owns an artifact. */
export function supportsCustomExtensionArtifact(
  target: CustomExtensionTarget,
  artifact: CustomExtensionArtifact,
): boolean {
  return getCustomExtensionArtifactContract(artifact).supportedTargets.includes(target);
}

/** parseCustomExtensionArtifactFromSuffix resolves a canonical artifact from a file suffix. */
export function parseCustomExtensionArtifactFromSuffix(suffix: string): CustomExtensionArtifact {
  const normalized = suffix.toLowerCase();
  const artifact = ARTIFACT_BY_SUFFIX.get(normalized);
  if (!artifact) {
    throw new Error(`Unsupported canonical extension: ${suffix}`);
  }
  return artifact;
}

/** parseCustomExtensionArtifactFromPath resolves a canonical artifact from a file path. */
export function parseCustomExtensionArtifactFromPath(filePath: string): CustomExtensionArtifact {
  // Get extension without using node:path - works with both POSIX and Windows paths
  const lastDotIndex = filePath.lastIndexOf('.');
  const lastSepIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastDotIndex <= lastSepIndex) {
    throw new Error(`No extension found in path: ${filePath}`);
  }
  const ext = filePath.slice(lastDotIndex);
  return parseCustomExtensionArtifactFromSuffix(ext);
}

/** BuildCanonicalArtifactPathOptions drives canonical relative-path generation. */
export interface BuildCanonicalArtifactPathOptions {
  target: CustomExtensionTarget;
  artifact: CustomExtensionArtifact;
  targetName?: string | null;
  stem?: string | null;
  fallbackStem?: string;
}

/** buildCanonicalArtifactPath returns the canonical relative path for one artifact. */
export function buildCanonicalArtifactPath(options: BuildCanonicalArtifactPathOptions): string {
  const { target, artifact } = options;
  const contract = getCustomExtensionArtifactContract(artifact);

  if (!supportsCustomExtensionArtifact(target, artifact)) {
    throw new Error(`Artifact ${artifact} is not supported for target ${target}`);
  }

  const stem = resolveArtifactStem(contract, options);
  return `${contract.directory}/${stem}${contract.suffix}`;
}

function resolveArtifactStem(
  contract: CustomExtensionArtifactContract,
  options: BuildCanonicalArtifactPathOptions,
): string {
  const fallbackStem = options.fallbackStem ?? contract.fallbackStem;

  switch (contract.stemPolicy) {
    case 'fixed':
      return contract.fixedStem ?? fallbackStem;
    case 'target_name':
      return sanitizeFilename(options.targetName, fallbackStem);
    case 'target_name_or_fixed':
      return contract.fixedStemByTarget?.[options.target] ?? sanitizeFilename(options.targetName, fallbackStem);
    case 'stem':
      return sanitizeFilename(options.stem, fallbackStem);
  }
}

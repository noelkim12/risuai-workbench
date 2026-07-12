import { z } from 'zod';

export const ANALYSIS_SHOWCASE_VERSION = 1 as const;
export const ANALYSIS_SHOWCASE_TRAIT_IDS = [
  'cross-layer',
  'chain-reaction',
  'deep-lore',
  'lua-driven',
  'regex-rich',
] as const;

const HTML_EXTENSION = '.html';
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

export const analysisShowcaseArtifactSchema = z
  .strictObject({
    stableId: z.string().min(1),
    name: z.string().min(1),
    type: z.union([z.literal('character'), z.literal('module')]),
  })
  .readonly();

const countSchema = z.number().int().nonnegative();

export const analysisShowcaseMetricsSchema = z
  .strictObject({
    variables: countSchema.optional(),
    connectedVariables: countSchema.optional(),
    lorebookEntries: countSchema.optional(),
    luaFiles: countSchema.optional(),
    luaFunctions: countSchema.optional(),
    regexScripts: countSchema.optional(),
    assetFiles: countSchema.optional(),
    activationChains: countSchema.optional(),
  })
  .readonly();

export const analysisShowcaseDistributionBucketSchema = z
  .strictObject({
    id: z.string().min(1),
    label: z.string().min(1),
    count: countSchema,
  })
  .readonly();

export const analysisShowcaseDistributionsSchema = z
  .strictObject({
    elements: z.array(analysisShowcaseDistributionBucketSchema).readonly(),
    variableConnectivity: z.array(analysisShowcaseDistributionBucketSchema).readonly(),
  })
  .readonly();

export const analysisShowcaseFindingsSchema = z
  .strictObject({
    error: countSchema,
    warning: countSchema,
    information: countSchema,
  })
  .readonly();

export const analysisShowcaseTraitSchema = z
  .strictObject({
    id: z.enum(ANALYSIS_SHOWCASE_TRAIT_IDS),
    label: z.string().min(1),
  })
  .readonly();

function decodeReportFileName(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) {
      return null;
    }
    throw error;
  }
}

export function isSafeAnalysisReportFileName(value: string): boolean {
  if (value.length === 0 || value.includes('/') || value.includes('\\') || WINDOWS_DRIVE_PREFIX.test(value)) {
    return false;
  }

  const decoded = decodeReportFileName(value);
  if (decoded === null) {
    return false;
  }

  if (decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..') {
    return false;
  }

  return decoded.endsWith(HTML_EXTENSION) && !WINDOWS_DRIVE_PREFIX.test(decoded);
}

export const analysisShowcaseReportSchema = z
  .strictObject({
    html: z.string().refine(isSafeAnalysisReportFileName),
  })
  .readonly();

export const analysisShowcaseSchema = z
  .strictObject({
    version: z.literal(ANALYSIS_SHOWCASE_VERSION),
    artifact: analysisShowcaseArtifactSchema,
    generatedAt: z.iso.datetime(),
    metrics: analysisShowcaseMetricsSchema,
    distributions: analysisShowcaseDistributionsSchema,
    findings: analysisShowcaseFindingsSchema,
    traits: z.array(analysisShowcaseTraitSchema).max(4).readonly(),
    report: analysisShowcaseReportSchema,
  })
  .readonly();

export type AnalysisShowcase = z.infer<typeof analysisShowcaseSchema>;
export type AnalysisShowcaseTraitId = (typeof ANALYSIS_SHOWCASE_TRAIT_IDS)[number];
export type AnalysisShowcaseParseResult =
  | { readonly kind: 'valid'; readonly value: AnalysisShowcase }
  | { readonly kind: 'unsupported-version'; readonly version: unknown }
  | { readonly kind: 'malformed' };

function getVersion(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'version' in value) {
    return value.version;
  }

  return undefined;
}

export function parseAnalysisShowcase(value: unknown): AnalysisShowcaseParseResult {
  const version = getVersion(value);
  if (version !== undefined && version !== ANALYSIS_SHOWCASE_VERSION) {
    return { kind: 'unsupported-version', version };
  }

  const result = analysisShowcaseSchema.safeParse(value);
  if (result.success) {
    return { kind: 'valid', value: result.data };
  }

  return { kind: 'malformed' };
}

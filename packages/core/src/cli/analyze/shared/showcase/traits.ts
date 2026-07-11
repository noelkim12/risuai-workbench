import { ANALYSIS_SHOWCASE_TRAIT_IDS, type AnalysisShowcase, type AnalysisShowcaseTraitId } from '@/domain';
import { t, type Locale } from '../i18n';

export type TraitMetrics = {
  readonly activationChains: number;
  readonly hasCrossLayerVariable: boolean;
  readonly lorebookEntries: number;
  readonly luaFiles: number;
  readonly regexScripts: number;
};

const TRAIT_THRESHOLDS = {
  activationChains: 100,
  lorebookEntries: 50,
  luaFiles: 10,
  regexScripts: 10,
} as const;

export function buildShowcaseTraits(metrics: TraitMetrics, locale: Locale): AnalysisShowcase['traits'] {
  const traits: Array<AnalysisShowcase['traits'][number]> = [];
  for (const id of ANALYSIS_SHOWCASE_TRAIT_IDS) {
    if (matchesTrait(id, metrics)) {
      traits.push({ id, label: t(locale, `showcase.trait.${id}`) });
    }
    if (traits.length === 4) return traits;
  }
  return traits;
}

function matchesTrait(id: AnalysisShowcaseTraitId, metrics: TraitMetrics): boolean {
  switch (id) {
    case 'cross-layer':
      return metrics.hasCrossLayerVariable;
    case 'chain-reaction':
      return metrics.activationChains >= TRAIT_THRESHOLDS.activationChains;
    case 'deep-lore':
      return metrics.lorebookEntries >= TRAIT_THRESHOLDS.lorebookEntries;
    case 'lua-driven':
      return metrics.luaFiles >= TRAIT_THRESHOLDS.luaFiles;
    case 'regex-rich':
      return metrics.regexScripts >= TRAIT_THRESHOLDS.regexScripts;
    default:
      return assertNever(id);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected showcase trait: ${value}`);
}

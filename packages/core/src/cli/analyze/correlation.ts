import fs from 'node:fs';
import {
  buildLorebookCorrelationFromEntries,
  buildRegexCorrelationFromScripts,
} from '../../domain/analyze/correlation';
import { parseCardFile } from '../../node';
import { type CollectedData, type LorebookCorrelation, type RegexCorrelation } from './types';

export function buildLorebookCorrelation(params: {
  cardArg: string | null;
  collected: CollectedData;
}): LorebookCorrelation | null {
  const { cardArg, collected } = params;
  if (!cardArg || !collected) return null;
  if (!fs.existsSync(cardArg)) {
    console.error(`  ⚠️  --card 파일을 찾을 수 없습니다: ${cardArg}`);
    return null;
  }

  const card = parseCardFile(cardArg) as any;
  if (!card) return null;

  const entries = card.data?.character_book?.entries || [];
  if (!entries.length) {
    console.log('  ⚠️  --card: lorebook 엔트리가 없습니다.');
    return null;
  }

  return buildLorebookCorrelationFromEntries({
    entries,
    collected,
  });
}

export function buildRegexCorrelation(params: {
  cardArg: string | null;
  collected: CollectedData;
}): RegexCorrelation | null {
  const { cardArg, collected } = params;
  if (!cardArg || !collected) return null;
  if (!fs.existsSync(cardArg)) {
    console.error(`  ⚠️  --card 파일을 찾을 수 없습니다: ${cardArg}`);
    return null;
  }

  const card = parseCardFile(cardArg) as any;
  if (!card) return null;

  const scripts = card.data?.extensions?.risuai?.customScripts;
  if (!scripts) {
    console.log('  ⚠️  --card: regex(customScripts) 엔트리가 없습니다.');
    return null;
  }

  return buildRegexCorrelationFromScripts({
    scripts,
    collected,
    totalScripts: scripts.length,
  });
}

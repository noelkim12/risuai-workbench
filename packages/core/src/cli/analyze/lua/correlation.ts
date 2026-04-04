import fs from 'node:fs';
import { asRecord } from '@/domain';
import {
  buildLorebookCorrelationFromEntries,
  buildRegexCorrelationFromScripts,
} from '@/domain/analyze/correlation';
import { parseCharxFile } from '@/node';
import {
  type CollectedData,
  type LorebookCorrelation,
  type RegexCorrelation,
} from '@/domain/analyze/lua-analysis-types';

/** --charx로 지정한 캐릭터 카드에서 로어북 엔트리를 읽어 Lua 상태 변수와의 상관관계를 분석한다. */
export function buildLorebookCorrelation(params: {
  charxArg: string | null;
  collected: CollectedData;
}): LorebookCorrelation | null {
  const { charxArg, collected } = params;
  if (!charxArg || !collected) return null;
  if (!fs.existsSync(charxArg)) {
    console.error(`  ⚠️  --charx 파일을 찾을 수 없습니다: ${charxArg}`);
    return null;
  }

  const charx = asRecord(parseCharxFile(charxArg));
  const data = asRecord(charx?.data);
  const characterBook = asRecord(data?.character_book);
  if (!characterBook) return null;

  const entries = Array.isArray(characterBook.entries) ? characterBook.entries : [];
  if (!entries.length) {
    console.log('  ⚠️  --charx: lorebook 엔트리가 없습니다.');
    return null;
  }

  return buildLorebookCorrelationFromEntries({
    entries,
    collected,
  });
}

/** --charx로 지정한 캐릭터 카드에서 Regex 스크립트를 읽어 Lua 상태 변수와의 상관관계를 분석한다. */
export function buildRegexCorrelation(params: {
  charxArg: string | null;
  collected: CollectedData;
}): RegexCorrelation | null {
  const { charxArg, collected } = params;
  if (!charxArg || !collected) return null;
  if (!fs.existsSync(charxArg)) {
    console.error(`  ⚠️  --charx 파일을 찾을 수 없습니다: ${charxArg}`);
    return null;
  }

  const charx = asRecord(parseCharxFile(charxArg));
  const data = asRecord(charx?.data);
  const extensions = asRecord(data?.extensions);
  const risuai = asRecord(extensions?.risuai);
  if (!risuai) return null;

  const scripts = Array.isArray(risuai.customScripts) ? risuai.customScripts : null;
  if (!scripts) {
    console.log('  ⚠️  --charx: regex(customScripts) 엔트리가 없습니다.');
    return null;
  }

  return buildRegexCorrelationFromScripts({
    scripts,
    collected,
    totalScripts: scripts.length,
  });
}

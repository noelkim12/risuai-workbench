import path from 'node:path';
import { ensureDir, writeJson } from './fs-helpers';
import type { LorebookExtractionPlan } from '../domain/lorebook/folders';

/** LorebookExtractionPlan을 실행하여 파일시스템에 로어북 엔트리와 폴더를 저장합니다.
 * @param plan - 실행할 로어북 추출 계획
 * @param lorebooksDir - 로어북이 저장될 대상 디렉토리 경로
 * @returns 실행 결과 통계 (저장된 개수, 순서 목록, 매니페스트 엔트리)
 */
export function executeLorebookPlan(
  plan: LorebookExtractionPlan,
  lorebooksDir: string,
): { count: number; orderList: string[]; manifestEntries: any[] } {
  let count = 0;
  const orderList: string[] = [];
  const manifestEntries: any[] = [];

  for (const item of plan.items) {
    if (item.type === 'folder') {
      ensureDir(path.join(lorebooksDir, item.relDir));
      manifestEntries.push({
        type: 'folder',
        source: item.source,
        dir: item.relDir,
        data: item.data,
      });
      count += 1;
    } else {
      const outPath = path.join(lorebooksDir, item.relPath);
      ensureDir(path.dirname(outPath));
      writeJson(outPath, item.data);
      orderList.push(item.relPath);
      manifestEntries.push({ type: 'entry', source: item.source, path: item.relPath });
      count += 1;
    }
  }

  return { count, orderList, manifestEntries };
}

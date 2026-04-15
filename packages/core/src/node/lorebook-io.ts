import path from 'node:path';
import { ensureDir } from './fs-helpers';
import type { LorebookExtractionPlan } from '../domain/lorebook/folders';

/** LorebookExtractionPlan을 실행하여 파일시스템에 로어북 폴더 디렉토리를 생성합니다.
 * 실제 파일 쓰기는 호출자가 담당하며, 이 함수는 디렉토리 구조만 준비합니다.
 * @param plan - 실행할 로어북 추출 계획
 * @param lorebooksDir - 로어북이 저장될 대상 디렉토리 경로
 * @returns 실행 결과 통계 (저장된 lorebook 파일 개수, 순서 목록, 매니페스트 엔트리)
 */
export function executeLorebookPlan(
  plan: LorebookExtractionPlan,
  lorebooksDir: string,
): { count: number; orderList: string[]; manifestEntries: any[] } {
  let count = 0;
  const orderList: string[] = [];
  const manifestEntries: any[] = [];
  const emittedFolders = new Set<string>();

  for (const item of plan.items) {
    if (item.type === 'folder') {
      // Create folder directory
      ensureDir(path.join(lorebooksDir, item.relDir));

      // Add to order list if not already present
      if (!emittedFolders.has(item.relDir)) {
        orderList.push(item.relDir);
        emittedFolders.add(item.relDir);
      }

      manifestEntries.push({
        type: 'folder',
        source: item.source,
        dir: item.relDir,
        data: item.data,
      });
    } else {
      // Prepare entry directory (but don't write the file - caller does that)
      const outPath = path.join(lorebooksDir, item.relPath);
      ensureDir(path.dirname(outPath));

      // Add parent folder to order list if inside a folder
      const parentDir = item.relPath.includes('/') ? item.relPath.split('/')[0] : null;
      if (parentDir && !emittedFolders.has(parentDir)) {
        orderList.push(parentDir);
        emittedFolders.add(parentDir);
      }

      orderList.push(item.relPath);
      manifestEntries.push({ type: 'entry', source: item.source, path: item.relPath });
      count += 1;
    }
  }

  return { count, orderList, manifestEntries };
}

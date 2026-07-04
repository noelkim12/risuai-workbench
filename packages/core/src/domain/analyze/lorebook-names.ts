/**
 * *.risulorebook 텍스트에서 캐릭터명 후보를 추출함.
 * CLI(analyze)와 Asset Manager가 공유하는 순수 분석 도구 (스펙 §5).
 * frontmatter는 비엄격 YAML일 수 있어 라인 기반으로 name:만 읽음.
 * @file packages/core/src/domain/analyze/lorebook-names.ts
 */

export interface LorebookNameCandidate {
  readonly name: string;
  readonly filePath: string;
  readonly folderPath: string;
}

export interface LorebookNameCandidateSource {
  readonly filePath: string;
  readonly folderPath: string;
  readonly text: string;
}

/**
 * extractNameFromLorebookText 함수.
 * 문서 선두 frontmatter 블록(`---` ~ `---`) 안의 `name:` 값을 추출함.
 */
export function extractNameFromLorebookText(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const firstLine = lines[0];
  if (firstLine?.trim() !== '---') return null;

  for (const line of lines.slice(1)) {
    if (line.trim() === '---') return null;
    const match = /^name\s*:\s*(.+)$/.exec(line);
    const value = match?.[1]?.trim();
    if (value !== undefined) return value.length > 0 ? value : null;
  }

  return null;
}

/**
 * extractLorebookNameCandidates 함수.
 * 이미 읽은 .risulorebook source 목록에서 name 후보를 반환함.
 * 동일 name은 첫 출현만 유지하고, 결과는 파일경로 오름차순.
 */
export function extractLorebookNameCandidates(
  sources: readonly LorebookNameCandidateSource[],
): LorebookNameCandidate[] {
  const candidates: LorebookNameCandidate[] = [];
  const seenNames = new Set<string>();
  for (const source of [...sources].sort((left, right) => left.filePath.localeCompare(right.filePath))) {
    const name = extractNameFromLorebookText(source.text);
    if (name === null || seenNames.has(name)) continue;
    seenNames.add(name);

    candidates.push({
      name,
      filePath: source.filePath,
      folderPath: source.folderPath,
    });
  }

  return candidates;
}

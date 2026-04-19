/** 로어북 텍스트 내에서 변수/Lua 함수/다른 로어북 이름의 텍스트 언급을 탐지한다. */

export interface TextMentionEdge {
  sourceEntry: string;
  target: string;
  type: 'variable-mention' | 'lua-mention' | 'lorebook-mention';
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 로어북 엔트리 텍스트를 스캔하여 변수/함수/다른 로어북 이름이 언급된 곳을 찾아낸다.
 *
 * - 3글자 미만의 이름은 오탐 방지를 위해 무시한다.
 * - 한글/유니코드 환경에서 `\b`의 오작동을 피하기 위해
 *   `(^|[^a-zA-Z0-9_])` 외곽 검색 정규식을 사용한다.
 */
export function analyzeTextMentions(
  entries: { id: string; name: string; content: string }[],
  variables: Set<string>,
  functions: Set<string>,
  lorebookEntries: Array<{ id: string; name: string; keys?: string[] }> = [],
): TextMentionEdge[] {
  const results: TextMentionEdge[] = [];
  const validVars = [...variables].filter((v) => v.length >= 3);
  const validFuncs = [...functions].filter((f) => f.length >= 3);

  // Index lorebook targets by every searchable term (entry name + all keys).
  // A term is ambiguous when it maps to multiple entries, so we drop those to
  // avoid attributing a mention to the wrong entry.
  const lorebookIdsByTerm = new Map<string, Set<string>>();
  const registerTerm = (term: string, targetId: string) => {
    if (!term || term.length < 3) return;
    const ids = lorebookIdsByTerm.get(term) ?? new Set<string>();
    ids.add(targetId);
    lorebookIdsByTerm.set(term, ids);
  };

  for (const entry of lorebookEntries) {
    const targetId = entry.id || entry.name;
    if (!targetId) continue;
    registerTerm(entry.name || targetId, targetId);
    for (const key of entry.keys ?? []) registerTerm(key, targetId);
  }

  const createRegex = (word: string) =>
    new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(word)}(?=[^a-zA-Z0-9_]|$)`);

  const allPatterns = [
    ...validVars.map((v) => ({ regex: createRegex(v), target: v, type: 'variable-mention' as const })),
    ...validFuncs.map((f) => ({ regex: createRegex(f), target: f, type: 'lua-mention' as const })),
    ...[...lorebookIdsByTerm.entries()]
      .filter(([, ids]) => ids.size === 1)
      .map(([term, ids]) => ({
        regex: createRegex(term),
        target: [...ids][0]!,
        type: 'lorebook-mention' as const,
      })),
  ];

  for (const entry of entries) {
    if (!entry.content) continue;
    const sourceEntry = entry.id || entry.name;
    // Dedupe per-source: multiple keys of the same target would otherwise
    // produce duplicate edges.
    const seen = new Set<string>();

    for (const pattern of allPatterns) {
      if (pattern.type === 'lorebook-mention' && pattern.target === sourceEntry) continue;
      const dedupeKey = `${pattern.type}:${pattern.target}`;
      if (seen.has(dedupeKey)) continue;
      if (pattern.regex.test(entry.content)) {
        seen.add(dedupeKey);
        results.push({ sourceEntry, target: pattern.target, type: pattern.type });
      }
    }
  }

  return results;
}

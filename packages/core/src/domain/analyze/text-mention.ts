/** 로어북 텍스트 내에서 변수/Lua 함수 이름의 텍스트 언급을 탐지한다. */

export interface TextMentionEdge {
  sourceEntry: string;
  target: string;
  type: 'variable-mention' | 'lua-mention';
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 로어북 엔트리 텍스트를 스캔하여 변수/함수 이름이 언급된 곳을 찾아낸다.
 *
 * - 3글자 미만의 이름은 오탐 방지를 위해 무시한다.
 * - 한글/유니코드 환경에서 `\b`의 오작동을 피하기 위해
 *   `(^|[^a-zA-Z0-9_])` 외곽 검색 정규식을 사용한다.
 */
export function analyzeTextMentions(
  entries: { id: string; name: string; content: string }[],
  variables: Set<string>,
  functions: Set<string>,
): TextMentionEdge[] {
  const results: TextMentionEdge[] = [];
  const validVars = [...variables].filter((v) => v.length >= 3);
  const validFuncs = [...functions].filter((f) => f.length >= 3);

  const createRegex = (word: string) =>
    new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(word)}(?=[^a-zA-Z0-9_]|$)`);

  const allPatterns = [
    ...validVars.map((v) => ({ regex: createRegex(v), target: v, type: 'variable-mention' as const })),
    ...validFuncs.map((f) => ({ regex: createRegex(f), target: f, type: 'lua-mention' as const })),
  ];

  for (const entry of entries) {
    if (!entry.content) continue;
    const sourceEntry = entry.id || entry.name;

    for (const pattern of allPatterns) {
      if (pattern.regex.test(entry.content)) {
        results.push({ sourceEntry, target: pattern.target, type: pattern.type });
      }
    }
  }

  return results;
}

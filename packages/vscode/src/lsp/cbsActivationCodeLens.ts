/**
 * CBS activation CodeLens click popup payload helpers.
 * @file packages/vscode/src/lsp/cbsActivationCodeLens.ts
 */

export const CBS_ACTIVATION_SUMMARY_COMMAND = 'risuaiWorkbench.cbs.showActivationLinks';

export interface CbsActivationNavigationTarget {
  range?: {
    end?: { character?: number; line?: number };
    start?: { character?: number; line?: number };
  };
  uri?: string;
}

export interface CbsActivationLinkedEntryPayload {
  direction?: 'incoming' | 'outgoing';
  entryId?: string;
  entryName?: string;
  link?: {
    arguments?: readonly [CbsActivationNavigationTarget];
    command?: string;
  } | null;
  matchedKeywords?: readonly string[];
  relativePath?: string | null;
  uri?: string | null;
}

export interface CbsActivationCodeLensPayload {
  activation?: {
    incoming?: readonly CbsActivationLinkedEntryPayload[];
    outgoing?: readonly CbsActivationLinkedEntryPayload[];
  };
  kind?: string;
  uri?: string;
}

export interface CbsActivationQuickPickItemModel {
  description?: string;
  detail?: string;
  kind: 'entry' | 'separator';
  label: string;
  target?: CbsActivationNavigationTarget;
}

/**
 * buildCbsActivationQuickPickItems 함수.
 * CodeLens command payload를 popup item 모델로 변환함.
 *
 * @param payload - 서버 CodeLens command argument payload
 * @returns separator와 entry item이 섞인 popup item 목록
 */
export function buildCbsActivationQuickPickItems(
  payload: CbsActivationCodeLensPayload | undefined,
): CbsActivationQuickPickItemModel[] {
  const incoming = payload?.activation?.incoming ?? [];
  const outgoing = payload?.activation?.outgoing ?? [];

  return [
    { kind: 'separator', label: '활성화하는 엔트리' },
    ...buildEntryItems(incoming, '이 엔트리를 활성화함'),
    { kind: 'separator', label: '활성화시킨 엔트리' },
    ...buildEntryItems(outgoing, '이 엔트리에 의해 활성화됨'),
  ];
}

/**
 * buildEntryItems 함수.
 * activation entry payload 목록을 popup entry item으로 변환함.
 *
 * @param entries - incoming 또는 outgoing activation entry payload 목록
 * @param fallbackDetail - keyword가 없을 때 표시할 설명
 * @returns QuickPick entry item 모델 목록
 */
function buildEntryItems(
  entries: readonly CbsActivationLinkedEntryPayload[],
  fallbackDetail: string,
): CbsActivationQuickPickItemModel[] {
  if (entries.length === 0) {
    return [
      {
        kind: 'entry',
        label: '없음',
        detail: fallbackDetail,
      },
    ];
  }

  return entries.map((entry) => ({
    kind: 'entry',
    label: entry.entryName ?? entry.entryId ?? '이름 없는 엔트리',
    description: entry.relativePath ?? undefined,
    detail: formatEntryDetail(entry, fallbackDetail),
    target: entry.link?.arguments?.[0],
  }));
}

/**
 * formatEntryDetail 함수.
 * activation entry item에 보여줄 keyword 설명을 만듦.
 *
 * @param entry - popup에 표시할 entry payload
 * @param fallback - keyword가 없을 때 표시할 설명
 * @returns QuickPick detail 문자열
 */
function formatEntryDetail(entry: CbsActivationLinkedEntryPayload, fallback: string): string {
  const keywords = entry.matchedKeywords ?? [];
  return keywords.length > 0 ? `매칭 키워드: ${keywords.join(', ')}` : fallback;
}

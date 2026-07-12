// packages/hmr-plugin/src/helpers/host-dom.ts
/**
 * 호스트 문서(getRootDocument) 접근과 스타일 적용을 badge/toast가 공유한다.
 * SafeElement의 모든 조작 메서드는 async이므로 setStyle을 순차 await 한다.
 * 권한 거부 시 getHostDocument는 null — 호출자는 기능을 조용히 생략한다.
 */

export type SafeHostElement = Awaited<ReturnType<SafeDocument['createElement']>>;
export type SafeHostDocument = NonNullable<Awaited<ReturnType<typeof risuai.getRootDocument>>>;

export async function getHostDocument(): Promise<SafeHostDocument | null> {
  try {
    const rootDocument = await risuai.getRootDocument();
    return rootDocument ?? null;
  } catch {
    return null;
  }
}

export async function applyStyles(
  element: SafeHostElement,
  styles: ReadonlyArray<readonly [string, string]>,
): Promise<void> {
  for (const [property, value] of styles) await element.setStyle(property, value);
}

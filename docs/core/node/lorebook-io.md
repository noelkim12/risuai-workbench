# lorebook-io

이 페이지는 Node 쪽 lorebook extraction helper 하나만 다룹니다. lorebook canonical 형식이나 activation semantics는 여기서 설명하지 않습니다.

## source of truth

- 구현: [`../../../packages/core/src/node/lorebook-io.ts`](../../../packages/core/src/node/lorebook-io.ts)
- plan 타입: [`../../../packages/core/src/domain/lorebook/folders.ts`](../../../packages/core/src/domain/lorebook/folders.ts)
- 사용 예시: [`../../../packages/core/src/cli/extract/character/phases.ts`](../../../packages/core/src/cli/extract/character/phases.ts), [`../../../packages/core/src/cli/extract/module/phases.ts`](../../../packages/core/src/cli/extract/module/phases.ts)
- 관련 테스트: [`../../../packages/core/tests/lorebook-folder-layout.test.ts`](../../../packages/core/tests/lorebook-folder-layout.test.ts), [`../../../packages/core/tests/charx-extract.test.ts`](../../../packages/core/tests/charx-extract.test.ts)

## 현재 surface

- `executeLorebookPlan(plan, lorebooksDir)`

반환값은 `{ count, orderList, manifestEntries }`다.

## helper 의미론

- 입력은 pure domain 쪽 `LorebookExtractionPlan`이다.
- 이 helper는 plan을 실제 디렉토리 구조로 옮길 준비만 한다.
- folder item이면 디렉토리를 만들고, 중복되지 않게 `orderList`에 폴더 경로를 넣는다.
- entry item이면 파일이 들어갈 부모 디렉토리를 만들고, `orderList`에 entry 상대 경로를 넣는다.
- `count`는 entry 수만 센다.
- `manifestEntries`는 folder 또는 entry의 source/path 정보를 그대로 모아 둔다.

## 중요한 경계

- 실제 `.risulorebook` 파일 내용은 이 helper가 쓰지 않는다. 호출자가 `writeText`로 쓴다.
- `_order.json` 파일도 이 helper가 직접 저장하지 않는다. CLI extract phase가 반환된 `orderList`를 바탕으로 쓴다.
- lorebook folder identity, canonical frontmatter, path-based round-trip 규칙은 이 helper가 아니라 domain planner와 custom-extension 문서가 소유한다.

## 현재 코드에서 확인되는 사용 방식

- character/module extract phase는 domain planner 결과의 `.json` 경로를 `.risulorebook`로 바꾼 뒤 이 helper를 호출한다.
- 이후 호출자가 canonical content를 serialize해서 쓰고, `_order.json`을 별도로 기록한다.
- `lorebook-folder-layout.test.ts`와 `charx-extract.test.ts`는 최종 출력이 path-based `_order.json`과 real directory layout을 따르는지 검증한다.

## boundary

- 이 페이지는 Node filesystem preparation만 다룬다.
- lorebook entry 내용 포맷은 [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)를 본다.
- 파일 나열과 `_order.json` 적용 규칙은 [`json-listing.md`](json-listing.md)에서 본다.

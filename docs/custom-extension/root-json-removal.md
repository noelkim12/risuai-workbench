# root JSON 제거 개요

이 문서는 복구 호환용 상위 개요다. 현재 활성 규칙은 [`common/root-json-removal.md`](common/root-json-removal.md)에 둔다.

## 왜 이 파일이 남아 있나

- 세션 기록과 notepad에 따르면 한 시점의 active docs는 이 루트 경로를 직접 참조했다.
- 이후 공통 정책 문서를 `common/` 아래로 정리한 흔적이 있어서, 현재는 `common/root-json-removal.md`를 source of truth로 둔다.

## 현재 읽는 법

- canonical-first 원칙, 미편집 필드 정책, pack 재조립 흐름은 `common/root-json-removal.md`를 본다.
- 이 파일은 옛 링크를 살리고, 문서 구조 복구 과정에서 경로 호환성을 유지하기 위한 entry point다.
- 따라서 여기서 root JSON를 언급하더라도 active workspace authoring source를 설명하는 문맥이 아니라 legacy or deferred reference 문맥으로 읽어야 한다.

## 현재 구현 메모

- root JSON는 활성 authoring source가 아니다.
- analyze / compose 쪽에는 T13/T16 defer 범위의 legacy or deferred fallback 설명이 일부 남아 있을 수 있다.
- archive 문서와 binary output은 예외다.
- binary output에서 `charx.json` 같은 이름이 보일 수 있어도, 그것은 internal compatibility behavior이지 workspace authoring truth는 아니다.

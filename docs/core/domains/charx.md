# 캐릭터 도메인 (Charx Domain)

이 문서는 `packages/core/src/domain/charx/`에 정의된 순수 카드 형상 객체(Card-shaped Object) 헬퍼만을 다룹니다. PNG 처리, 디스크 입출력, 아카이브 파싱 로직은 의도적으로 제외합니다.

## 이 페이지가 담당하는 범위

- 캐릭터 카드 객체에서 이름, 로어북, 모듈 로어북, 정규식, 기본 변수 원본(Raw) 데이터를 읽는 헬퍼
- 루트 패키지 호환을 위한 DTO 타입 정의
- 빈 캐릭터 및 빈 V3 엔벨로프(Envelope) 생성 헬퍼

## 구현 명세 (Current Truth)

- `data.ts`는 `getCharacterName`, `getLorebookEntriesFromCharx`, `getModuleLorebookEntries`, `getAllLorebookEntriesFromCharx`, `getCustomScriptsFromCharx`, `getDefaultVariablesRawFromCharx` 함수를 제공합니다.
- `getCharacterName`은 `data.name` 필드를 우선적으로 참조하며, 없을 경우 루트 `name`을, 둘 다 없을 경우 `Unknown`을 반환합니다.
- 로어북 헬퍼는 `character_book.entries`와 `extensions.risuai._moduleLorebook`를 분리하여 읽으며, 이를 통합하여 읽는 전용 헬퍼를 별도로 제공합니다.
- `blank-char.ts`는 상위(Upstream) 기본값을 채운 빈 캐릭터 및 V3 엔벨로프 생성 헬퍼를 포함합니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 안전한 읽기 헬퍼 | `getCharxName`, `getCardName`, `getCharacterBookEntries`, `getModuleLorebookEntries`, `getAllLorebookEntries` |
| 정규식 및 변수 원본 | `getCustomScripts`, `getDefaultVariablesRaw` |
| 주요 타입 | `CardData`, `CharxData`, `CharxStructure`, `LorebookEntry`, `RegexScript`, `Variable` |

## 현재 구현 확정 사항

- 헬퍼는 객체 형상의 읽기 작업만을 수행합니다. 디코딩, 압축 해제, 이미지 메타데이터 처리, PNG 텍스트 청크 파싱은 수행하지 않습니다.
- 모듈 로어북은 캐릭터 카드 내부의 익스텐션 필드에 위치하더라도 전용 헬퍼를 통해 읽어들입니다.
- 기본 변수(`defaultVariables`)는 정규화된 맵 형식이 아닌 원본 페이로드(Raw Payload) 그대로를 반환합니다.
- 빈 카드 생성기(Blank Builder)는 상위 기본값 및 `chara_card_v3` 엔벨로프 형상을 미러링하도록 설계되었습니다.

## 범위 명세 (Scope Boundary)

- `.charx` 파일 열기, PNG 텍스트 청크 디코딩, 카드 파일 식별(Sniffing), 디스크 I/O는 [`../node/README.md`](../node/README.md) 및 Node 엔트리 문서에서 담당합니다.
- 표준 워크스페이스 레이아웃 및 `character/`, `lorebooks/`, `regex/`, `lua/`, `variables/`, `html/` 소유권 규칙은 [`../../custom-extension/targets/charx.md`](../../custom-extension/targets/charx.md)를 참조하십시오.
- 이 페이지는 PNG 파싱 명세를 별도로 정의하지 않습니다.

## evidence anchors

- `../../../packages/core/src/domain/charx/data.ts`
- `../../../packages/core/src/domain/charx/contracts.ts`
- `../../../packages/core/src/domain/charx/blank-char.ts`
- `../../../packages/core/tests/export-surface.test.ts`
- `../../../packages/core/tests/charx-extract.test.ts`
- `../../../packages/core/tests/custom-extension/charx-canonical-pack.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../node/README.md`](../node/README.md)
- [`./lorebook.md`](./lorebook.md)
- [`./regex.md`](./regex.md)
- [`../../custom-extension/targets/charx.md`](../../custom-extension/targets/charx.md)

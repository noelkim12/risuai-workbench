# root JSON 제거와 canonical-first 원칙

이 문서는 `charx.json`, `module.json`, `preset.json` 같은 root JSON sidecar를 canonical emitted and authoring workspace surface로 보지 않는 현재 방침을 정리한다.

## 핵심 원칙

- 활성 authoring surface는 root JSON이 아니라 canonical `.risu*` 파일 + `metadata.json`이다.
- root JSON 언급이 문서에 남아 있더라도, 그것이 곧 현재 표준을 뜻하지는 않는다. 남아 있다면 legacy, deferred, archive, 경로 호환 맥락을 붙인다.
- archive 문서, 테스트 fixture, binary serialization은 예외가 될 수 있지만, 활성 문서는 canonical-first를 기본으로 설명해야 한다.

## 현재 구현 상태

| 영역 | 현재 상태 |
|---|---|
| extract / pack canonical authoring | canonical-first |
| analyze runtime detection | canonical-first가 기본이지만 T16 defer 범위의 legacy or deferred fallback 설명이 일부 남아 있음 |
| archive 문서 | root JSON 자유롭게 언급 가능 |
| binary output (`.charx`, `.risum`) | 내부 직렬화로 `charx.json` 같은 엔트리를 쓸 수 있지만 workspace authoring source는 아님 |

<a id="2-미편집-필드-정책"></a>
## 2. 미편집 필드 정책

- canonical workspace는 사용자가 직접 authoring 하는 표면만 소유한다.
- 미편집 필드는 extract 시 별도 `.risu*` surface로 내리지 않을 수 있다.
- 이 경우 pack 단계는 upstream default/template overlay와 metadata를 이용해 필요한 필드를 다시 구성한다.
- 따라서 canonical에 안 보이는 필드가 곧 누락 버그라는 뜻은 아니다. 문서에서 intentional unedited인지 design bug인지 먼저 구분해야 한다.

### 이 정책이 필요한 이유

- root JSON를 그대로 남겨두면 canonical `.risu*` surface와 이중 source of truth가 생긴다.
- workbench가 주로 편집하는 payload와 upstream runtime-only/derived field를 분리해야 round-trip 검증이 단순해진다.
- 테스트와 diff 분류가 예측 가능해진다.

<a id="pack-재조립-흐름"></a>
## pack 재조립 흐름

pack은 대략 아래 순서로 생각한다.

```text
default/template base 준비
→ metadata.json overlay
→ 각 canonical .risu* artifact parse / inject
→ target-specific envelope 재구성
→ binary/output serialization
```

이 흐름에서 중요한 점은 다음과 같다.

- root JSON sidecar를 읽어서 현재 표준처럼 병합하는 것이 아니라, canonical artifact를 먼저 읽는다.
- lorebook / regex / prompt / lua / toggle / variable / html는 각 adapter contract를 통해 주입된다.
- binary 산출물 안에 `charx.json` 같은 이름이 등장할 수 있어도, 그것은 workspace 표준이 아니라 최종 직렬화 형식이며 internal compatibility behavior다.

## deferred 범위 (T13, T16)

- **T13**: analyze/compose migration은 아직 일부 standalone workflow/legacy 설명을 남긴다.
- **T16**: strict root-JSON eradication은 승인 범위 밖으로 defer된 부분이 있다.

즉, 현재 문서는 두 가지를 동시에 만족해야 한다.

1. canonical-first가 현재 표준이라고 분명히 말할 것
2. defer된 fallback/legacy surface가 남아 있으면 그 사실을 숨기지 말 것
3. binary/internal compatibility behavior를 workspace authoring과 섞어 설명하지 말 것

## 활성 문서 작성 규칙

- root JSON를 "현재 표준"처럼 소개하지 않는다.
- root JSON를 언급해야 한다면 `legacy`, `fallback`, `deferred`, `archive`, `binary output` 맥락을 붙인다.
- structured JSON는 discovery 대상일 수 있어도 canonical artifact와 같은 active authoring contract라고 과장하지 않는다.
- archive 문서(`../custom-extension-design.md`, `../custom-extension-design.backup.md`)는 예외로 둔다.

## 관련 문서

- `../root-json-removal.md` — 상위 개요 / 복구 호환용 문서
- `principles.md` — authoring scope, diff 분류
- `../targets/charx.md`, `../targets/module.md`, `../targets/preset.md` — target별 실제 pack 흐름

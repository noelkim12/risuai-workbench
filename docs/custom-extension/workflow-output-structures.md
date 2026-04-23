# canonical workflow output structures

이 문서는 extract / pack / analyze가 현재 어떤 workspace 구조를 기준으로 설명돼야 하는지 정리한 운영용 문서다.

## 공통 원칙

- canonical workspace는 `.risu*` payload 파일과 `metadata.json` 중심으로 설명한다.
- analyze/discovery 설명은 `custom-extension-file-discovery.ts`와 `foundation.test.ts`가 실제로 수집하는 파일 evidence에 맞춘다. bare directory만으로 target 판별이 증명됐다고 쓰지 않는다.
- root JSON (`charx.json`, `module.json`, `preset.json`)은 현재 표준 output structure가 아니다.
- 다만 analyze 문맥에서는 T16 defer 범위의 legacy fallback이 남아 있을 수 있으므로, 그 사실은 숨기지 않고 명시한다.

## charx

```text
<charx>/
├── character/
├── lorebooks/
├── regex/
├── lua/
├── variables/
└── html/
```

- `character/`는 실제 charx workflow surface다. `packages/core/src/cli/pack/character/workflow.ts`는 `character/*.txt`, `character/alternate_greetings.json`, `character/metadata.json`를 읽는다.
- 위 구조는 charx layout evidence를 보여주지만, analyze detection proof 자체는 아니다. discovery test가 직접 증명하는 것은 `.risu*` files, marker files, structured JSON buckets다.

## module

```text
<module>/
├── metadata.json
├── lorebooks/
├── regex/
├── lua/
├── toggle/
├── variables/
└── html/
```

- `metadata.json`은 canonical structured JSON surface다.
- lorebook ordering marker인 `_order.json` / `_folders.json`과 `.risu*` payload 파일이 discovery evidence를 이룬다.

## preset

```text
<preset>/
├── metadata.json
├── prompt_template/
├── regex/
└── toggle/
```

- preset도 analyze 문서에서는 bare `prompt_template/`나 `toggle/` 디렉터리만으로 판별된다고 쓰지 않는다.
- authoritative evidence는 그 아래의 `.risuprompt`, `.risutoggle`, `.risuregex`, 그리고 discovery가 수집하는 structured JSON / marker file이다.

## deferred / fallback note

- analyze workflows는 legacy root JSON fallback을 완전히 제거한 최종 상태가 아니다.
- 따라서 문서에서 `charx.json`, `module.json`, `preset.json`를 언급할 때는 반드시 `legacy`, `fallback`, `deferred` 맥락을 붙인다.
- extract / pack의 활성 표준은 여전히 canonical `.risu*` surface와 runtime이 실제로 읽는 metadata or character payload 구조다.

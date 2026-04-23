# custom extension CLI 메모

이 문서는 canonical custom-extension workspace를 다루는 CLI 흐름을 짧게 정리한 운영 메모다. 현재 표준은 canonical-first이며, root JSON는 archive / fallback / deferred 문맥에서만 언급한다.

## 기본 원칙

- `extract`는 가능한 한 target을 canonical workspace로 풀어낸다.
- `pack`은 canonical `.risu*` artifact와 실제 runtime이 읽는 `metadata.json` 및 `character/` payload를 바탕으로 target envelope를 재구성한다.
- `analyze` 설명은 discovery code와 foundation test가 실제로 증명하는 surface만 authoritative signal로 다룬다.

## analyze detection 메모

- `packages/core/src/node/custom-extension-file-discovery.ts`의 discovery는 디렉터리 이름 자체가 아니라 실제 파일을 세 bucket으로 모은다: `canonicalFiles`, `markerFiles`, `structuredJsonFiles`.
- `packages/core/tests/custom-extension/foundation.test.ts`는 `.risu*` canonical artifact, `_order.json` / `_folders.json` marker file, `metadata.json` 같은 structured JSON를 detection evidence로 고정한다.
- 따라서 analyze 문서에서 authoritative marker라고 부를 수 있는 것은 bare directory가 아니라, 위 코드와 테스트가 직접 수집하거나 검증하는 파일 surface다.
- active runtime 설명은 canonical-first여야 한다.
- 다만 T16 defer 범위 때문에 문서에서는 `charx.json` / `module.json` / `preset.json` fallback을 **legacy / deferred** 맥락으로만 언급할 수 있다.

## target별 핵심 차이

| target | documented canonical evidence surface | 비고 |
|---|---|---|
| charx | `.risulorebook`, `.risuregex`, `.risulua`, `.risuvar`, `.risuhtml`, lorebook marker files, structured JSON such as `metadata.json` | `character/`는 directory 이름만으로 analyze 증거가 되는 것이 아니라, charx pack workflow가 읽는 canonical content subtree다 |
| module | `.risulorebook`, `.risuregex`, `.risulua`, `.risutoggle`, `.risuvar`, `.risuhtml`, marker files, structured JSON such as `metadata.json` | canonical-first, metadata-backed layout |
| preset | `.risuprompt`, `.risuregex`, `.risutoggle`, marker files, structured JSON such as `metadata.json` | prompt-template 전용 surface 포함 |

## 관련 문서

- `README.md`
- `workflow-output-structures.md`
- `common/root-json-removal.md`

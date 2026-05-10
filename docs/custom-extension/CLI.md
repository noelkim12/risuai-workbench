# 커스텀 익스텐션 CLI 가이드

이 문서는 표준 커스텀 익스텐션 워크스페이스를 처리하는 CLI(명령줄 인터페이스)의 흐름을 요약한 운영 메모입니다. 현재의 표준은 **표준 우선(Canonical-first)** 원칙을 따르며, 루트 JSON 파일은 아카이브, 폴백 또는 지연된 문맥에서만 제한적으로 언급합니다.

## 기본 원칙

- **추출(Extract)**: 가능한 한 대상을 표준 워크스페이스 구조로 전개하는 것을 목표로 합니다.
- **패키징(Pack)**: 표준 `.risu*` 아티팩트와 실제 런타임에서 참조하는 `.risumodule`(module), `metadata.json`(preset), `.risuchar`(charx) 및 `character/` 페이로드를 기반으로 최종 엔벨로프(Envelope)를 재구성합니다.
- **분석(Analyze)**: 탐색 코드 및 기초 테스트에서 실제로 증명된 인터페이스만을 확정적인 신호(Authoritative Signal)로 간주하여 분석 내용을 기술합니다.

## RisuLua 모드 옵션

Lua가 있는 charx와 module 워크스페이스는 `--risulua-mode <classic|modular>` 옵션을 받을 수 있습니다.

- `classic`: **단일 파일 개발**입니다. 기존 `lua/<targetName>.risulua` 흐름을 유지합니다.
- `modular`: **모듈식 개발**입니다. `lua/main.risulua`에서 시작해 정적 `require("module.id")` 그래프를 `dist/<targetName>.risulua`로 생성합니다.
- 옵션을 생략하면 기존 동작은 그대로 유지됩니다. 다만 `lua/main.risulua`가 있으면 모듈식 개발로 자동 감지됩니다.
- 기존 단일 파일 프로젝트가 `lua/main.risulua` 파일명을 쓰고 있었다면 `--risulua-mode classic`을 명시합니다.
- No Lua manifest in first implementation. CLI는 `risulua.json`이나 `lua/manifest.json`을 찾지 않습니다.
- `risulua-split`/auto-decomposition is future work. extract는 upstream Lua를 `lua/main.risulua`에 쓰며 자동 분해하지 않습니다.
- 내부 구현에서 `bundle mode`라는 표현을 볼 수 있지만, 사용자 문서의 기본 이름은 **모듈식 개발**입니다.

## 분석 및 탐색(Analyze Detection) 관련 명세

- **수집 방식**: `custom-extension-file-discovery.ts`의 탐색 로직은 디렉토리 이름이 아닌 실제 파일을 기준으로 데이터를 수집하며, 이를 `canonicalFiles`, `markerFiles`, `structuredJsonFiles`의 세 가지 버킷으로 분류합니다.
- **증거 기준**: `foundation.test.ts`는 `.risu*` 표준 아티팩트, `_order.json` / `_folders.json` 마커 파일, `.risumodule`, `metadata.json`과 같은 구조화된 JSON 파일을 탐색의 증거로 확정합니다.
- **명칭 정의**: 따라서 분석 문서에서 '확정적 마커'라고 부르는 것은 단순한 디렉토리가 아니라, 위 코드와 테스트가 직접 수집하고 검증하는 파일 인터페이스를 의미합니다.
- **기술 방향**: 모든 활성 런타임 설명은 표준 우선 원칙을 따라야 합니다. 다만, 기술적 지연 범위(T16)로 인해 `charx.json`, `module.json`, `preset.json` 폴백은 **레거시 또는 지연(Deferred)** 문맥에서만 언급될 수 있습니다.

## 대상별 주요 차이점

| 대상 | 문서화된 표준 증거 인터페이스 | 비고 |
|---|---|---|
| 캐릭터 카드 | `.risuchar` 루트 marker, `.risulorebook`, `.risuregex`, `.risulua`, `.risuvar`, `.risuhtml`, 로어북 마커 파일, legacy `metadata.json` 등 구조화 JSON | `.risuchar`는 캐릭터 루트와 metadata owner를 확정하는 표준 신호입니다. `character/` 디렉토리는 이름 자체보다 패키징 워크플로우가 읽는 표준 내용 하위 트리로서의 의미가 더 큽니다. |
| 모듈 | `.risumodule` 루트 marker, `.risulorebook`, `.risuregex`, `.risulua`, `.risutoggle`, `.risuvar`, `.risuhtml`, 마커 파일 등 구조화 JSON | `.risumodule`는 모듈 루트와 metadata owner를 확정하는 표준 신호입니다. 이전의 `metadata.json` 기반 metadata owner 방식은 더 이상 표준이 아니며, 이는 breaking migration입니다. |
| 프리셋 | `.risuprompt`, `.risuregex`, `.risutoggle`, 마커 파일, `metadata.json` 등 구조화 JSON | 프롬프트 템플릿 전용 인터페이스를 포함합니다. |


## 관련 문서

- `README.md`
- `workflow-output-structures.md`
- `common/root-json-removal.md`

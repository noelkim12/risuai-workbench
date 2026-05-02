# 커스텀 익스텐션 CLI 가이드

이 문서는 표준 커스텀 익스텐션 워크스페이스를 처리하는 CLI(명령줄 인터페이스)의 흐름을 요약한 운영 메모입니다. 현재의 표준은 **표준 우선(Canonical-first)** 원칙을 따르며, 루트 JSON 파일은 아카이브, 폴백 또는 지연된 문맥에서만 제한적으로 언급합니다.

## 기본 원칙

- **추출(Extract)**: 가능한 한 대상을 표준 워크스페이스 구조로 전개하는 것을 목표로 합니다.
- **패키징(Pack)**: 표준 `.risu*` 아티팩트와 실제 런타임에서 참조하는 `metadata.json` 및 `character/` 페이로드를 기반으로 최종 엔벨로프(Envelope)를 재구성합니다.
- **분석(Analyze)**: 탐색 코드 및 기초 테스트에서 실제로 증명된 인터페이스만을 확정적인 신호(Authoritative Signal)로 간주하여 분석 내용을 기술합니다.

## 분석 및 탐색(Analyze Detection) 관련 명세

- **수집 방식**: `custom-extension-file-discovery.ts`의 탐색 로직은 디렉토리 이름이 아닌 실제 파일을 기준으로 데이터를 수집하며, 이를 `canonicalFiles`, `markerFiles`, `structuredJsonFiles`의 세 가지 버킷으로 분류합니다.
- **증거 기준**: `foundation.test.ts`는 `.risu*` 표준 아티팩트, `_order.json` / `_folders.json` 마커 파일, `metadata.json`과 같은 구조화된 JSON 파일을 탐색의 증거로 확정합니다.
- **명칭 정의**: 따라서 분석 문서에서 '확정적 마커'라고 부르는 것은 단순한 디렉토리가 아니라, 위 코드와 테스트가 직접 수집하고 검증하는 파일 인터페이스를 의미합니다.
- **기술 방향**: 모든 활성 런타임 설명은 표준 우선 원칙을 따라야 합니다. 다만, 기술적 지연 범위(T16)로 인해 `charx.json`, `module.json`, `preset.json` 폴백은 **레거시 또는 지연(Deferred)** 문맥에서만 언급될 수 있습니다.

## 대상별 주요 차이점

| 대상 | 문서화된 표준 증거 인터페이스 | 비고 |
|---|---|---|
| 캐릭터 카드 | `.risulorebook`, `.risuregex`, `.risulua`, `.risuvar`, `.risuhtml`, 로어북 마커 파일, `metadata.json` 등 구조화 JSON | `character/` 디렉토리는 이름 자체보다 패키징 워크플로우가 읽는 표준 내용 하위 트리로서의 의미가 더 큽니다. |
| 모듈 | `.risulorebook`, `.risuregex`, `.risulua`, `.risutoggle`, `.risuvar`, `.risuhtml`, 마커 파일, `metadata.json` 등 구조화 JSON | 표준 우선 원칙을 따르는 메타데이터 기반 레이아웃을 사용합니다. |
| 프리셋 | `.risuprompt`, `.risuregex`, `.risutoggle`, 마커 파일, `metadata.json` 등 구조화 JSON | 프롬프트 템플릿 전용 인터페이스를 포함합니다. |


## 관련 문서

- `README.md`
- `workflow-output-structures.md`
- `common/root-json-removal.md`

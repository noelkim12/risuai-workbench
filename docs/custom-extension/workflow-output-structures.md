# 표준 워크플로우 출력 구조 (Workflow Output Structures)

이 문서는 추출(Extract), 패키징(Pack), 분석(Analyze) 작업 시 기준이 되는 워크스페이스 구조를 정리한 운영 가이드입니다.

## 공통 원칙

- **콘텐츠 중심**: 표준 워크스페이스는 `.risu*` 페이로드 파일과 `metadata.json`을 중심으로 설명하고 구성합니다.
- **증거 기반 기술**: 분석 및 탐색 명세는 `custom-extension-file-discovery.ts`와 `foundation.test.ts`가 실제로 수집하는 파일 증거를 기준으로 작성합니다. 단순한 디렉토리 이름만으로 대상 판별이 확정되었다고 기술하지 않습니다.
- **레거시 배제**: 루트 JSON 파일(`charx.json`, `module.json`, `preset.json`)은 현재의 표준 출력 구조가 아닙니다. 다만, 분석 문맥에서 레거시 폴백이 남아 있을 경우 이를 명시적으로 표기합니다.

## 캐릭터 카드 (Charx)

```text
<캐릭터_루트>/
├── character/ (핵심 데이터 및 메타데이터)
├── lorebooks/ (로어북 아티팩트)
├── regex/ (정규식 아티팩트)
├── lua/ (Lua 스크립트)
├── variables/ (변수 설정)
└── html/ (배경 HTML)
```

- **편집 인터페이스**: `character/` 디렉토리는 캐릭터 패키징 워크플로우의 핵심 인터페이스입니다. `character/*.txt`, `alternate_greetings.json`, `metadata.json` 등을 포함합니다.
- **탐색 기준**: 위 구조는 물리적 레이아웃을 보여주지만, 탐색 증거로서의 의미는 실제 내부 파일들(`.risu*`, 마커 파일, 구조화된 JSON)에 있습니다.

## 모듈 (Module)

```text
<모듈_루트>/
├── metadata.json (표준 구조화 JSON)
├── lorebooks/
├── regex/
├── lua/
├── toggle/
├── variables/
└── html/
```

- **구조화된 인터페이스**: `metadata.json`은 표준 구조화 인터페이스 역할을 수행합니다.
- **탐색 증거**: 로어북 정렬 마커(`_order.json`, `_folders.json`)와 각 `.risu*` 페이로드 파일이 탐색의 근거를 형성합니다.

## 프리셋 (Preset)

```text
<프리셋_루트>/
├── metadata.json
├── prompt_template/
├── regex/
└── toggle/
```

- **탐색 명세**: 프리셋 역시 단순히 디렉토리 이름만으로 판별되지 않습니다. 그 하위에 위치한 `.risuprompt`, `.risutoggle`, `.risuregex` 파일들과 탐색 엔진이 수집하는 마커 파일들이 확정적인 근거가 됩니다.

## 지연된 처리 및 폴백 관련 메모 (Deferred / Fallback)

- **이관 상태**: 현재의 분석 워크플로우는 레거시 루트 JSON 폴백이 완전히 제거된 최종 상태는 아닙니다.
- **표기 규칙**: 문서에서 `charx.json`, `module.json`, `preset.json`을 언급할 때는 반드시 **레거시(Legacy)**, **폴백(Fallback)** 또는 **지연(Deferred)** 문맥임을 명시해야 합니다.
- **활성 표준**: 추출 및 패키징의 활성 표준은 오직 표준 `.risu*` 인터페이스와 런타임이 실제로 참조하는 메타데이터/페이로드 구조뿐입니다.

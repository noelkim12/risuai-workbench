# 모듈 대상 (Module Target)

`module`은 로어북, 정규식, Lua, 토글, 변수, HTML 아티팩트를 포함하는 표준 모듈 대상 명세입니다.

## 표준 워크스페이스 구조 (Canonical Layout)

현재 Lua 레이아웃은 **단일 파일 개발**과 **모듈식 개발**을 지원합니다. CLI 표기는 `--risulua-mode <classic|modular>`입니다. `bundle mode`는 내부 구현 개념이고, 사용자에게 주로 설명할 이름은 모듈식 개발입니다.

### 단일 파일 개발

```text
<모듈_루트>/
├── .risumodule (모듈 루트 marker 및 metadata owner)
├── lorebooks/
│   ├── _order.json (로어북 정렬 순서)
│   └── <폴더...>/<엔트리>.risulorebook
├── regex/
│   ├── _order.json (정규식 정렬 순서)
│   └── *.risuregex
├── lua/
│   └── <모듈명>.risulua (단일 파일)
├── toggle/
│   └── <모듈명>.risutoggle (단일 파일)
├── variables/
│   └── <모듈명>.risuvar (단일 파일)
├── html/
│   └── background.risuhtml (고정파일명)
└── assets/                  # 에셋 (assets/manifest.json 존재 시에만 유효)
    ├── manifest.json
    └── <추출된 에셋 파일들...>
```

### 모듈식 개발

```text
<모듈_루트>/
├── .risumodule (모듈 루트 marker 및 metadata owner)
├── lorebooks/
├── regex/
├── lua/
│   ├── main.risulua (단일 작성 진입점)
│   └── common/
│       ├── variables.risulua
│       └── function.risulua
├── dist/
│   └── <모듈명>.risulua (생성 전용 singleton pack artifact)
├── toggle/
├── variables/
├── html/
└── assets/
    ├── manifest.json
    └── <추출된 에셋 파일들...>
```

모듈식 개발에서 `lua/**/*.risulua`는 작성 source이고, `dist/<targetName>.risulua`만 패키징 입력으로 인정되는 생성 artifact입니다. `require("common.variables")`는 `lua/common/variables.risulua`로 해석됩니다. 동적 require, slash paths, `.risulua` suffix, `package.path`/`package.cpath`/`package.searchers`/`package.loaders` mutation, `dofile`, `loadfile`, `require` shadow/alias/reassignment는 금지됩니다.

No Lua manifest in first implementation. `.risumodule`은 Lua manifest가 아니며, `risulua.json`이나 `lua/manifest.json`도 현재 동작이 아닙니다. pack은 modular pack에서 dist를 다시 만들고 `dist/<targetName>.risulua`만 모듈 Lua 페이로드로 주입하며 source module을 주입하지 않습니다. extract는 upstream Lua를 `lua/main.risulua`에 쓰고 자동 분해하지 않습니다. scaffold는 starter layout과 `dist/`를 만들지만 생성된 dist 파일은 만들지 않습니다. `risulua-split`/auto-decomposition is future work. `lua/main.risulua` 자동 감지가 기존 파일명과 충돌하면 `--risulua-mode classic`을 명시합니다.

패키징 시 병합(Merge) 우선순위는 다음과 같습니다.
`메타데이터 → 로어북 → 정규식 → Lua → 변수 → HTML → 토글 → 에셋`

## 아티팩트 소유권 및 매핑 명세

| 아티팩트 종류 | 매핑되는 상위(Upstream) 필드                        |
| ------------- | --------------------------------------------------- |
| 로어북        | `_moduleLorebook` 필드                              |
| 정규식        | `customscript[]` 배열 필드                          |
| Lua           | 모듈 내 트리거(Trigger) 및 Lua 페이로드 영역        |
| 토글 설정     | `customModuleToggle` 필드                           |
| 변수 설정     | 모듈 수준의 변수 설정 영역                          |
| HTML          | `backgroundEmbedding` 필드                          |
| 에셋 (Assets) | `assets` 튜플(Tuple) 페이로드 및 추출된 버퍼 데이터 |

## 메타데이터 관리 원칙

`.risumodule`가 소유하는 구조화된 메타데이터 필드는 다음과 같이 제한됩니다.

- **문자열(String)**: `name`, `description`, `id`, `namespace`, `cjs`
- **문자열 또는 null(String or null)**: `image`
- **불리언(Boolean)**: `lowLevelAccess`, `hideIcon`
- **객체(Object)**: `mcp` (Model Context Protocol 설정)

위 필드들은 데이터 페이로드가 아닌 구조화된 메타데이터 인터페이스(`.risumodule`)의 책임 범위입니다. 이전의 `metadata.json` 기반 metadata owner 방식은 더 이상 표준이 아니며, `.risumodule`가 없을 때도 `metadata.json`로 폴백하지 않습니다. 이는 breaking migration입니다.

`.risumodule.image`는 RisuAI runtime module 필드가 아니라 Workbench thumbnail metadata입니다. Pack workflow는 이 값을 upstream module JSON에 쓰지 않으며, 이미지 파일의 실제 패키징 여부는 계속 `assets/manifest.json`과 module asset tuple/buffer 흐름이 결정합니다.

`risu-core scaffold module --name "RPG Module" --namespace rpg`처럼 scaffold 단계에서 `--namespace`를 제공하면 초기 `.risumodule.namespace`가 같은 문자열로 기록됩니다. `--namespace`를 생략한 scaffold는 namespace를 임의로 만들지 않으며, 추출/패키징 경로는 기존처럼 upstream `module.namespace`와 `.risumodule.namespace`를 보존·적용합니다.

## 토글 소유권 제약 사항

- **공식 소유자**: 모듈 토글의 표준 소유자는 오직 `toggle/*.risutoggle` 파일입니다.
- **마커 위임 금지**: `.risumodule`은 `customModuleToggle` 필드를 포함할 수 없습니다. 스키마 계약은 `not: { required: ["customModuleToggle"] }`로 이를 명시적으로 거부합니다.
- **오류 처리**: `.risumodule`에 `customModuleToggle` 필드가 포함되면 검증/파싱 단계에서 거부됩니다. `customModuleToggle`은 오직 `toggle/*.risutoggle`에서만 읽습니다.

## 에셋 인터페이스 (Assets Surface)

- **선택적 구조**: `assets/` 디렉토리는 모든 모듈 워크스페이스에 필수적인 레이아웃이 아닙니다.
- **활성화 조건**: `assets/manifest.json` 파일이 존재할 때만 에셋 인터페이스가 구체화(Materialize)됩니다.
- **데이터 조립**: 매니페스트의 `assets[]` 항목들을 기반으로 정렬된 튜플 페이로드를 생성하며, `extracted_path`가 가리키는 실제 파일들을 읽어 바이너리 데이터로 포함시킵니다.
- **비활성 상태**: 매니페스트 파일이 없으면 최종 결과물에 `assets` 페이로드를 생성하지 않습니다.

## 루트 JSON 제거 방침

- **활성 소스**: 현재 유효한 편집 소스는 `module.json`이 아닙니다.
- **현행 명세**: 표준 어댑터를 워크스페이스 파일들에 직접 적용하여 모듈 엔벨로프(Envelope)를 재구성하는 흐름이 현재의 신뢰 기준입니다.
- **호환성**: 분석 또는 지연된 메모가 필요한 경우에도 `module.json`을 현재의 표준으로 설명하지 않습니다.

# 커스텀 익스텐션 공통 원칙

이 문서는 `risuai-workbench`가 채택한 표준 커스텀 익스텐션(Canonical Custom Extension) 구조의 공통 규칙을 정의합니다. 모든 구현, 테스트, LSP 관련 문서는 이 파일과 각 아티팩트/대상별 문서를 함께 참조하며, 활성 워크스페이스의 동작은 표준 편집 인터페이스(Canonical Authoring Surface)를 최우선 기준으로 삼습니다.

## 신뢰 기준 (Source of Truth)

- **워크스페이스 중심**: 신뢰 기준은 루트 JSON 파일이 아닌, 생성된 표준 `.risu*` 파일 집합, 마커(Marker) 파일, `metadata.json` 등 워크스페이스 인터페이스입니다.
- **문서의 역할**: 아카이브 성격의 `../custom-extension-design.md`는 과거 설계 스냅샷입니다. 현재 적용되는 활성 규칙은 이 문서와 `../extensions/*.md`, `../targets/*.md`에서 정의합니다.
- **구현 우선주의**: 실제 구현된 동작이 문서보다 우선합니다. 문서는 현재 배포된 동작(Shipped Behavior)을 설명하며, 미래의 이상적인 상태는 별도의 메모(Note)로 구분하여 기술합니다.

## 표준 용어 가이드라인

- **표준 생성/편집 워크스페이스 인터페이스 (Canonical Surface)**: 사용자가 워크스페이스에서 직접 확인하고 수정하는 `.risu*`, 마커 파일, `metadata.json` 계층을 의미합니다.
- **레거시/지연 폴백 인터페이스 (Legacy / Deferred Fallback Surface)**: 분석, 아카이브, 이전 버전과의 링크 호환 등을 위해 유지되는 비주도적 입력 경로입니다. 수용은 가능하나 현재 워크스페이스의 표준은 아닙니다.
- **바이너리/내부 호환성 동작 (Binary / Internal Compatibility Behavior)**: `.charx`, `.risum`, 내부 직렬화 이름 등 패키징 이후 또는 런타임 내부에서만 관찰되는 비워크스페이스 동작입니다.
- **표기 규칙**: 문서에서 루트 JSON, 구조화된 JSON, 폴백 등을 언급할 때는 위 세 범주 중 어디에 해당하는지 명확히 병기합니다.

## 대상(Target) × 아티팩트(Artifact) 소유권

| 아티팩트 | 확장자 | 캐릭터(charx) | 모듈(module) | 프리셋(preset) | 비고 |
|---|---|:---:|:---:|:---:|---|
| 로어북 | `.risulorebook` | ✓ | ✓ |   | 다중 파일 지원 + `_order.json` |
| 정규식 | `.risuregex` | ✓ | ✓ | ✓ | 다중 파일 지원 + `_order.json` |
| Lua | `.risulua` | ✓ | ✓ |   | 대상당 단일 파일(Singleton) |
| 프롬프트 템플릿 | `.risuprompt` |   |   | ✓ | 다중 파일 지원 + `_order.json` |
| 토글 | `.risutoggle` |   | ✓ | ✓ | 대상당 단일 파일 |
| 변수 | `.risuvar` | ✓ | ✓ |   | 대상당 단일 파일 |
| HTML | `.risuhtml` | ✓ | ✓ |   | `background.risuhtml` 고정 |

## 명명, 정렬 및 싱글톤 규칙

- **순서 보존**: 로어북, 정규식, 프롬프트 템플릿과 같이 다중 파일로 구성되는 아티팩트는 `_order.json`을 정렬의 신뢰 기준으로 사용합니다.
- **로어북 식별**: 현재 경로 기반 식별(Path-based Identity)을 기본으로 합니다. 표준 레이아웃은 `lorebooks/<폴더...>/<엔트리>.risulorebook` 구조와 `_order.json`을 조합하며, 과거의 `_folders.json`은 아카이브 참고용으로만 활용합니다.
- **싱글톤(Singleton) 인터페이스**: Lua, 토글, 변수, HTML은 대상당 단일 파일만 허용됩니다. 중복된 소스가 발견될 경우 자동 병합하지 않고 오류로 처리합니다.
  - HTML은 항상 `html/background.risuhtml` 경로를 사용합니다.
  - 프리셋 토글은 `toggle/prompt_template.risutoggle`를 기본 싱글톤 인터페이스로 간주합니다.

## 편집 범위(Authoring Scope) 원칙

- **가치 중심 전개**: 워크벤치는 상위 포맷의 모든 필드를 무조건 워크스페이스 파일로 전개하지 않습니다.
- **편집 권한**: 표준 인터페이스는 **실제로 워크벤치에서 편집, 검증하고 왕복 변환 계약을 유지할 가치가 있는 필드**만을 소유합니다.
- **필드 보존**: 편집 범위 밖의 필드는 추출 시 워크스페이스에 생성되지 않을 수 있으며, 패키징 시 상위 기본값, 템플릿 오버레이 또는 보존된 메타데이터를 통해 재구성됩니다.
- **데이터 유실에 대한 관점**: "표준 파일에 필드가 없음"이 곧 데이터 유실을 의미하지는 않습니다. 의도적으로 미편집 영역으로 분류된 차이는 '허용된 손실(Allowed loss)'로 명시합니다.

### 주요 사례
- **메타데이터 분리**: 캐릭터/모듈/프리셋의 구조화된 메타데이터는 `metadata.json`이 담당하고, 실제 데이터 페이로드는 `.risu*` 파일이 담당합니다.
- **로어북 폴더**: 로어북의 폴더 정체성은 파일 내의 `folder` 문자열보다 물리적 경로와 `_order.json` 명시를 우선합니다.
- **Lua 보존**: `.risulua`는 현재 함수 단위 분할이 아닌, 상위의 `triggerscript` 바이너리 데이터를 원본 그대로 보존합니다.

## 왕복 변환 차이(Diff) 분류

변환 과정에서 발생하는 차이는 다음 세 가지로 분류합니다.

| 분류 | 의미 | 예시 |
|---|---|---|
| `intentional_unedited` | 편집 범위 밖의 필드로, 표준 인터페이스가 소유하지 않는 차이 | 기본값 오버레이, 미편집 필드의 복원 |
| `upstream_limit` | 상위 런타임 또는 저장 포맷의 기술적 한계로 인한 차이 | 런타임 전용 주입 데이터, 대소문자 구분 소멸 |
| `design_bug` | 현재의 표준 계약이나 구현상의 오류로 인한 차이 | 문서와 코드의 불일치, 패키징 로직 누락 |

- **관리 원칙**: `intentional_unedited`와 `upstream_limit`는 반드시 허용 목록(Allowlist) 근거가 있어야 합니다. 근거가 없는 모든 차이는 `design_bug`로 간주합니다. 문서는 허용된 차이가 왜 발생하는지, 현재의 계약 범위가 어디까지인지를 명확히 설명해야 합니다.

## CBS 포함 소스 타입 매핑

CBS LSP 및 조각 매핑의 기준은 다음과 같습니다.

| 아티팩트 | CBS 포함 영역 | 비고 |
|---|---|---|
| `.risulorebook` | `@@@ CONTENT` | 프론트매터, KEYS, SECONDARY_KEYS 영역은 CBS 비포함 |
| `.risuregex` | `@@@ IN`, `@@@ OUT` | 두 섹션 모두 CBS 분석 대상 |
| `.risuprompt` | `@@@ TEXT`, `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT` | 프롬프트 타입에 따라 섹션 존재 여부 결정 |
| `.risuhtml` | 파일 전체 | 전체가 CBS 분석 대상 |
| `.risulua` | 파일 전체 | 현재는 파일 전체를 하나의 조각으로 처리 (향후 리터럴 단위 매핑 예정) |
| `.risutoggle` | 없음 | CBS가 아닌 전용 설정 언어 |
| `.risuvar` | 없음 | 단순 키=값(Key=Value) 쌍 |

## 검증 및 수정 워크플로우

문서 수정 시 다음 절차를 준수하십시오.

1. 관련 아티팩트 및 대상 문서를 정독합니다.
2. 실제 구현 파일 및 테스트 코드와 대조합니다.
3. 현재 구현된 동작(Shipped)과 미래 설계(Ideal)를 엄격히 분리합니다.
4. 루트 JSON, 레거시 폴백, Lua AST 등 지연된 범위는 표준 워크스페이스 명세와 명확히 구분하여 표기합니다.
5. 왕복 변환 명세와 LSP 설명 간에 모순이 없는지 최종 확인합니다.

## 같이 읽을 문서

- `root-json-removal.md`
- `../extensions/*.md`
- `../targets/*.md`
- `../../packages/cbs-lsp/README.md`
- `../../packages/core/src/domain/custom-extension/cbs-fragments.ts`

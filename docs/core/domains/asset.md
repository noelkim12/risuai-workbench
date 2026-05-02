# 에셋 도메인 (Asset Domain)

이 문서는 `packages/core/src/domain/asset/asset-uri.ts` 파일이 담당하는 URI 해석 및 MIME 확장자 추론 명세만을 다룹니다.

## 이 페이지가 담당하는 범위

- 에셋 URI 문자열을 순수 데이터 기술자(Pure Data Descriptor)로 변환하는 헬퍼
- MIME 문자열로부터 파일 확장자를 추정하는 헬퍼

## 구현 명세 (Current Truth)

- 루트 내보내기(Root Export)는 현재 `resolveAssetUri`, `guessMimeExt`, `AssetDict`, `ResolvedAsset`을 노출합니다.
- `resolveAssetUri`는 `__asset:`, `embeded://`, `embedded://`, `ccdefault:`, `data:...;base64,...`, `http://`, `https://` 형식을 인식합니다.
- 반환 타입은 실제 가져오기(Fetch) 결과가 아닌 `{ data, type, metadata }` 형상(Shape)을 가집니다.
- `data:` URI 처리 시 최대 50MB의 페이로드 가드(Payload Guard)를 적용하며, 이를 초과할 경우 `null`을 반환합니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| URI 해석 (Resolve) | `resolveAssetUri`, `ResolvedAsset` |
| 지원 딕셔너리 | `AssetDict` |
| MIME 확장자 | `guessMimeExt` |

## 현재 구현 확정 사항

- `__asset:` 접두사는 에셋 인덱스 조회(Asset Index Lookup)로 해석합니다.
- `embeded://` (오탈자 포함)와 `embedded://` 형식을 모두 동일한 내장 경로로 처리합니다.
- 원격 URL(Remote URL)은 실제 다운로드를 수행하지 않고 `type: 'remote'`, `metadata.url` 정보만을 반환합니다.
- 식별할 수 없는 MIME 타입은 기본적으로 `.bin` 확장자로 추론합니다.

## 범위 명세 (Scope Boundary)

- 이 헬퍼는 파일 저장, 에셋 추출, 매니페스트 조립(Manifest Assembly) 기능을 수행하지 않습니다.
- 원격 데이터 가져오기, 캐싱, 파일 시스템 쓰기는 순수 도메인 계층의 범위를 벗어납니다.
- 모듈 에셋 워크스페이스 레이아웃은 [`../../custom-extension/targets/module.md`](../../custom-extension/targets/module.md) 및 Node/CLI 워크플로우에서 담당합니다.

## evidence anchors

- `../../../packages/core/src/domain/asset/asset-uri.ts`
- `../../../packages/core/src/domain/index.ts`
- `../../../packages/core/tests/root-entry-contract.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../node/README.md`](../node/README.md)
- [`./module.md`](./module.md)

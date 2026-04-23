# 변수 설정 표준 (.risuvar)

`.risuvar`는 캐릭터 카드(charx)와 모듈(module)에서 사용하는 전용 표준 단일 파일 아티팩트 명세입니다. CBS 매크로가 아닌 단순한 `키=값` 형식의 텍스트 인터페이스를 제공하며, 파싱 규칙이 매우 엄격하므로 주의가 필요합니다.

## 지원 범위 및 위치

- **지원 대상**: 캐릭터 카드(`charx`), 모듈(`module`)
- **미지원 대상**: 프리셋(`preset`)
- **파일 위치**: `variables/` 디렉토리
- **확장자**: `.risuvar`

## 표준 파일 형식 (Format)

```text
변수명1=값1
변수명2=문자열값
변수명3=A=B=C (중복 등호 허용)
변수명4= (빈 값 허용)
등호가_없는_행
```

## 파싱(Parse) 상세 규칙

1. **분리 기준**: 행 내의 **첫 번째 등호(`=`)**만을 기준으로 키와 값을 분리합니다.
2. **공백 행**: 공백이나 탭으로만 구성된 행은 분석 시 무시됩니다.
3. **빈 값 처리**: 등호가 아예 없는 행은 해당 키의 값을 빈 문자열(`""`)로 처리합니다.
4. **개행 문자**: `\r\n` (Windows) 및 `\n` (POSIX) 형식을 모두 지원합니다.
5. **공백 보존**: 행 앞뒤의 공백 제거(Trim)는 행 전체 무시 여부를 판단할 때만 사용하며, 키와 값 내부의 공백은 원본 그대로 보존합니다.

## 단일 파일 원칙 및 오류 규칙

- **LSP 지원**: `.risuvar`는 CBS 분석 대상에서 제외되는 비CBS 인터페이스입니다.
- **중복 금지**: 대상당 단 하나의 파일만 허용됩니다. 동일한 대상 내에 중복된 소스가 발견될 경우 오류로 처리합니다.

## 상위(Upstream) 필드 매핑

| 대상 | 매핑되는 상위 인터페이스 |
|---|---|
| 캐릭터 카드 | `extensions.risuai.defaultVariables` 필드 |
| 모듈 | 모듈 수준의 변수 설정 영역 |

## 작성 예시

```text
ct_generatedHTML= 
hp=100
description=상세 설명=A=B
```


## parse 규칙

1. `=`는 **첫 번째 것만** split한다.
2. whitespace-only line은 건너뛴다.
3. `=`가 없으면 empty value로 본다.
4. `\r\n`, `\n` 둘 다 허용한다.
5. trim은 전체 line skip 판단에만 쓰고, key/value 내부 whitespace는 보존한다.

## 현재 계약

- `.risuvar`는 non-CBS surface다.
- target당 1개만 허용한다.
- duplicate source는 오류로 처리한다.

## upstream 매핑

| target | upstream surface |
|---|---|
| charx | `extensions.risuai.defaultVariables` |
| module | module-level variable surface |

## 예시

```text
ct_generatedHTML= 
hp=100
description=a=b=c
```

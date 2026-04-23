# `.risuvar`

`variable`는 charx / module 전용 singleton artifact다. CBS가 아니라 단순 key=value text surface이며, parse 규칙이 생각보다 엄격하다.

## 지원 대상 / 위치

- 지원 대상: `charx`, `module`
- 미지원 대상: `preset`
- 디렉토리: `variables/`
- suffix: `.risuvar`

## 형식

```text
var1=1
var2=test
var3=a=b=c
var4=
no_equals_line
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

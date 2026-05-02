# 토글 설정 표준 (.risutoggle)

`.risutoggle`은 모듈(module)과 프리셋(preset)에서 사용하는 전용 표준 단일 파일 아티팩트 명세입니다. 이 아티팩트는 **CBS가 아닌 별도의 토글 전용 설정 언어(DSL)**를 사용한다는 점에 주의하십시오.

## 지원 범위 및 위치

- **지원 대상**: 모듈(`module`), 프리셋(`preset`)
- **미지원 대상**: 캐릭터 카드(`charx`)
- **파일 위치**: `toggle/` 디렉토리
- **확장자**: `.risutoggle`

## 표준 파일 형식 (Format)

- 파일의 내용 전체가 가공되지 않은 토글 전용 설정 문자열입니다.
- 파싱 및 직렬화 시 데이터의 변형 없이 있는 그대로의 상태를 유지(Identity transform)합니다.
- 프론트매터(YAML), 섹션 마커(`@@@`), CBS 조각 매핑 등의 구조를 사용하지 않습니다.

## 현재 구현 명세

- **LSP 지원**: `.risutoggle` 파일은 CBS 분석 및 LSP 라우팅 대상에서 제외됩니다.
- **단일 파일 원칙**: 대상(Target)당 단 하나의 파일만 허용됩니다.
- **프리셋 기본값**: 프리셋 대상은 `toggle/prompt_template.risutoggle` 경로를 기본 편집 인터페이스로 간주합니다.

## 작성 예시

```text
=⚔️Merry RPG 모듈 설정=group
BGMplugin=🎵 BGM 사용(BGM 플러그인 필요)
SoundEffect=🔊 효과음 출력
==groupEnd
```

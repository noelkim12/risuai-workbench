# `.risutoggle`

`toggle`는 module / preset 전용 singleton artifact다. 중요한 점은 이 surface가 **CBS가 아니라 별도 toggle DSL**이라는 것이다.

## 지원 대상 / 위치

- 지원 대상: `module`, `preset`
- 미지원 대상: `charx`
- 디렉토리: `toggle/`
- suffix: `.risutoggle`

## 형식

- 파일 전체가 raw toggle DSL 문자열이다.
- parse / serialize는 identity transform을 유지한다.
- frontmatter / section marker / CBS fragment 분리는 없다.

## 현재 계약

- `.risutoggle`는 LSP CBS routing 대상이 아니다.
- target당 한 파일만 허용한다.
- preset은 `prompt_template.risutoggle`를 기본 singleton surface로 본다.

## 예시

```text
=⚔️Merry RPG 모듈=group
BGMplugin=🎵 BGM(BGM 플러그인 필요)
SoundEffect=🔊 효과음
==groupEnd
```

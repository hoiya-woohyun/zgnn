# Zgnn Sans (Pretendard 서브셋)

- 원본: **Pretendard 1.3.9** — 길형진, https://github.com/orioncactus/pretendard (npm `pretendard@1.3.9` 의 `dist/web/static/woff2`)
- 라이선스: **SIL Open Font License 1.1** — 전문은 같은 폴더의 [`OFL.txt`](./OFL.txt)(원본 배포본 그대로).
  글꼴 단독 판매만 금지이고 사용·수정·재배포는 된다.
- 여기 있는 `.woff2` 는 원본을 **서브셋한 파생본**이다(한글 완성형 11,172자 + 라틴 + 문장부호, 굵기 400·600).
- **이름이 Pretendard 가 아닌 이유:** 원본이 `Pretendard` 를 **예약 글꼴 이름(Reserved Font Name)** 으로 걸어 두었다.
  OFL 은 고친 파생본(서브셋 포함)이 그 이름을 쓰는 것을 막는다. 그래서 글꼴 내부 이름(name 표 1·4·6·16)과 파일 이름을
  `Zgnn Sans` 로 바꿨다. 설명(name 10)에 원본을 적어 두었다.

재생성 절차와 굵기를 400·600 둘로 둔 이유:
[docs/architecture/pwa-offline.md](../../../docs/architecture/pwa-offline.md#글꼴-self-host),
[docs/decisions/ADR-006](../../../docs/decisions/ADR-006-responsive-scale-and-font.md)

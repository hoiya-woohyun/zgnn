# 프로젝트 문서 (docs/)

## 빠른 시작

- 이 앱이 **무엇이고 왜 만드는지**는 [CONCEPT.md](./CONCEPT.md).
- 코드가 **어떻게 짜여 있는지**는 [ARCHITECTURE.md](./ARCHITECTURE.md) 에서 시작한다. 모든 문서의 허브다.
- 실행·빌드 명령은 레포 루트의 [README.md](../README.md).

## 폴더 구조

```
docs/
├── README.md                 # 이 파일. 문서 폴더 안내와 작성 원칙
├── CONCEPT.md                # 제품 컨셉 — 누구를 위해, 무엇을, 왜
├── ARCHITECTURE.md           # 아키텍처 인덱스(허브). 요약 + 상세 문서 링크
├── architecture/             # 시스템 설계 본문
│   ├── data-pipeline.md      # Notion → 정규화 → src/data
│   ├── pet-policy-and-eligibility.md  # 반려동물 이용 조건 파서와 "우리 강아지 갈 수 있나" 판정
│   ├── app-shell-and-state.md         # 라우팅·화면 셸·클라이언트 상태
│   └── pwa-offline.md        # 서비스워커·프리캐시·오프라인
├── decisions/                # ADR-NNN-{slug}.md — 맥락 → 결정 → 결과
└── features/                 # 기능 단위 문서(현재 동작 또는 계획 스펙)
```

## 문서 작성 원칙

1. **간결하게.** 코드에서 읽히는 것은 적지 않는다. "왜 이렇게 했나", "무엇이 비직관적인가", "무엇을 하지 말 것인가"를 적는다.
2. **다이어그램은 흐름이 두 갈래 이상일 때만.** Mermaid 를 쓴다.
3. **날짜를 남긴다.** 문서 H1 바로 아래 `> 최종 수정: YYYY-MM-DD (내용)` 블록쿼트를 최신이 위로 오게 쌓는다.
4. **파일을 링크한다.** 관련 코드 경로를 `src/...` 로 적어 문서에서 코드로 바로 갈 수 있게 한다.

## 문서 갱신 규칙

`src/` 를 고치면 같은 작업 안에서 `docs/` 도 갱신한다. 어떤 문서를 만지는지는
[.cursor/rules/docs-update-policy.mdc](../.cursor/rules/docs-update-policy.mdc) 에 트리거 표로 있다.

- 설계 결정을 바꾸면 `decisions/ADR-NNN-{slug}.md` (3자리 연번, kebab-case, 파일명에 날짜 없음). 같은 결정을 보완·번복하면 새 파일 대신 기존 ADR 을 고친다.
- 기능을 추가하면 `features/{slug}.md`. 계획 단계 문서는 상단에 `> 상태: 제안` 을 적는다.
- `architecture/` 문서가 가리키는 경로를 고치면 그 문서의 해당 섹션과 최종 수정일을 갱신한다.

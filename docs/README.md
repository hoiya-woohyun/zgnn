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
├── reviews/                  # YYYY-MM-DD-{slug}.md — 디자인·품질 감사 기록과 미결 판단
└── features/                 # 기능 단위 문서(현재 동작 또는 계획 스펙)
```

## 문서 작성 원칙

1. **간결하게.** 코드에서 읽히는 것은 적지 않는다. "왜 이렇게 했나", "무엇이 비직관적인가",
   "무엇을 하지 말 것인가"를 적는다.
2. **다이어그램은 흐름이 두 갈래 이상일 때만.** Mermaid 를 쓴다.
3. **날짜를 남긴다.** H1 바로 아래 `> 최종 수정: YYYY-MM-DD (vN: 무엇을 왜)` 를 최신이 위로 쌓는다.
4. **파일을 링크한다.** 관련 코드 경로를 `src/...` 로 적어 문서에서 코드로 바로 갈 수 있게 한다.

## 문서 갱신 규칙

**동작·설계·기능이 바뀔 때만** 갱신한다(리팩토링·스타일·오타·한 줄 수정은 건너뛴다).
어느 문서를 만지는지는 경로별 트리거 표가 정본이다 →
[.cursor/rules/docs-update-policy.mdc](../.cursor/rules/docs-update-policy.mdc).

- 설계 결정 → `decisions/ADR-NNN-{slug}.md` (3자리 연번, kebab-case, 파일명에 날짜 없음).
  같은 결정을 보완·번복하면 새 파일 대신 기존 ADR 을 고친다.
- 기능 → `features/{slug}.md`. 계획 단계 문서는 상단에 `> 상태: 제안`.
- 버그 → `bugs/BUG-NNN-{slug}.md` (증상 / 재현 조건 / 원인 / 수정 내용 / 관련 문서).
- `architecture/` 문서가 가리키는 경로를 고치면 그 문서의 해당 섹션과 최종 수정일을 갱신한다.

AI 에이전트용 진입점은 레포 루트의 [CLAUDE.md](../CLAUDE.md) 다 — 불변식과 문서 라우팅 표가 있다.

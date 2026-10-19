# AI 감별 디자인 점검 (`/design-audit`)

> 최종 수정: 2026-10-19 (v1: 신설 — 사용자가 "AI 스러운" 화면(둘러보기 종류 알약 · 필터 칩 · 네이버 길찾기 버튼)을 지적하고,
> AI 티를 감별하는 디자이너 페르소나로 레이아웃 규칙을 사람 손 모양으로 고치자고 했다. 스킬은 `.claude/skills/design-audit/SKILL.md`)

주간 사용성 평가(`/ux-eval`)가 "쓰기 어려운가" 를 본다면 이 점검은 **"사람이 만들었다면 이렇게 했을까"** 를 본다.
평가자는 기획 문서를 읽지 않는 디자이너 한 명(Opus 서브에이전트, fork 금지)이고, 메인은 판정하지 않는다.

| 파일 | 무엇 |
|---|---|
| `<날짜>-references.md` | 실서비스 레퍼런스(직접 본 화면·잰 값). `propose` 의 근거 |
| `<날짜>.md` | `audit` 회차 보고서 — 고칠 것은 [docs/todo/22](../../todo/22-human-design-pass.md) 로 |

## AI 티 목록의 근거

스킬의 T-n 목록은 아래 출처와 [2026-10-19 레퍼런스](2026-10-19-references.md)의 관찰에서 왔다. 출처는 블로그·스킬 문서·디자인 교육 기관 글이고
동료 심사 연구가 아니다 — 그래서 **관찰(실서비스가 실제로 그렇게 하나)** 을 같이 적는다.

| T | AI 티 | 출처 | 실서비스 관찰 |
|---|---|---|---|
| T-1 | 브랜드 틴트 알약 세그먼트로 최상위 분류 | (관찰만) | 0곳. 형제 종류는 글자 탭 + 밑줄(NOL), 세그먼트는 중립·검정(에어비앤비·마이리얼트립) |
| T-2 | 같은 무게 테두리 칩 더미 · 칩마다 개수 | (관찰만) | 옵션별 개수 0/4. 개수는 결과 버튼에 한 번. 시트는 섹션마다 컨트롤이 다르다 |
| T-3 | 모든 부품이 같은 큰 둥글기 | [Impeccable](https://impeccable.style/anti-patterns) · [Laith Aljunaidy](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design) | 칩은 r999, 버튼 r10, 카드는 따로 |
| T-4 | 모든 블록을 카드로 · 카드 속 카드 | [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui) · [Impeccable](https://impeccable.style/anti-patterns) | 필터 시트 4/4 가 카드 대신 굵은 제목 + 구분선 |
| T-5 | 틴트 둥근 네모 속 아이콘 | [Impeccable /slop](https://impeccable.style/slop) · [get-design-done SLOP-07](https://cdn.jsdelivr.net/npm/@hegemonart/get-design-done@1.60.4/reference/anti-patterns.md) | 캐치테이블·에어비앤비·반려생활 모두 상자 없는 선 아이콘 + 라벨 |
| T-6 | 반복 카드마다 원색 CTA · 크롬 전반의 브랜드색 | [Laith](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design) · [Fountain #6](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui) | 비지도 서비스 3/3 은 카드에 길찾기 없음. 브랜드 채움은 예약·결과 보기 같은 주 행동에만 |
| T-8 | 무지개 상태 배지 · 뜻 없는 점 | [get-design-done SLOP-08](https://cdn.jsdelivr.net/npm/@hegemonart/get-design-done@1.60.4/reference/anti-patterns.md) · [Fountain #7](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui) | 상태색은 4역할만, 점은 실제 상태(켠 필터 있음)에만 |
| T-12 | 얇은 테두리 + 넓은 그림자 동시 | [Impeccable /slop](https://impeccable.style/slop) | 테두리와 그림자 중 하나 |
| — | 기본값 미감(분포 수렴) | [Anthropic 2025-11](https://www.claude.com/blog/improving-frontend-design-through-skills) · [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) | 크림·베이지도 이제 AI 기본값으로 꼽힌다 — 이 앱은 브랜드로 정했으니 **나머지 부품에서** 기본값을 걷는다 |

T-7(섹션마다 회색 설명) · T-9(균일 간격) · T-10(굵기 인플레) · T-11(빈 상태 공식)은 이 앱 화면에서 본 것으로, 아직 출처·실서비스 대조가 없다 — audit 회차에서 보강한다.

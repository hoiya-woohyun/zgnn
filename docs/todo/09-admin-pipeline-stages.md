# 9. 운영자 화면을 파이프라인 단계로 — 수집 · 검수 · 등록 ⇄ 해제, 가게 제외(기간), 재분석의 뜻

> 최종 수정: 2026-10-01 (v2: 🙋 1~3 을 닫고 사용자 2차 제안을 받았다 — **폐업은 영구 제외** · 둘째 탭 이름은 **`검수 대기`** · 사람이 고친 후보는 재분석에도 남기고
> 「함께 되돌리기」 체크(옛 T2.2)는 **버린다**(사람이 고친 것이 정답), 대신 **다시 읽은 글이 그 가게를 또 만들지 않는 규칙**(새 T2.2)을 더했다.
> 탭은 셋이 아니라 **넷** — `등록 해제` 탭을 따로 두고(D4), 3·4 탭의 장소는 **새 글로는 다시 후보가 되지 않되**(D6) **출처 글을 다시 읽히는 것은 된다**(D7, `place_sources`).
> 새 🙋 셋(출처 글 없는 장소 · 등록 해제 가게의 제외 만료 · 해제 탭에서 덮어쓰면 되살리나)이 남았다. 태스크는 여전히 전부 `[ ]`)
> 이전 (v1: 신설 — 사용자 제안 넷(수집 제외 버튼 · 3개월 뒤 자동 해제와 영구 제외 · 재분석 = 분석 데이터 초기화 · 세 단계 탭과 그에 맞는 버튼)을
> 코드와 대 보고 실행 계획으로 옮겼다. 결정 D1~D5 는 **제안 단계**다 — 🙋 셋이 닫히면 ADR-020 으로 옮기고 여기서는 링크만 남긴다)
> 상태: **계획만**. 태스크 전부 `[ ]`. 실행 규약은 [08](08-usability-and-process-plan.md) 의 것을 그대로 쓴다(한 태스크 = 한 커밋).

관련: [06](06-admin-review.md)(검수 화면의 지금 모습) · [features/admin-review.md](../features/admin-review.md)(화면 정본) ·
[data-pipeline 「수집 · 분석 · 승인」](../architecture/data-pipeline.md)(상태 머신·재분석 절차) · [ADR-018](../decisions/ADR-018-in-app-admin-review.md)(소프트 삭제 경계 — DELETE grant 없음) ·
[ADR-016](../decisions/ADR-016-secrets-by-login.md)(`pnpm data:*` 는 사용자 터미널, 스케줄러 없음).

## 요구 (사용자 말, 2026-10-01)

1. **수집 제외 버튼.** 수집된 것이 보이니 "수집에서 빼기" 가 먼저 있어야 한다.
2. 그 가게가 언젠가 반려동물을 받을 수 있으니 **3개월 뒤 자동으로 풀리는** 제외와, 잘못된 것이 계속 들어오니 **영구** 제외 둘 다.
3. 수집된 것으로 **다시 분석**. 다시 분석은 기존 분석 데이터를 초기화한다는 뜻이니 `analyze` 가 적용한 데이터를 **모두 없앤다**.
4. '확인할 장소' · '올린 장소' 대신 **수집 완료 · 분석 완료 · 등록 완료** 세 단계로 나누고, `/admin` 의 버튼도 그에 맞춘다.

2차(같은 날, 위 넷을 대 본 결과를 읽고):

5. 동반 불가 3개월은 그대로, **폐업은 영구**. 둘째 탭은 **`검수 대기`** 라고 해도 된다.
6. 재분석 때 사람이 고친 후보는 남긴다 — AI 가 낸 것을 사람이 다시 고쳤다면 **사람 쪽이 맞다**. 그 후보 옆에 AI 판단이 또 생기지 않게 **규칙을 더한다**.
7. **`등록 해제` 탭을 따로** 둔다 — 보이지 않게 한 것을 보이게. 탭 넷: `1 → 2 → 3` 흐름에 `3 ⇄ 4` 가 하나 더.
8. 3·4 탭에 있는 가게는 **1(수집)로 다시 들어오지 않는다.** 그런데 등록 완료 탭의 것도 **다시 분석하고 싶을 수는 있다.**

## 코드와 대 본 결과

방향은 넷 다 맞다. 다만 **둘은 자리가 다르고, 하나는 뜻을 좁혀야** 코드와 맞는다.

| 제안 | 지금 코드 | 판정 | 왜 |
|---|---|---|---|
| 1 수집 제외 | `data:collect` 는 **글 메타데이터만** 저장한다 — 제목·링크·키워드·날짜(`blog_posts`, `scripts/collect-blog.mjs:1-5`). 본문도 가게 이름도 없다. 가게는 **분석이 본문을 읽은 뒤에야** 생긴다 | 🔁 **자리를 옮긴다** — 가게 제외는 수집이 아니라 **분석 직후**에 걸어야 한다 | 수집 단계는 가게를 모른다. 그리고 지금 분석은 **반려한 가게를 전혀 참조하지 않는다** — `analyze-candidates.mjs:243` 이 읽는 것은 `pending` 뿐(`dupOf` 표시용). 반려한 가게를 쓴 새 글이 오면 **매번 다시 후보로 올라온다.** 이것이 사용자 직감이 가리킨 진짜 구멍이다 |
| 2 3개월 자동 해제 · 영구 | 스케줄러가 없다 — Actions 폐지, cron 없음([ADR-016](../decisions/ADR-016-secrets-by-login.md) v5) | ✅ 맞다, 구현은 **비교**로 | 「풀린다」 는 `until` 시각을 분석이 **읽는 순간에 비교**하면 된다. 지난 제외는 안 걸리고, 영구는 `until null`. 아무것도 돌릴 필요가 없다 |
| 3 재분석 = 전부 없앤다 | `adminReanalyze.ts` 는 그 글의 `pending` 후보를 `rejected + [admin] 재분석` 으로 눕히고 `analyzed_at` 을 비운다. `approved`·`merged`·사람이 고친 후보는 둔다 | ⚠️ **뜻을 좁힌다** — 「없앤다」 가 아니라 **「수집 완료로 되돌린다」** | 세 가지가 막는다. (a) `candidates` 에 DELETE grant 가 없다 — 소프트 삭제 경계([ADR-018](../decisions/ADR-018-in-app-admin-review.md) 결정 6~8)와 같은 선. (b) `approved`·`merged` 는 이미 `places` 에 **쓰여 사이트에 보이는** 것이라, 없애려면 장소를 내려야 하고 그것은 재빌드를 부른다 — 프롬프트를 고쳤다는 이유로 사용자 화면에서 가게가 사라지면 안 된다. 새 판단을 기존 장소에 넣는 길은 이미 `덮어쓰기` 다. (c) 사람이 고친 후보를 지우면 그 손질이 사라진다. 지금 동작은 **화면에서 보이는 것은 전부 사라지고 글은 다시 읽힌다** — 사용자가 바란 효과와 같다. 어긋난 것은 **문구**다("재분석" 이 "초기화" 처럼 읽힌다) |
| 4 세 단계 탭 | 탭 둘 — `candidates`('확인할 장소') · `places`('올린 장소') (`adminPage.tsx:94-97`). 글(`blog_posts`)은 화면에 없다 | ✅ 맞다, **단계마다 개체가 다르다** 는 것만 적어 둔다 | 수집 완료 = **글**(3,360건) · 분석 완료 = **후보**(검수 대기) · 등록 완료 = **장소**. 첫 칸은 장소 목록이 아니라 글 목록이다. 운영자가 읽을 권한은 이미 있다(`blog_posts` select, `20260922120000_narrow_grants.sql:64`) |

한 가지 더 — **버튼은 상태를 바꿀 뿐, 다음 단계를 돌리지는 못한다.** 수집·분석은 네이버 키와 `claude -p` 구독이 있는 **사용자 터미널**에서만 돈다(ADR-016).
그래서 각 칸은 "다음은 터미널에서 `pnpm data:analyze` — 지금 N건이 기다려요" 를 **말해 줘야** 한다. 버튼이 돌리는 것처럼 보이면 안 된다.

## 결정 (D1~D7 — 아래 🙋 가 닫히면 ADR-020)

**D1. 가게 제외는 분석 단계의 차단 목록이다 — `place_blocks`.** 수집은 가게를 모르니 거기 둘 수 없고, `candidates.rejected` 를 재활용하면
`[admin] 재분석` 으로 눕힌 행과 `중복` 반려까지 차단이 된다(재분석한 가게가 다시 안 올라온다). 제외는 **가게**에 대한 결정이고 후보는 그 가게의 글 하나다 — 개체가 다르니 표가 따로 있어야 한다.
키는 `name_key`(`normalizeName`, 후보의 `extracted.nameKey` 와 같은 함수) + 선택 `town`(주소의 읍·면). 이름만으로 막으면 체인·동명 가게(우도 카페살레 vs 본섬)가 같이 막힌다 —
`town` 이 있으면 둘 다 맞아야 걸리고, 후보 쪽 읍·면을 모르면 이름만으로 건다(모르는 것은 막는 쪽으로).

**D2. 만료는 스케줄러가 아니라 비교다.** `until timestamptz`(null = 영구). 분석이 실행마다 `until is null or until > now()` 인 행만 읽는다. 일찍 풀기는 `lifted_at` 을 찍는다(DELETE 없음 — 다른 표와 같은 경계).
기본 기간 **3개월**은 사용자 제안값이고 폼에서 바꿀 수 있다. 사유별 기본값은 아래 표(✅ 사용자 확정 — 폐업은 영구).

**D3. 재분석은 「수집 완료로 되돌리기」 다. 지우지 않는다.** 동작은 지금 `adminReanalyze.ts` 그대로 두고 **말을 사실대로** 바꾼다 — 무엇이 목록에서 빠지고(검수 대기 후보), 무엇이 남는지(등록한 장소 · 사람이 고친 후보), 다음에 누가 읽는지(터미널의 `data:analyze`).
단계 모델에서는 이 동작이 자연스럽다: **검수 대기 → 수집 완료** 로 한 칸 되돌리는 것이다.
**사람이 고친 후보(`[admin] 고침`)는 언제나 남긴다** — AI 판단을 사람이 다시 고쳤으면 사람 쪽이 정답이다(✅ 사용자, 체크로 고르게 하지 않는다).
그러면 구멍이 하나 생긴다: 글을 다시 읽으면 AI 가 **같은 가게의 후보를 또** 만들어, 사람이 고친 행 옆에 옛 판단 대신 새 AI 판단이 한 벌 붙는다.
그래서 **분석은 같은 글(`post_url`)·같은 가게(`nameKey`)의 사람이 고친 pending 후보가 있으면 그 가게를 만들지 않는다**(제외 이유 `edited`, 새 T2.2).
같은 가게라도 **다른 글**이면 만든다 — 그것은 새 근거이고 지금처럼 같은 묶음으로 붙는다.

**D4. 네 칸 = 세 개체.** 탭 `수집 완료 · 검수 대기 · 등록 완료 · 등록 해제`(✅ 사용자 — 둘째 칸은 '분석 완료' 가 아니라 사람 차례를 말하는 `검수 대기`).
흐름은 `1 → 2 → 3` 에 `3 ⇄ 4`(내리기 · 되살리기)가 붙는다. 3·4 는 같은 개체(`places`)를 `status` 로 가른 것이다 — 지금 '올린 장소' 칸의 `내림` 정렬·칩을 **탭으로 끌어올린다**.
`draft`(게시 대기)는 사이트에 안 보이지만 운영자가 등록한 것이라 3 에 칩으로 둔다.
각 칸의 동작은 아래 표. 낱말 교체(`올리기` → `등록` · `내리기` → `등록 해제`)는 27곳 + 테스트라 **맨 마지막 한 커밋**으로 묶는다.

**D5. 다음 단계는 터미널 명령이고 화면은 그것을 보여 준다.** 수집 칸 머리에 "미분석 N건 — 터미널에서 `pnpm data:analyze --limit 30`", 검수 칸의 재분석 결과 줄에 "수집 완료로 돌렸어요 — 터미널에서 `pnpm data:analyze`". 버튼으로 돌릴 수 있는 것처럼 그리지 않는다.

**D6. 3·4 탭의 가게는 새 글로 다시 후보가 되지 않는다.**
- 3(등록 완료, `published`) — 이미 그렇다. `skipAsExisting`(`scripts/analyze/analyzeCandidates.mjs:192`)이 `auto` 짝인 `published` 를 건너뛴다.
- 4(등록 해제, `archived`) — **지금은 후보가 된다.** 일부러 그렇게 만들었다(`analyzeCandidates.mjs:183`, 재개업을 아는 유일한 신호).
  그 신호를 버리지 않고 **기간으로 바꾼다**: 등록 해제할 때 고른 제외(D1·D2, `place_blocks.place_id`)가 열려 있는 동안은 건너뛰고,
  풀리면 새 글이 검수 대기에 **「등록 해제된 가게의 새 글」** 로 올라온다(처리 = 되살리기 + 덮어쓰기). 해제 사유별 기본값은 아래 표(🙋B).
- 대조 corpus 에서 `archived` 를 빼는 것이 **아니다** — 빼면 쌍둥이가 생긴다(CLAUDE.md 「조용히 깨지는 것들」). 짝은 그대로 잡고, 잡힌 뒤에 건너뛸지만 정한다.

**D7. 등록한 장소는 「출처 글을 다시 읽히는」 것으로 다시 분석한다.** 장소 ↔ 글은 이미 `place_sources`(`20260920124849_zgnn_schema.sql:90`)에 있다.
3·4 탭의 `다시 분석` = 그 장소의 출처 글을 미분석으로 되돌린다(1 탭에 나타난다). 다음 `data:analyze` 가 그 글을 읽으면 자기 장소와 짝이 잡히는데,
지금은 D6 의 건너뛰기에 걸려 버려진다 — 그래서 예외 하나: **글이 그 장소의 출처면 건너뛰지 않고 「갱신 제안」 으로 올린다**(`skipAsExisting` 에 출처 집합을 넘긴다).
출처가 아닌 새 글은 여전히 건너뛴다(D6). 갱신 제안은 검수 대기에서 지금의 `덮어쓰기` 로 반영한다 — **덮어쓰기 전까지 사이트의 장소는 그대로**이고, 사람이 고친 칸은 덮어쓰기 화면의 비교에서 고른다.
출처 글이 없는 장소(Notion 시드일 가능성이 크다 — 실측 전)는 다시 읽을 글이 없다(🙋A). 등록 해제 탭에서 덮어쓰면 되살아나는지는 🙋C.

### 단계 × 동작

| 칸 | 개체 | 보여 주는 것 | 버튼(한 줄) | 버튼(일괄) | 다음 단계로 가는 길 |
|---|---|---|---|---|---|
| **수집 완료** | `blog_posts` 글 | 제목 · 키워드 · 날짜 · 링크 · 상태 칩(미분석 / 분석됨 `promptVersion` / 분석 제외) · 머리에 건수 셋 | `분석 제외`(이 글은 읽지 않는다 — 광고·목록글) · `다시 읽기`(분석됨 → 미분석, = 재분석의 글 쪽) | 옛 `promptVersion` 글 골라 `다시 읽기` · `분석 제외` | 🧑 터미널 `pnpm data:analyze` |
| **검수 대기** | `candidates` pending(묶음) | 지금의 검수 카드 그대로 · **`갱신 제안`**(D7)·**`등록 해제된 가게의 새 글`**(D6) 표시 · 걸러 보기에 **`제외한 가게`** 칩(차단 목록 + 해제) | `등록`(=올리기) · 합치기 · 덮어쓰기 · 고치기 · **`제외`**(= 반려 + 다음 수집에서: 다시 보기 / 3개월 / 영구) · `재분석`(→ 수집 완료) | 등록 · 덮어쓰기 · 제외 · 재분석 | 버튼이 곧 `places` 쓰기(지금과 같다) |
| **등록 완료** | `places` `published`·`draft` | 지금의 '올린 장소' 중 게시중·게시 대기 | `등록 해제`(사유 + **다음 수집에서** 같은 선택, → 4) · **`다시 분석`**(출처 글 → 1, D7) | 다시 분석 | 재빌드(자동, `rebuild_log`) |
| **등록 해제** | `places` `archived` | 내린 날·사유·남은 제외 기간 | `되살리기`(→ 3, 열린 제외도 닫는다) · **`다시 분석`**(D7) · 제외 기간 바꾸기 | — | 재빌드(자동 — `published` 가 끼는 변경만) |

반려 사유 → 제외 기본값(폼에서 바꿀 수 있다, ✅ 사용자 확정):

| 사유 | 기본 | 왜 |
|---|---|---|
| 동반 불가 | **3개월** | 사용자 말 그대로 — 정책이 바뀔 수 있다 |
| 폐업 | **영구** | ✅ 사용자(v2). v1 은 재개업 신호를 살리려 3개월이었다 — 재개업은 드물고 폐업 글은 계속 들어온다. 재개업을 알게 되면 `제외한 가게` 에서 손으로 푼다 |
| 제주 아님 | **영구** | 바뀌지 않는 사실 |
| 홍보·협찬 · 목록글 | 다시 보기(차단 없음) | **글**의 문제라 가게 탓이 아니다. 블로그 단위 차단은 P2(T4.1) |
| 중복 | 다시 보기 | 막으면 "같은 가게" 신호(`ask` 짝)를 덮는다 — `skipAsExisting` 이 이미 `published` 짝은 걸러 준다 |
| 정보 부족 | 다시 보기 | 더 좋은 글이 오면 다시 봐야 한다 |

등록 해제 사유(`ARCHIVE_REASONS`, `src/lib/adminPlaces.ts:25`) → 제외 기본값(🙋B — 제안):

| 사유 | 기본 | 왜 |
|---|---|---|
| 폐업 | **영구** | 반려와 같은 말 |
| 동반 불가로 바뀜 | **3개월** | 반려의 `동반 불가` 와 같은 말 — 다시 바뀔 수 있다 |
| 중복 | **영구** | 짝이 되는 장소가 3 에 따로 있다. 이 행으로 짝이 잡히면 후보가 그쪽이 아니라 내린 쪽에 붙는다 |
| 업장 요청 | **영구** | 업장이 빼 달라고 했다 — 새 글로 되살아나면 안 된다 |
| 정보가 틀림 | 다시 보기 | 더 맞는 글이 오면 그것이 고칠 기회다 — 바로 검수 대기에 「등록 해제된 가게의 새 글」 로 |
| 기타 | 3개월 | 모르는 것은 막되 영영 막지는 않는다 |

## 실행 규약

[08 의 「실행 규약」·「금지 규칙」](08-usability-and-process-plan.md#실행-규약-먼저-읽는다) 을 그대로 따른다. 이 계획에 더해지는 것 둘:

- **마이그레이션은 파일만 만든다.** 원격 적용(`supabase db push`)은 🧑 — CLI 는 로그인 상태가 필요하고 에이전트가 할 수 없다(ADR-016). 적용 전엔 그 표를 읽는 화면 코드가 **빈 결과를 정상으로** 다뤄야 한다(표가 없으면 PostgREST 는 404 — 그때 칸을 숨기고 머리글에 "마이그레이션 미적용" 한 줄).
- **`pnpm data:analyze` 는 부르지 않는다.** 스크립트 변경은 `scripts/analyze/*.test.mjs` 의 순수 함수 테스트로만 검증한다. 실측은 🧑.

## 순서 한눈에

| 단계 | 태스크 | 성격 | 크기 |
|---|---|---|---|
| **P0 — 반려한 가게가 다시 올라오는 구멍** | T1.1 ~ T1.5 | 마이그레이션 · 스크립트 · 화면 | S~M |
| **P0 — 재분석이 말하는 것** | T2.1 ~ T2.2 | 문구 · 분석 규칙 하나 | S |
| P1 — 네 칸 탭 | T3.1 ~ T3.4 | 화면 · 마이그레이션 하나 | M |
| P1 — 등록한 장소 다시 분석 | T5.1 ~ T5.3 | 분석 규칙 · 화면 | S~M |
| P2 — 나중에 | T4.x | 설계 필요 | — |
| 🧑 사람 손 | H.x | 적용 · 결정 · 실측 | — |

P0 두 줄은 독립이다. 권장: T2.1(문구, 가장 싸고 지금 혼동의 원인) → T2.2 → T1.1 → T1.2 → T1.3 → T3.1 → T1.4(4 탭이 있어야 자리가 맞다) → T5 → 나머지.

---

## P0 — 반려한 가게가 다시 올라오는 구멍 (차단 목록)

### [ ] T1.1 마이그레이션 `place_blocks` — 파일만

- 근거: 위 표 1행. 분석은 `rejected` 를 읽지 않는다(`scripts/analyze-candidates.mjs:243` 은 `pending` 만).
- 읽을 것: `supabase/migrations/20260922120000_narrow_grants.sql`(GRANT·정책 패턴) · `20260929120000_places_archive.sql`(트리거로 시각 찍는 패턴) · D1·D2.
- 단계:
  1. `supabase/migrations/20261001120000_place_blocks.sql`:
     ```sql
     create table public.place_blocks (
       id            uuid primary key default gen_random_uuid(),
       name_key      text not null,                 -- normalizeName(이름). candidates.extracted.nameKey 와 같은 함수
       town          text,                          -- 읍·면(있으면 둘 다 맞아야 걸린다). null = 이름만
       display_name  text not null,                 -- 화면용 원 이름
       reason        text not null,                 -- REJECT_REASONS 또는 ARCHIVE_REASONS 의 값
       note          text,
       until         timestamptz,                   -- null = 영구
       lifted_at     timestamptz,                   -- 일찍 푼 시각(DELETE 없음)
       candidate_id  uuid references candidates (id),
       place_id      text references places (id),
       created_at    timestamptz not null default now()
     );
     create index place_blocks_name_key_idx on public.place_blocks (name_key);
     alter table public.place_blocks enable row level security;
     grant select, insert, update on table public.place_blocks to authenticated;   -- delete 없음
     create policy operators_select on public.place_blocks for select to authenticated using ((select is_operator()));
     create policy operators_insert on public.place_blocks for insert to authenticated with check ((select is_operator()));
     create policy operators_update on public.place_blocks for update to authenticated using ((select is_operator())) with check ((select is_operator()));
     ```
     머리 주석에 D1·D2 의 이유(왜 `rejected` 재활용이 아닌가 · 왜 스케줄러가 없나)를 적는다.
  2. `docs/architecture/data-pipeline.md` 「스키마 요약」 에 한 줄.
- 수용 기준: 파일이 `supabase/migrations/` 규칙(타임스탬프 접두)대로 있고, `anon` 에 어떤 grant 도 없다(`grep anon` 결과 0).
- 문서: data-pipeline 「스키마 요약」 · 이 태스크.
- 커밋: `feat(db) - 가게 차단 목록 place_blocks 마이그레이션 — 분석이 반려한 가게를 다시 올리지 않게`

### [ ] T1.2 분석이 차단 목록을 읽는다

- 근거: 추출 직후 `exclusionReason`(`analyze-candidates.mjs:424`)이 세 이유를 거르는데 사람의 결정은 거기 없다.
- 선행: T1.1 (파일만 있어도 된다 — 표가 없으면 조회 실패를 "차단 0건" 으로 다루고 경고 한 줄).
- 읽을 것: `scripts/analyze-candidates.mjs:236-262`(pending 미리 읽기 패턴) · `:420-432`(제외 분기) · `scripts/analyze/analyzeCandidates.mjs:110-126`(`exclusionReason`) · `:300-321`(요약 줄).
- 단계:
  1. `scripts/analyze/analyzeCandidates.mjs` 에 순수 함수 `isBlocked(extracted, blocks, now)` — `name_key` 같고 (`town` 이 null 이거나 후보 읍·면과 같거나 후보 읍·면을 모름) 이고 `lifted_at` null 이고 (`until` null 이거나 `> now`). 후보 읍·면은 `inferRegionRaw` 가 쓰는 주소 토큰과 같은 함수로 뽑는다.
  2. `analyze-candidates.mjs` 가 실행 시작에 `place_blocks` 를 읽어(`select('name_key, town, until, lifted_at')`, pending 읽기 옆) `isBlocked` 를 `exclusionReason` **다음**에 건다. 걸리면 `excluded.push({ extracted, reason: 'blocked' })`, `stats.excluded.blocked += 1`, 로그 `  제외 <이름> · 차단(~YYYY-MM-DD 또는 영구)`.
  3. 요약 줄(`:312`)에 `· 차단 N`. `toPostAnalysis` 는 그대로 — `excluded[].reason` 에 `'blocked'` 가 실린다.
  4. 테스트 `scripts/analyze/analyzeCandidates.test.mjs`: 이름만 · 읍·면 둘 다 · 읍·면 모름 · 만료 지남 · `lifted_at` · 영구 — 여섯.
- 수용 기준: `pnpm test` 통과 · `--dry-run` 코드 경로에서도 차단 조회가 돈다(쓰기가 아니다) · 표가 없을 때 실행이 멈추지 않는다(경고 한 줄).
- 문서: data-pipeline 「수집 · 분석 · 승인」 에 "제외 넷째 이유 `blocked`" 한 줄 · `docs/todo/03` 머리말 한 줄.
- 커밋: `feat(analyze) - 차단 목록에 걸린 가게는 후보를 만들지 않는다(기간·영구, 읍·면까지 맞춰)`

### [ ] T1.3 반려 폼에 「다음 수집에서」 — 다시 보기 / 3개월 제외 / 영구 제외

- 근거: 요구 1·2. 반려는 이미 사유 칩이 있다(`src/lib/adminCandidates.ts:314-327`) — 제외는 그 폼의 **둘째 줄**이다. 버튼 이름은 `제외` 로 바꾸되 사유 칩 값(`REJECT_REASONS`)은 `reviewer_note` 에 적히므로 바꾸지 않는다.
- 선행: T1.1.
- 읽을 것: `src/screens/adminPageRejectForm.tsx` · `src/lib/adminApply.ts`(`rejectGroup`·`appendReviewerNote`) · `src/lib/adminBulk.ts`(일괄 반려) · 위 「반려 사유 → 제외 기본값」 표.
- 단계:
  1. `src/lib/adminBlocks.ts`(새 파일, 순수 + 쓰기): `BLOCK_CHOICES = ['none', 'months3', 'forever']`, `defaultBlockFor(reason)`(위 표), `blockRowFor(group, choice, reason, note, now)` → `place_blocks` insert 행(`name_key` 는 `extracted.nameKey ?? normalizeName(name)`, `town` 은 `regionOptionsFor(address).town`), `insertBlock(client, row)`. 테스트 `adminBlocks.test.ts`.
  2. `adminPageRejectForm.tsx`: 사유 칩 밑에 세그먼트 `다시 보기 · 3개월 제외 · 영구 제외`, 사유를 고르면 기본값이 따라 바뀐다(사람이 바꾼 뒤엔 안 따라감). 제출 버튼 라벨은 선택을 싣는다 — `제외(3개월)`.
  3. `rejectGroup` 뒤에 `choice !== 'none'` 이면 `insertBlock`. **순서는 반려 먼저, 차단 나중**(차단만 들어가고 반려가 안 되면 화면엔 남는데 분석엔 안 올라오는 상태 — 다시 누르면 이어진다). 일괄도 같은 함수.
  4. `reviewer_note` 에 `[admin] 제외 3개월` / `[admin] 제외 영구` 한 줄 덧붙인다 — 반려 집계 칩과 다른 문자열.
  5. 결정 줄의 `반려` 라벨 → `제외`(`adminPageGroupActions.tsx:156-166` 부근, `adminPageBulkBar.tsx:35-39`). 도움말(`adminPage.tsx:108` 부근 `HELP`)에 한 줄.
- 수용 기준: 테스트 통과 · 반려만 고르면(`none`) `place_blocks` 에 아무것도 안 들어간다 · 사유 `제주 아님` 을 고르면 기본이 `영구` 로 바뀐다(테스트).
- 문서: `features/admin-review.md` 「반려」 절을 「제외」 로(머리말 vN) · `06` 의 D 절에 낱말 메모.
- 커밋: `feat(admin) - 반려가 '제외' 가 된다 — 다음 수집에서 다시 보기·3개월·영구를 고른다`

### [ ] T1.4 등록 해제 폼에도 같은 선택 — 열린 제외가 있는 동안 새 글을 건너뛴다

- 근거: D6. 등록한 가게를 내리면 그 가게를 쓴 새 글이 `archived` 짝으로 다시 올라온다(재개업 신호 — [data-pipeline v14](../architecture/data-pipeline.md)). 사용자 요구 8 은 "4 탭의 것은 다시 들어오지 않는다" — 신호는 버리지 않고 **기간**으로 바꾼다.
- 선행: T1.2 · T1.3 · 🙋B.
- 읽을 것: `src/lib/adminPlaces.ts:25`(`ARCHIVE_REASONS`) · `:247-262`(`archivePlace`) · `src/screens/adminPagePlaceRow.tsx` 의 사유 폼 · `scripts/analyze/analyzeCandidates.mjs:175-194`(`skipAsExisting` 과 그 위 주석) · 위 「등록 해제 사유 → 제외 기본값」 표.
- 단계:
  1. T1.3 의 세그먼트를 등록 해제 폼에 재사용(`place_id` 를 채운다, `candidate_id` null), 사유를 고르면 위 표의 기본값. `archivePlace` 뒤에 `insertBlock`.
  2. 분석: 짝이 `archived` 이고 그 `place_id` 의 열린 제외가 있으면 건너뛴다(`skipAsExisting(matched, { blockedPlaceIds })`, 로그 `건너뜀 <이름> · 등록 해제(~YYYY-MM-DD 또는 영구)`). 열린 제외가 없으면 지금처럼 후보로 — 화면은 그 후보를 **`등록 해제된 가게의 새 글`** 로 표시한다(이미 있는 `archived` 짝 표시를 이 말로).
  3. 테스트: `archived` + 열린 제외 → 건너뜀 · `archived` + 만료 → 후보 · `published` → 지금처럼 건너뜀.
- 수용 기준: 되살리기(`restorePlace`)가 그 가게의 열린 차단을 `lifted_at` 으로 닫는다(테스트) — 되살렸는데 차단이 남으면 조용히 어긋난다 · 대조 corpus 에서 `archived` 를 빼지 않았다(`analyze-candidates.mjs:228` 주석 그대로).
- 문서: `features/admin-review.md` 「올린 장소를 내린다」 → 「등록 해제」 에 한 줄 · data-pipeline 의 `archived` 짝 설명(v14)에 "열린 제외가 있으면 건너뜀".
- 커밋: `feat(admin) - 등록 해제할 때도 '다음 수집에서' 를 고른다 — 제외가 열린 동안 새 글은 건너뛰고, 되살리면 풀린다`

### [ ] T1.5 제외한 가게 보기 · 일찍 풀기

- 근거: D2 — 만료는 비교라 **목록이 없으면 무엇이 막혀 있는지 아무도 모른다.** 3개월짜리가 영구로 보이지 않게 남은 기간을 적는다.
- 선행: T1.3.
- 읽을 것: `src/screens/adminPage.tsx` 걸러 보기 칩(`:165` 부근 `tier` 필터) · `src/lib/adminBlocks.ts`.
- 단계:
  1. `fetchBlocks(client)`(열린 것만: `lifted_at is null` — 만료 지난 것도 **보인다**, 칩에 `지남`) · `liftBlock(client, id)`(`lifted_at = now()`).
  2. 검수 대기 칸의 걸러 보기에 `제외한 가게 N` 칩 → 표(이름 · 읍·면 · 사유 · 남은 기간 또는 영구 · 어디서(후보/장소) · `풀기`). 표가 404 면 칩을 숨기고 머리글에 "마이그레이션 미적용".
- 수용 기준: `풀기` 뒤 다음 조회에서 빠진다 · 만료 지난 행이 `지남` 으로 보인다(테스트는 표기 함수).
- 문서: `features/admin-review.md` 새 절 「제외한 가게」.
- 커밋: `feat(admin) - 제외한 가게 목록과 '풀기' — 무엇이 언제까지 막혀 있는지 보인다`

## P0 — 재분석이 말하는 것

### [ ] T2.1 재분석 확인 문장·도움말을 사실대로

- 근거: 위 표 3행. 동작은 맞고 말이 "초기화" 로 읽힌다. 운영자가 그렇게 믿고 누르면 "등록한 장소가 왜 남아 있나" 가 다음 질문이 된다.
- 읽을 것: `src/lib/adminReanalyze.ts:52-56`(`reanalyzeSummary`) · `src/screens/adminPage.tsx:108`(`HELP` 의 재분석 줄) · `:634`(결과 줄) · `adminPageGroupActions.tsx:111-125`(확인 상자) · `adminReanalyze.test.ts`.
- 단계:
  1. `reanalyzeSummary` → 네 문장: "글 N건을 **수집 완료로** 되돌려요. 그 글에서 나온 검수 대기 후보 M건(다른 줄 포함)은 목록에서 빠져요 — DB 에는 '재분석' 표시로 남아요. 이미 등록한 장소와 사람이 고친 후보 K건은 그대로예요. 다음 `pnpm data:analyze` 가 다시 읽어요."
  2. `HELP` 줄 · 결과 줄 · 확인 상자 제목(`재분석할까요?` → `수집 완료로 되돌릴까요?`)을 같은 말로.
  3. 테스트 단정 갱신.
- 수용 기준: 문장에 `지워요`·`없애요`·`초기화` 가 없다(`grep`).
- 문서: `features/admin-review.md` 「재분석」 첫 줄에 "지우지 않는다 — 수집 완료로 되돌린다" · `data-pipeline` 「재분석」 머리 한 줄.
- 커밋: `fix(admin) - 재분석 문구를 사실대로 — 지우는 게 아니라 수집 완료로 되돌린다`

### [ ] T2.2 다시 읽은 글은 사람이 고친 가게를 또 만들지 않는다

- 근거: D3 · 요구 6. 재분석은 사람이 고친 후보를 남기는데(`adminReanalyze.ts` 규칙 3), 그 글을 다시 읽으면 같은 가게의 새 AI 후보가 그 옆에 생긴다 — 사람이 정답이라고 한 것과 AI 판단이 한 묶음에 두 벌.
  (v1 의 「함께 되돌리기」 체크는 버렸다 — ✅ 사용자: 사람이 고친 것이 맞다.)
- 읽을 것: `scripts/analyze-candidates.mjs:236-262`(pending 미리 읽기 — `reviewer_note` 도 함께 고른다) · `:420-432`(제외 분기) · `src/lib/adminApply.ts` 의 `EDITED_NOTE` · `scripts/analyze/analyzeCandidates.mjs`(`exclusionReason`).
- 단계:
  1. 순수 함수 `editedKeysFor(pendingRows)` → `Set<post_url + '\u0000' + nameKey>` — `reviewer_note` 에 `[admin] 고침` 이 있는 pending 행만. 머리표 문자열은 `EDITED_NOTE` 와 같은 값을 스크립트 쪽 상수로 두고 테스트로 둘이 같은지 묶는다(TS ↔ mjs 를 import 로 잇지 못한다).
  2. 글 하나의 추출 결과마다 `editedKeys.has(post.url + '\u0000' + extracted.nameKey)` 면 `excluded.push({ extracted, reason: 'edited' })`, 로그 `  제외 <이름> · 사람이 고친 후보가 있음`, 요약 줄에 `· 고침 유지 N`.
  3. 테스트: 같은 글·같은 가게 → 제외 · 같은 가게·다른 글 → 만든다 · 고침 표시 없는 pending → 만든다(그건 재분석이 이미 눕혔어야 할 행).
- 수용 기준: `pnpm test` 통과 · 재분석 확인 문장(T2.1)의 "사람이 고친 후보 K건은 그대로예요" 뒤에 "다시 읽어도 그 가게는 새로 만들지 않아요" 가 붙는다.
- 문서: data-pipeline 「재분석」 에 한 줄 · 제외 이유 `edited`.
- 커밋: `feat(analyze) - 다시 읽은 글은 사람이 고친 가게를 새로 만들지 않는다`

## P1 — 네 칸 탭

### [ ] T3.1 탭 넷과 건수 — 수집 완료 · 검수 대기 · 등록 완료 · 등록 해제

- 근거: 요구 4·7 · D4·D5.
- 읽을 것: `src/screens/adminPage.tsx:90-100`(`TABS`) · `:979-990`(탭별 제목·설명) · `src/lib/adminCandidates.ts:165`(`fetchPendingCandidates`) · `src/lib/adminPlaces.ts:52`(`fetchManagedPlaces`) · `:67-80`(`내림` 을 위로 올리는 정렬 — 탭으로 가르면 필요 없어진다).
- 단계:
  1. `TTab = 'posts' | 'candidates' | 'places' | 'archived'`, 라벨 `수집 완료 · 검수 대기 · 등록 완료 · 등록 해제`. 기본 탭은 **검수 대기**(매일 하는 일).
  2. `src/lib/adminPosts.ts`(새): `countPosts(client)` → `{ total, unanalyzed, excluded }` — `select('url', { count: 'exact', head: true })` 셋(3,360행을 내려받지 않는다).
  3. `fetchManagedPlaces` 는 한 번만 부르고 `status` 로 3·4 에 나눈다(조회 둘로 쪼개지 않는다). 등록 해제 칸의 정렬은 `archived_at` 최신순.
  4. 설명 줄 — 수집: `전체 N · 미분석 M · 제외 K — 터미널에서 pnpm data:analyze` · 검수: `N곳` · 등록 완료: `게시 N · 게시 대기 M` · 등록 해제: `N곳 — 사이트에 안 보여요`.
  5. 수집 칸 본문은 이 태스크에서 **건수와 명령만**(목록은 T3.2).
- 수용 기준: 탭 전환에 데이터 재조회가 없다(이미 든 것을 쓴다) · 비운영자(RLS 빈 결과)에게 건수가 0 이 아니라 "권한 없음" 으로 보인다(`adminPage.tsx:64` 의 갈래 유지) · 되살리기 한 번에 행이 4 → 3 으로 옮겨 보인다.
- 문서: `features/admin-review.md` 「화면 구조」 표를 네 칸으로(머리말 vN).
- 커밋: `feat(admin) - 탭을 수집 완료·검수 대기·등록 완료·등록 해제 넷으로 — 머리에 건수와 다음 명령`

### [ ] T3.2 수집 완료 칸 — 글 목록 · 글 단위 분석 제외

- 근거: 요구 1 의 **글 쪽** 절반. 광고·목록 글은 가게가 아니라 글이 문제라 가게 차단(T1)으로는 못 막는다. 3,360건이라 페이지가 필요하다.
- 선행: T3.1.
- 읽을 것: `scripts/analyze-candidates.mjs:219-221`(글 고르는 조건 — 여기에 `.is('excluded_at', null)` 한 줄이 붙는다) · `src/lib/adminPosts.ts`.
- 단계:
  1. 마이그레이션 `20261001121000_blog_posts_exclude.sql`: `alter table blog_posts add column excluded_at timestamptz, add column exclude_note text;` + 인덱스. 파일만(🧑 적용).
  2. `analyze-candidates.mjs:221` 옆에 `.is('excluded_at', null)`. 컬럼이 없으면(미적용) PostgREST 가 에러를 주므로 **그때는 조건 없이 다시 조회**하고 경고 한 줄 — 미적용 상태에서 분석이 멈추면 안 된다.
  3. `fetchPosts(client, { filter: 'unanalyzed' | 'analyzed' | 'excluded', page })` — `order('posted_at', desc)`, `range()` 50건. 행: 제목(링크) · 키워드 · 날짜 · 상태 칩(미분석 / `promptVersion` 앞 8자 / 제외).
  4. 한 줄 버튼 `분석 제외`(사유 한 줄 → `excluded_at = now()`), `다시 읽기`(분석됨 → `analyzed_at = null`; 그 글의 pending 후보 눕히기는 **`adminReanalyze.prepareReanalyze` 를 그대로 부른다** — 글 쪽에서도 규칙 1·4 가 같다). 제외 해제는 `excluded_at = null`.
  5. 일괄: 체크한 글에 `분석 제외` · `다시 읽기`.
- 수용 기준: 미분석 필터의 건수가 T3.1 의 `unanalyzed` 와 같다 · `다시 읽기` 가 형제 후보까지 눕힌다(`reanalyzePlan` 테스트가 이미 있다 — 재사용 확인만).
- 문서: `features/admin-review.md` 새 절 「수집 완료 칸」 · `data-pipeline` 「재분석」 에 "글 쪽 버튼" 한 줄.
- 커밋: `feat(admin) - 수집 완료 칸 — 글 목록·분석 제외·다시 읽기`

### [ ] T3.3 옛 프롬프트로 분석된 글 고르기

- 근거: [data-pipeline 「재분석」 0단계](../architecture/data-pipeline.md) 가 "지금 `PROMPT_VERSION` 과 다른 글이 대상" 이라 하는데 그 비교를 할 자리가 화면에 없다. 브라우저는 `scripts/analyze/extractPlaces.mjs` 의 상수를 못 읽는다(sha256 이 빌드 시점 값이 아니다) — **분포로 보여 준다**: 분석된 글의 `analysis->>'promptVersion'` 별 건수 칩, 가장 최근 `analyzed_at` 의 버전을 `최신` 으로 표시.
- 선행: T3.2.
- 단계: `fetchPromptVersions(client)` — `select('analysis->promptVersion, analyzed_at')` 를 `range` 로 나눠 받아 클라이언트에서 센다(≤ 3,360행, 두 칸만). 칩을 누르면 그 버전 글만 필터 → 일괄 `다시 읽기`.
- 수용 기준: 칩 합이 `analyzed` 건수와 같다.
- 커밋: `feat(admin) - 수집 완료 칸에 프롬프트 버전 분포 — 옛 버전 글을 골라 다시 읽힌다`

### [ ] T3.4 낱말 — `올리기` → `등록`, `내리기` → `등록 해제`, `확인할 장소`·`올린 장소` → 탭 이름

- 근거: D4. 27곳 남짓(`src/screens/adminPage*.tsx`·`src/lib/admin*.ts`) + 테스트 단정. **맨 마지막 한 커밋** — 앞 태스크들이 라벨 문자열을 단정하는 테스트를 건드리므로 중간에 하면 두 번 고친다.
- 읽을 것: `grep -rn "올리기\|올린 장소\|확인할 장소\|내리기\|내림" src/screens/adminPage*.tsx src/lib/admin*.ts`.
- 단계: 문자열만. `reviewer_note`·`places` 기록 줄에 적히는 값(`[admin] 승인` · `[admin YYYY-MM-DD] 내림` 등)은 **바꾸지 않는다**(이미 적힌 행이 안 걸린다 — `adminApply.ts:168-171` 의 같은 이유). `PLACE_STATUS_LABEL.archived`(`내림`)는 화면 문자열이라 바꾼다.
- 수용 기준: `grep -rn "올리기\|올린 장소\|확인할 장소" src/ | grep -v base/` 가 0 · 테스트 통과.
- 문서: `features/admin-review.md` 머리말에 낱말 교체 한 줄 · `06` D 절.
- 커밋: `style(admin) - 올리기 → 등록, 내리기 → 등록 해제, 탭 이름으로 낱말을 맞춘다`

## P1 — 등록한 장소 다시 분석 (D7)

### [ ] T5.1 분석이 출처 글의 짝을 건너뛰지 않는다 — 「갱신 제안」

- 근거: D7 · 요구 8. 출처 글을 다시 읽혀도 짝이 `published` 면 `skipAsExisting` 이 버린다 — 버튼(T5.2)만 만들면 **아무 일도 안 일어난다**(조용히 깨진다).
- 선행: T1.4(같은 함수에 `blockedPlaceIds` 를 넘기는 자리).
- 읽을 것: `scripts/analyze/analyzeCandidates.mjs:175-194` · `scripts/analyze-candidates.mjs:224-262`(기존 장소·pending 미리 읽기) · `supabase/migrations/20260920124849_zgnn_schema.sql:88-93`(`place_sources`) · `scripts/apply-approved.mjs`·`src/lib/adminApply.ts` 의 `place_sources` 쓰기(덮어쓰기가 출처를 더하는지).
- 단계:
  1. 실행 시작에 `place_sources` 를 읽어 `Map<post_url, Set<place_id>>`(운영자 select 권한 있음 — `20260922120000_narrow_grants.sql:74`).
  2. `skipAsExisting(matched, { blockedPlaceIds, sourcesOfPost })` — 짝의 `id` 가 이 글의 출처 집합에 있으면 **건너뛰지 않는다**. 후보 행 `extracted.match.refresh = true`(화면 표시용 한 칸).
  3. 테스트: 출처 글 + `published` 짝 → 후보 · 출처 아님 + `published` → 건너뜀 · 출처 글 + `archived` + 열린 제외 → 후보(일부러 다시 읽힌 것이 제외보다 우선).
- 수용 기준: `pnpm test` 통과 · 요약 줄에 `· 갱신 제안 N`.
- 문서: data-pipeline 「재분석」 에 "등록한 장소의 출처 글" 절.
- 커밋: `feat(analyze) - 등록한 장소의 출처 글을 다시 읽으면 건너뛰지 않고 갱신 제안으로 올린다`

### [ ] T5.2 등록 완료·등록 해제 칸의 `다시 분석`

- 근거: D7. 글 쪽 되돌리기는 이미 있다(`adminReanalyze.prepareReanalyze` — 규칙 1·4).
- 선행: T5.1 · T3.1 · 🙋A.
- 단계:
  1. `src/lib/adminPlaces.ts` 에 `fetchPlaceSources(client, placeIds)` → 장소별 출처 글 url.
  2. 행 버튼 `다시 분석` — 출처 글이 0이면 끄고 `다시 읽을 글이 없어요`(🙋A). 확인 문장: "출처 글 N건을 수집 완료로 되돌려요. 사이트의 장소는 그대로이고, 다음 `pnpm data:analyze` 뒤 검수 대기에 갱신 제안으로 올라와요."
  3. 일괄(등록 완료 칸) — 체크한 장소들의 출처 글 합집합.
- 수용 기준: 장소 상태(`status`)를 건드리지 않는다(테스트 — 재빌드가 불리지 않는다) · 그 글의 pending 형제 후보는 `prepareReanalyze` 가 눕힌다.
- 문서: `features/admin-review.md` 「등록한 장소를 다시 분석」 새 절.
- 커밋: `feat(admin) - 등록한 장소를 다시 분석 — 출처 글을 수집 완료로 되돌린다`

### [ ] T5.3 검수 대기의 「갱신 제안」 · 「등록 해제된 가게의 새 글」 표시

- 근거: D6·D7 — 같은 `덮어쓰기` 버튼이지만 운영자가 읽는 뜻이 다르다(새 가게가 아니라 **지금 보이는 장소를 바꾸는** 일).
- 선행: T5.1 · 🙋C.
- 단계: 묶음 카드 머리에 칩 — `갱신 제안`(`match.refresh`) · `등록 해제된 가게의 새 글`(짝이 `archived`, 출처 아님). 갱신 제안의 기본 동작은 `덮어쓰기`, 등록 해제 짝은 🙋C 에 따라 `되살리기 + 덮어쓰기` 또는 `덮어쓰기`.
- 커밋: `feat(admin) - 검수 대기에 '갱신 제안' 과 '등록 해제된 가게의 새 글' 을 따로 표시한다`

## P2 — 나중에 (설계 필요)

- **T4.1 블로그 단위 차단.** 자사 홍보 블로그 하나가 13건(README v18 실측). `blog_posts.blog_id` 로 `place_blocks` 와 같은 꼴의 `blog_blocks`, 또는 `place_blocks.kind`. 수집 칸에서 글 하나를 보며 "이 블로그 전부". 수집(`collect-blog.mjs`)이 아니라 **분석이 건너뛴다**(수집은 저수지, 싸다).
- **T4.2 좌표로 차단 대조.** 읍·면이 없는 시내 가게는 이름만으로 걸린다. 후보 좌표가 있으면 300m 안을 같은 가게로 — `matchPlace` 의 거리 규칙을 재사용.
- **T4.3 `데이터 흐름` 머리글.** 네 칸 위에 `수집 N → 검수 M → 등록 K ⇄ 해제 J` 한 줄과 마지막 실행 시각(`max(fetched_at)`·`max(analyzed_at)`·`rebuild_log`).

## 🧑 사람 손

| # | 무엇 | 언제 |
|---|---|---|
| H.1 | `supabase db push`(T1.1 · T3.2 의 마이그레이션 2개) — 로그인 필요 | T1.1 파일 커밋 뒤 |
| H.2 | 🙋 A~C 결정 | T1.4 · T5.2 · T5.3 전 |
| H.3 | 첫 실측 — 반려한 가게 하나를 `3개월 제외` 하고 `pnpm data:analyze --dry-run --limit 5` 로그에 `차단 1` 이 찍히는지 | T1.3 뒤 |
| H.4 | 출처 글 없는 장소 수 실측 — `place_sources` 에 행이 없는 `places` 를 센다(🙋A 의 근거, `supabase db query --linked`) | T5.2 전 |
| H.5 | 등록한 장소 하나를 `다시 분석` → `pnpm data:analyze --dry-run --limit 5` 로그에 `갱신 제안 1` | T5.2 뒤 |

## 🙋 닫힌 질문 (v2, 2026-10-01 사용자)

1. 사유별 제외 기본값 — 동반 불가 3개월 ✅ · **폐업 영구**(v1 제안 3개월을 바꿨다).
2. 둘째 탭 이름 — **`검수 대기`**.
3. 재분석 때 사람이 고친 후보 — **언제나 남긴다**, 체크 없음. 대신 다시 읽은 글이 그 가게를 또 만들지 않는 규칙(T2.2).

## 🙋 열린 질문 (사용자가 정한다)

- **A. 출처 글이 없는 장소** — Notion 시드는 `place_sources` 가 없을 가능성이 크다(H.4 로 실측). `다시 분석` 을 끄고 `다시 읽을 글이 없어요` 로 둘지. 계획은 그렇다.
- **B. 등록 해제한 가게의 제외 기간** — 위 「등록 해제 사유 → 제외 기본값」 표가 맞나. 핵심은 "등록 해제 탭의 가게도 기간이 지나면 새 글로 검수 대기에 올라온다" 를 받아들이는지(D6). 아니면 4 탭은 **언제나** 건너뛰고, 다시 보려면 `다시 분석`(D7)만.
- **C. 등록 해제 탭에서 다시 분석한 결과를 덮어쓰면** — 장소는 등록 해제 그대로 두고 내용만 바꿀지(계획), 함께 되살릴지. 계획은 그대로 둔다 — 사이트로 내보내는 일은 `되살리기` 한 버튼만 한다.

## 문서 — 태스크가 끝나면 어디가 바뀌나

| 문서 | 바뀌는 절 | 태스크 |
|---|---|---|
| `features/admin-review.md` | 화면 구조(네 칸) · 「제외」(← 반려) · 「제외한 가게」 · 「수집 완료 칸」 · 「재분석」 첫 줄 · 「등록 해제」(← 내린다) · 「등록한 장소를 다시 분석」 | T1.3 · T1.4 · T1.5 · T2.1 · T3.1 · T3.2 · T5.2 |
| `architecture/data-pipeline.md` | 스키마 요약 · 제외 이유 `blocked`·`edited` · `archived` 짝(열린 제외면 건너뜀) · 「재분석」 머리 · 출처 글 갱신 제안 | T1.1 · T1.2 · T1.4 · T2.1 · T2.2 · T5.1 |
| `decisions/ADR-020-*.md` | **🙋 A~C 닫힌 뒤** D1~D7 을 옮긴다. 그전엔 만들지 않는다 | H.2 뒤 |
| `todo/06` | D 절(낱말) · 머리말 | T1.3 · T3.4 |
| `todo/README.md` | 문서 목록 9행 · 머리말 | 이 커밋 |

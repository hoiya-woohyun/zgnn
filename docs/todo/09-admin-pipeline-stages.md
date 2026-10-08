# 9. 운영자 화면을 파이프라인 단계로 — 수집 · 검수 · 등록 ⇄ 해제 · 블랙리스트, 재분석의 뜻

> 최종 수정: 2026-10-02 (v4: **D6·D7 을 [11](11-continuous-review-and-update-proposals.md) 의 차이 게이트(U1)로 좁히고 흡수했다** — "등록 완료는 새 글로 후보가 되지 않는다" 는 **"같은 말을 하는 새 글로는"** 이 됐고(11 T1.1, `kindOf`),
> D7 의 출처 특례는 필요 없어졌다(출처 글을 다시 읽혀도 사이트와 다른 말을 할 때만 후보다 — 같으면 할 일이 없는 것이 맞다). T5.1 의 출처 특례 부분은 **11 T1.1 로 대체**, T5.3 의 `갱신 제안` 칩은 11 T1.2 의 `갱신` 칩이다.
> T5.1 에서 **살아 있는 것은 하나** — 일부러 다시 읽힌 출처 글은 블랙리스트보다 우선한다(T5.2 와 같이 간다))
> 이전 2026-10-01 (v3: 🙋 A~C 를 닫았다 — **A 끈다**(출처 글 없으면 `다시 읽을 글이 없어요`) · **B 등록 해제와 블랙리스트를 두 개념으로 가른다**(✅ 사용자: 해제는 장소의 상태, 블랙리스트는 가게 이름의 수집 차단 — 서로 독립, 다섯째 탭 `블랙리스트`) ·
> **C 유지**(해제 탭에서 덮어쓰면 내용만, 사이트로 내보내는 길은 `되살리기` 하나). v2 를 코드와 다시 대 봐 **고친 것 넷**(「v2 점검」 절): 사람이 이름을 고치면 `nameKey` 가 바뀌어 T2.2 가 빗나간다 ·
> `중복` 해제를 블랙리스트에 넣으면 살아 있는 쌍둥이의 새 글까지 막는다 · 이름 축과 `place_id` 축이 겹친다 · `덮어쓰기` 는 `place_sources` 를 안 쓴다. 그리고 **UX 감사**(화면 11파일)에서 나온 25건 중 15건을 T6.x 로 넣었다 — P0 셋은 "운영자가 틀리게 누르는" 자리다)
> 이전 (v2: 🙋 1~3 을 닫고 사용자 2차 제안을 받았다 — **폐업은 영구 제외** · 둘째 탭 이름은 **`검수 대기`** · 사람이 고친 후보는 재분석에도 남기고
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

3차(같은 날, 🙋 A~C 에 답하며):

9. **B 는 등록 해제와 블랙리스트 개념으로 정리한다.** 등록 해제는 장소를 사이트에서 감추는 **상태**이고, 블랙리스트는 그 가게 이름을 수집에서 막는 **결정**이다 — 하나가 다른 하나를 뜻하지 않는다.
10. **C 는 유지.** 등록 해제 탭에서 다시 분석한 결과를 덮어써도 내용만 바뀌고 해제 상태는 그대로다.

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

**D4. 다섯 칸 = 네 개체.** 탭 `수집 완료 · 검수 대기 · 등록 완료 · 등록 해제 · 블랙리스트`(✅ 사용자 — 둘째 칸은 '분석 완료' 가 아니라 사람 차례를 말하는 `검수 대기`, 다섯째는 v3 의 B).
흐름은 `1 → 2 → 3` 에 `3 ⇄ 4`(등록 해제 · 되살리기)가 붙고, `블랙리스트` 는 흐름 밖의 **가로 목록**이다 — 2(제외)·3·4(등록 해제)에서 들어오고, 분석(`data:analyze`)이 읽는다.
탭 라벨에 **건수**를 싣는다(`검수 대기 21 · 등록 해제 4`) — "어디에 일이 있나" 가 탭 줄에서 읽혀야 한다(UX 감사). 3·4 는 같은 개체(`places`)를 `status` 로 가른 것이다 — 지금 '올린 장소' 칸의 `내림` 정렬·칩을 **탭으로 끌어올린다**.
`draft`(게시 대기)는 사이트에 안 보이지만 운영자가 등록한 것이라 3 에 칩으로 둔다.
각 칸의 동작은 아래 표. 낱말 교체(`올리기` → `등록` · `내리기` → `등록 해제` · 같은 동작의 다른 이름 `승인`·`반영`·`게시` 도)는 27곳 + 테스트라 **맨 마지막 한 커밋**으로 묶는다.

**D5. 다음 단계는 터미널 명령이고 화면은 그것을 보여 준다.** 수집 칸 머리에 "미분석 N건 — 터미널에서 `pnpm data:analyze --limit 30`", 검수 칸의 재분석 결과 줄에 "수집 완료로 돌렸어요 — 터미널에서 `pnpm data:analyze`". 버튼으로 돌릴 수 있는 것처럼 그리지 않는다.

**D6. 등록 해제와 블랙리스트는 서로 독립이다**(✅ 사용자 v3 = 🙋B 닫힘).
- **등록 해제**(`places.status='archived'`)는 장소의 **상태**다 — 사이트에서 감춘다, 되살리면 돌아온다. 그 이상의 뜻을 싣지 않는다.
- **블랙리스트**(`place_blocks`)는 가게 **이름**에 대한 결정이다 — 분석이 그 이름의 후보를 만들지 않는다(기간 또는 영구). 등록된 적 없는 가게(제외한 후보)도, 등록 해제한 가게도 같은 표에 선다.
- 그래서 등록 해제 탭의 가게가 새 글로 검수 대기에 올라오는지는 **블랙리스트에 있는지만** 본다. 없거나 만료되면 올라온다 — 그 후보는 **「등록 해제된 가게의 새 글」** 로 표시되고(재개업 신호, 지금의 `archivedTarget` 경로), 처리는 `덮어쓰기(내용만)` 또는 `되살려서 덮어쓰기`(지금의 '되살려서 합치기').
  등록 해제할 때 폼의 「블랙리스트에」 선택(없음 / 3개월 / 영구)이 그 결정을 **같은 자리에서** 받는다 — 기본값은 아래 표. 운영자가 "다시 들어오지 않게" 를 원하면 영구를 고른다(요구 8).
- 3(등록 완료)은 이미 새 글로 후보가 되지 않는다(`skipAsExisting`, `scripts/analyze/analyzeCandidates.mjs:192`). 블랙리스트와 무관하다.
  > v4: 이 줄은 **"같은 말을 하는 새 글로는"** 이다 — 다른 사실을 말하는 글은 `갱신`·`보강` 후보다([11](11-continuous-review-and-update-proposals.md) U1, 차이 게이트 `kindOf`). 확인 날짜(`verified_at`)보다 옛 글·목록글·동반 근거 없는 글도 후보가 아니다.
- 대조 corpus 에서 `archived` 를 빼는 것이 **아니다** — 빼면 쌍둥이가 생긴다(CLAUDE.md 「조용히 깨지는 것들」). 짝은 그대로 잡는다.
- 블랙리스트는 **이름 축 하나**로 건다(D1 의 `name_key`+`town`). 등록 해제 때 만든 행도 `name_key` 를 갖고 있어 같은 길에서 걸린다 — `place_id` 는 **되살릴 때 풀 행을 찾는 열쇠**이고 분석의 둘째 판정 축이 아니다(v2 의 `skipAsExisting(matched, { blockedPlaceIds })` 는 뺐다 — 두 축이 겹쳐 어느 쪽이 막았는지 로그가 둘로 갈린다).

> v4: D7 의 "출처면 건너뛰지 않는다" 특례는 [11](11-continuous-review-and-update-proposals.md) U1 에 흡수됐다 — 출처 글이든 아니든 **사이트와 다른 말을 하면** 갱신 후보다. 아래 문단은 버튼(`다시 분석`)과 블랙리스트 우선 규칙으로만 읽는다.

**D7. 등록한 장소는 「출처 글을 다시 읽히는」 것으로 다시 분석한다.** 장소 ↔ 글은 이미 `place_sources`(`20260920124849_zgnn_schema.sql:90`)에 있다.
3·4 탭의 `다시 분석` = 그 장소의 출처 글을 미분석으로 되돌린다(1 탭에 나타난다). 다음 `data:analyze` 가 그 글을 읽으면 자기 장소와 짝이 잡히는데,
지금은 D6 의 건너뛰기에 걸려 버려진다 — 그래서 예외 하나: **글이 그 장소의 출처면 건너뛰지 않고 「갱신 제안」 으로 올린다**(`skipAsExisting` 에 출처 집합을 넘긴다).
출처가 아닌 새 글은 여전히 건너뛴다(D6). 갱신 제안은 검수 대기에서 지금의 `덮어쓰기` 로 반영한다 — **덮어쓰기 전까지 사이트의 장소는 그대로**이고, 사람이 고친 칸은 덮어쓰기 화면의 비교에서 고른다.
출처 글이 없는 장소(Notion 시드일 가능성이 크다 — H.4 로 실측)는 `다시 분석` 을 **끄고** `다시 읽을 글이 없어요` 라고 적는다(✅ 🙋A). 그 장소를 새 글로 갱신하는 길은 ADR-019 결정 7 의 **업체명 재검색**(제안)이 열리면 그때 생긴다 — 이 계획 밖.
등록 해제 탭에서 갱신 제안을 덮어쓰면 **내용만** 바뀌고 상태는 `archived` 그대로다(✅ 🙋C) — 사이트로 내보내는 일은 `되살리기` 한 버튼만 한다. `archived` 행의 update 는 재빌드 트리거가 안 부르므로(`published` 가 끼는 변경만) 비용도 없다.
**`덮어쓰기` 는 `place_sources` 도 upsert 한다**(v3 — 지금은 `adminApply.ts:204` 의 등록 경로만 쓴다). 안 쓰면 갱신에 쓴 글이 다음 `다시 분석` 의 출처가 아니다.

### 단계 × 동작

| 칸 | 개체 | 보여 주는 것 | 버튼(한 줄) | 버튼(일괄) | 다음 단계로 가는 길 |
|---|---|---|---|---|---|
| **수집 완료** | `blog_posts` 글 | 제목 · 키워드 · 날짜 · 링크 · 상태 칩(미분석 / 분석됨 `promptVersion` / 분석 제외) · 머리에 건수 셋 | `분석 제외`(이 글은 읽지 않는다 — 광고·목록글) · `다시 읽기`(분석됨 → 미분석, = 재분석의 글 쪽) | 옛 `promptVersion` 글 골라 `다시 읽기` · `분석 제외` | 🧑 터미널 `pnpm data:analyze` |
| **검수 대기** | `candidates` pending(묶음) | 지금의 검수 카드 그대로 · **`갱신 제안`**(D7)·**`등록 해제된 가게의 새 글`**(D6) 표시 · 접힌 줄에 **블로그 인용 한 줄**(T6.7) | `등록`(=올리기) · 합치기 · 덮어쓰기 · 고치기 · **`제외`**(= 반려 + 블랙리스트에: 없음 / 3개월 / 영구) · `재분석`(→ 수집 완료) | 등록 · 덮어쓰기 · 제외 · 재분석 | 버튼이 곧 `places` 쓰기(지금과 같다) |
| **등록 완료** | `places` `published`·`draft` | 지금의 '올린 장소' 중 게시중·게시 대기 | `등록 해제`(사유 + **블랙리스트에** 같은 선택, → 4) · **`다시 분석`**(출처 글 → 1, D7 — 출처 없으면 꺼짐) | 다시 분석 | 재빌드(자동, `rebuild_log`) |
| **등록 해제** | `places` `archived` | 해제한 날·사유·**블랙리스트 칩**(없음 / ~날짜 / 영구) | `되살리기(게시중으로)`(→ 3, 한 줄 확인, 열린 블랙리스트도 닫는다) · **`다시 분석`**(D7) · `블랙리스트에` 넣기/바꾸기 | — | 재빌드(자동 — `published` 가 끼는 변경만) |
| **블랙리스트** | `place_blocks` | 이름 · 읍·면 · 사유 · 남은 기간 또는 영구 · 어디서(후보 / 장소) · 만료 지난 것은 `지남` | `풀기`(`lifted_at`) · 기간 바꾸기 | — | 분석이 실행마다 읽는다(D2) |

반려 사유 → 블랙리스트 기본값(폼에서 바꿀 수 있다, ✅ 사용자 확정):

| 사유 | 기본 | 왜 |
|---|---|---|
| 동반 불가 | **3개월** | 사용자 말 그대로 — 정책이 바뀔 수 있다 |
| 폐업 | **영구** | ✅ 사용자(v2). v1 은 재개업 신호를 살리려 3개월이었다 — 재개업은 드물고 폐업 글은 계속 들어온다. 재개업을 알게 되면 `제외한 가게` 에서 손으로 푼다 |
| 제주 아님 | **영구** | 바뀌지 않는 사실 |
| 홍보·협찬 · 목록글 | 없음 | **글**의 문제라 가게 탓이 아니다. 블로그 단위 차단은 P2(T4.1) |
| 중복 | 없음 | 막으면 "같은 가게" 신호(`ask` 짝)를 덮는다 — `skipAsExisting` 이 이미 `published` 짝은 걸러 준다 |
| 정보 부족 | 없음 | 더 좋은 글이 오면 다시 봐야 한다 |

등록 해제 사유(`ARCHIVE_REASONS`, `src/lib/adminPlaces.ts:26`) → 블랙리스트 기본값(v3 — 🙋B 를 "두 개념" 으로 닫으며 둘을 고쳤다):

| 사유 | 기본 | 왜 |
|---|---|---|
| 폐업 | **영구** | 반려와 같은 말 |
| 동반 불가로 바뀜 | **3개월** | 반려의 `동반 불가` 와 같은 말 — 다시 바뀔 수 있다 |
| 업장 요청 | **영구** | 업장이 빼 달라고 했다 — 새 글로 되살아나면 안 된다 |
| 중복 | **없음** | v2 는 영구였다 — **틀렸다.** 블랙리스트는 이름 축이라 살아 있는 쌍둥이(3 탭)의 새 글까지 막는다. 쌍둥이는 `skipAsExisting` 이 걸러 주고, 해제한 행은 동점 규칙(`matchPlace.mjs:178`)이 뒤로 보낸다 — 더 할 일이 없다 |
| 정보가 틀림 | 없음 | 더 맞는 글이 오면 그것이 고칠 기회다 — 바로 검수 대기에 「등록 해제된 가게의 새 글」 로 |
| 기타 | 없음 | v2 는 3개월이었다 — 두 개념을 가른 뒤엔 "모르는 사유" 가 수집 결정을 대신 내리면 안 된다. 운영자가 고른다 |

## 실행 규약

[08 의 「실행 규약」·「금지 규칙」](08-usability-and-process-plan.md#실행-규약-먼저-읽는다) 을 그대로 따른다. 이 계획에 더해지는 것 둘:

- **마이그레이션은 파일만 만든다.** 원격 적용(`supabase db push`)은 🧑 — CLI 는 로그인 상태가 필요하고 에이전트가 할 수 없다(ADR-016). 적용 전엔 그 표를 읽는 화면 코드가 **빈 결과를 정상으로** 다뤄야 한다(표가 없으면 PostgREST 는 404 — 그때 칸을 숨기고 머리글에 "마이그레이션 미적용" 한 줄).
- **마이그레이션 미적용 상태가 탭 하나만 비울 수 있다**(`place_blocks` 없음 → 블랙리스트 탭, `blog_posts.excluded_at` 없음 → 수집 탭의 제외). 그 탭 라벨 옆에 `미적용` 을 달아 "0건" 과 가른다.
- **`pnpm data:analyze` 는 부르지 않는다.** 스크립트 변경은 `scripts/analyze/*.test.mjs` 의 순수 함수 테스트로만 검증한다. 실측은 🧑.

## 순서 한눈에

| 단계 | 태스크 | 성격 | 크기 |
|---|---|---|---|
| **P0 — 반려한 가게가 다시 올라오는 구멍** | T1.1 ~ T1.5 | 마이그레이션 · 스크립트 · 화면 | S~M |
| **P0 — 재분석이 말하는 것** | T2.1 ~ T2.2 | 문구 · 분석 규칙 하나 | S |
| P1 — 다섯 칸 탭 | T3.1 ~ T3.4 | 화면 · 마이그레이션 하나 | M |
| P1 — 등록한 장소 다시 분석 | T5.1 ~ T5.3 | 분석 규칙 · 화면 | S~M |
| **P0 — 운영자가 틀리게 누르는 자리(UX)** | T6.1 ~ T6.3 | 화면 | S |
| P1 — 운영자를 느리게 하는 자리(UX) | T6.4 ~ T6.9 | 화면 · 순수 함수 | S~M |
| P2 — 다듬기(UX) | T6.10 ~ | 화면 | S |
| P2 — 나중에 | T4.x | 설계 필요 | — |
| 🧑 사람 손 | H.x | 적용 · 결정 · 실측 | — |

P0 세 줄은 독립이다. 권장: T2.1(문구·색, 가장 싸고 지금 혼동의 원인) → T6.1~T6.3(틀리게 누르는 자리, 재디자인 전에 닫는다) → T2.2 → T1.1 → T1.2 → T1.3 → T3.1 → T1.4·T1.5(탭이 있어야 자리가 맞다) → T5 → T6.4~ → T3.4(낱말, 맨 마지막).

---

## P0 — 반려한 가게가 다시 올라오는 구멍 (차단 목록)

### [x] T1.1 마이그레이션 `place_blocks` — 파일만

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
- > 메모: 마이그레이션은 파일만(원격 미적용 — H.1). 09 의 「문서」 표대로 `decisions/ADR-020-pipeline-stages-and-blocklist.md` 초안(D1~D7)을 같은 커밋에 넣었다. 단계 밖이지만 ADR 을 새로 만들면 목록이 따라가야 해 `docs/ARCHITECTURE.md` ADR 표 한 줄 · `CLAUDE.md` 의 "ADR 19편" → "20편" 을 함께 고쳤다. 마이그레이션 머리 주석에 `anon` 낱말이 걸리지 않게(수용 기준 `grep anon` 0) "비로그인(공개) 역할" 로 적었다.

### [x] T1.2 분석이 차단 목록을 읽는다

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
- > 메모: `isBlocked` 는 `blockFor`(걸린 행을 돌려준다) 위의 얇은 래퍼 — 로그의 `차단(~날짜|영구)` 에 그 행의 `until` 이 필요해서. 후보 읍·면은 `extractAddressUnits(address).eupMyeon`(→ 없으면 `townOf(regionRaw)`)이고 비교 시점은 정확한 `now` 가 아니라 실행 시작 시각(`runStartedAt`). `· 차단 N` 은 제외 합계 괄호 안(0 이면 사라짐, `alreadyHave` 와 같은 어법). 조회 실패는 `console.warn` 한 줄 뒤 계속. 이 환경에서 `data:analyze` 는 안 돌렸다 — 순수 함수 테스트 7개(여섯 + 요약)만.

### [x] T1.3 반려 폼에 「블랙리스트에」 — 없음 / 3개월 / 영구

- 근거: 요구 1·2. 반려는 이미 사유 칩이 있다(`src/lib/adminCandidates.ts:314-327`) — 제외는 그 폼의 **둘째 줄**이다. 버튼 이름은 `제외` 로 바꾸되 사유 칩 값(`REJECT_REASONS`)은 `reviewer_note` 에 적히므로 바꾸지 않는다.
- 선행: T1.1.
- 읽을 것: `src/screens/adminPageRejectForm.tsx` · `src/lib/adminApply.ts`(`rejectGroup`·`appendReviewerNote`) · `src/lib/adminBulk.ts`(일괄 반려) · 위 「반려 사유 → 제외 기본값」 표.
- 단계:
  1. `src/lib/adminBlocks.ts`(새 파일, 순수 + 쓰기): `BLOCK_CHOICES = ['none', 'months3', 'forever']`, `defaultBlockFor(reason)`(위 표 — 반려 사유와 등록 해제 사유 둘 다 받는다), `blockRowFor(group, choice, reason, note, now)` → `place_blocks` insert 행(`name_key` 는 `extracted.nameKey ?? normalizeName(name)`, `town` 은 `regionOptionsFor(address).town`), `insertBlock(client, row)`. 테스트 `adminBlocks.test.ts`.
  2. `adminPageRejectForm.tsx`: 사유 칩 밑에 세그먼트 `블랙리스트에: 없음 · 3개월 · 영구`, 사유를 고르면 기본값이 따라 바뀐다(사람이 바꾼 뒤엔 안 따라감). 제출 버튼 라벨은 선택을 싣는다 — `제외 · 블랙리스트 3개월`.
     **클릭 수는 지금과 같아야 한다**(사유 칩 → 바로 제출) — 세그먼트가 한 번 더 누르게 하면 운영자가 제외를 피하고 등록으로 흐른다(UX 감사). 고른 사유 칩은 핑크 채움이 아니라 `secondary`+테두리(T6.9 와 같은 꼴).
  3. `rejectGroup` 뒤에 `choice !== 'none'` 이면 `insertBlock`. **순서는 반려 먼저, 차단 나중**(차단만 들어가고 반려가 안 되면 화면엔 남는데 분석엔 안 올라오는 상태 — 다시 누르면 이어진다). 일괄도 같은 함수.
  4. `reviewer_note` 에 `[admin] 블랙리스트 3개월` / `[admin] 블랙리스트 영구` 한 줄 덧붙인다 — 반려 집계 칩과 다른 문자열.
  5. 결정 줄의 `반려` 라벨 → `제외`(`adminPageGroupActions.tsx:156-166` 부근, `adminPageBulkBar.tsx:35-39`). 도움말(`adminPage.tsx:108` 부근 `HELP`)에 한 줄.
- 수용 기준: 테스트 통과 · 반려만 고르면(`none`) `place_blocks` 에 아무것도 안 들어간다 · 사유 `제주 아님` 을 고르면 기본이 `영구` 로 바뀐다(테스트).
- 문서: `features/admin-review.md` 「반려」 절을 「제외」 로(머리말 vN) · `06` 의 D 절에 낱말 메모.
- 커밋: `feat(admin) - 반려가 '제외' 가 된다 — 블랙리스트에 없음·3개월·영구를 같은 자리에서 고른다`
- > 메모: `rejectGroup` 은 그대로 두고 쓴 줄(`reviewer_note` 에 덧붙인 문자열)만 돌려주게 했다 — 새 `rejectAndBlock`(`adminBlocks.ts`)이 반려 → 차단 → 기록 한 줄 순으로 부른다. 기록 한 줄(`[admin] 블랙리스트 …`)은 차단이 **들어간 뒤에만** 붙인다(실패했는데 DB 메모만 남는 것을 막으려고, 이 쓰기가 실패해도 결과는 안 뒤집는다). 차단 행의 읍·면은 본문의 `regionOptionsFor(address).town` 이 아니라 **분석 `blockFor` 와 같은 규칙**(`extractAddressUnits(address).eupMyeon ?? townOf(regionRaw)`)으로 뽑는다 — 다르게 뽑으면 걸어 둔 차단이 다음 후보에 안 걸린다. 표가 없으면(`PGRST205`) 던지지 않고 `제외했어요 · 사유 — 블랙리스트에는 안 들어갔어요(블랙리스트 표가 아직 적용되지 않았어요)` 로 말한다. 선택 칩의 테두리 꼴은 T6.9 의 `AdminFilterChip` 이 생기기 전이라 `ring-brand` 임시 클래스. `HELP` 에 제외 한 줄, `summarizeBulkReject` 에 `blockFailed` 인자. 반려 사유 칩 값·`reviewer_note` 머리표는 그대로.

### [x] T1.4 등록 해제 폼에도 「블랙리스트에」 — 되살리면 풀린다

- 근거: D6(v3). 등록 해제한 가게를 쓴 새 글은 지금 `archived` 짝 후보로 올라온다(재개업 신호 — [data-pipeline v14](../architecture/data-pipeline.md)). 그것을 막을지는 **블랙리스트가** 정하고, 해제 폼이 그 결정을 같은 자리에서 받는다.
- 선행: T1.2 · T1.3 · T3.1(등록 해제 탭이 있어야 블랙리스트 칩이 설 자리가 있다).
- 읽을 것: `src/lib/adminPlaces.ts:26`(`ARCHIVE_REASONS`) · `:247-262`(`archivePlace`·`restorePlace`) · `src/screens/adminPagePlaceRow.tsx` 의 사유 폼(`:438-439` 의 `useState` — 취소해도 남는다, T6.8) · 위 「등록 해제 사유 → 블랙리스트 기본값」 표.
- 단계:
  1. 해제 폼을 `AdminPageRejectForm` 처럼 컴포넌트로 빼고(언마운트로 비워진다) T1.3 의 세그먼트를 재사용 — `place_id` 를 채운다, `candidate_id` null. `archivePlace` 뒤에 `insertBlock`(순서: 해제 먼저, 블랙리스트 나중).
  2. `restorePlace` 뒤에 그 `place_id` 의 열린 블랙리스트를 `lifted_at` 으로 닫는다 — 되살렸는데 블랙리스트가 남으면 새 글이 조용히 안 올라온다.
  3. **분석 쪽 변경은 없다** — 해제 때 만든 행도 `name_key` 를 가져 T1.2 의 이름 축에서 걸린다(v2 의 `blockedPlaceIds` 축은 뺐다, D6). 걸리면 로그는 T1.2 의 `차단` 한 줄이고, 걸리지 않으면 지금처럼 `archived` 짝 후보 → 화면이 **`등록 해제된 가게의 새 글`** 로 표시(T5.3).
  4. 등록 해제 탭의 행에 블랙리스트 칩(없음 / ~YYYY-MM-DD / 영구)과 `블랙리스트에` 넣기/바꾸기 버튼.
- 수용 기준: 해제 + 영구 → 다음 분석에서 그 이름이 `차단` 으로 제외(T1.2 테스트의 fixture 로) · 되살리기 뒤 그 가게의 열린 블랙리스트가 0건(테스트) · 대조 corpus 에서 `archived` 를 빼지 않았다(`analyze-candidates.mjs:228` 주석 그대로).
- 문서: `features/admin-review.md` 「올린 장소를 내린다」 → 「등록 해제」 에 블랙리스트 한 줄 · data-pipeline 의 `archived` 짝 설명(v14)에 "블랙리스트에 있으면 이름 축에서 먼저 걸린다".
- 커밋: `feat(admin) - 등록 해제할 때 블랙리스트 기간을 같은 자리에서 고른다 — 되살리면 풀린다`
- > 메모: 폼은 `adminPagePlaceArchiveForm.tsx`(T6.8 이 같이 닫혔다). 쓰기는 `adminBlocks.ts` 의 `archiveAndBlock`·`restoreAndLift`·`setPlaceBlock` — 읍·면은 `placeBlockRowFor` 가 후보와 같은 규칙(`extractAddressUnits(address).eupMyeon ?? townOf(region_raw)`). 칩은 장소마다 가장 늦게 풀리는 열린 행 하나(`latestBlockByPlace`, 영구가 이긴다). 등록 해제 칸의 `블랙리스트` 는 고르는 즉시 쓴다(열린 것을 풀고 새로 건다, `none` 은 풀기만). 해제 폼은 사유를 미리 고른 채 열 수 있다(`archiveReason`) — 10 T1.4 의 폐업 제보가 그 길로 연다.

### [x] T1.5 블랙리스트 탭 — 보기 · 풀기 · 기간 바꾸기

> 메모(2026-10-07): 읽기는 `fetchBlocks` 하나 — 탭 건수(`blocksSummaryOf`)·등록 해제 칩(`placeBlocksOf`)·목록이 그 결과에서 파생해 `풀기`(`liftBlock`)·`기간 바꾸기`(`extendBlock`) 뒤 같은 틱에 움직인다(옛 `fetchBlockCounts`·`fetchPlaceBlocks` 는 지웠다). 화면은 `adminPageBlocksPanel.tsx` + 줄 `adminPageBlocksRow.tsx`, 열은 `ADMIN_BLOCK_TRACKS`. 장소 링크는 탭만 바꾼다(그 칸의 검색·페이지는 그대로라 줄이 화면 밖일 수 있다). 링크는 등록 해제 칩 쪽만 — 제외 결과 줄은 몇 초 뒤 사라져 붙이지 않았다. '권한 없음' 은 페이지의 운영자 확인이 맡는다(RLS 는 빈 배열). 화면은 로그인 뒤라 못 봤다.

- 근거: D2·D6 — 만료는 비교라 **목록이 없으면 무엇이 막혀 있는지 아무도 모른다.** 등록된 적 없는 가게(제외한 후보)도 서는 표라 등록 해제 탭 안에 둘 수 없다 — 다섯째 탭(✅ 사용자 "블랙리스트 개념").
- 선행: T1.3 · T3.1.
- 읽을 것: `src/lib/adminBlocks.ts` · `src/screens/adminPagePlaceList.tsx`(표 꼴 재사용).
- 단계:
  1. `fetchBlocks(client)`(`lifted_at is null` — 만료 지난 것도 **보인다**, 칩 `지남`) · `liftBlock(client, id)`(`lifted_at = now()`) · `extendBlock(client, id, until)`.
  2. 탭 `블랙리스트 N`(N = 열린 것 중 만료 안 지난 수). 표: 이름 · 읍·면 · 사유 · 남은 기간 또는 영구 · 어디서(후보 / 장소 — 장소면 3·4 탭의 행으로 링크) · `풀기` · `기간 바꾸기`. 표가 404 면 탭 라벨 옆 `미적용`.
  3. 검수 대기의 제외 결과 줄과 등록 해제 탭의 칩에서 이 탭으로 오는 링크.
- 수용 기준: `풀기` 뒤 탭 건수가 같은 틱에 준다 · 만료 지난 행이 `지남` 으로 보인다(표기 함수 테스트) · 비운영자에게는 "권한 없음".
- 문서: `features/admin-review.md` 새 절 「블랙리스트」.
- 커밋: `feat(admin) - 블랙리스트 탭 — 무엇이 언제까지 막혀 있는지 보이고, 풀고, 기간을 바꾼다`

## P0 — 재분석이 말하는 것

### [x] T2.1 재분석 확인 문장·도움말을 사실대로

- 근거: 위 표 3행. 동작은 맞고 말이 "초기화" 로 읽힌다. 운영자가 그렇게 믿고 누르면 "등록한 장소가 왜 남아 있나" 가 다음 질문이 된다.
- 읽을 것: `src/lib/adminReanalyze.ts:52-56`(`reanalyzeSummary`) · `src/screens/adminPage.tsx:108`(`HELP` 의 재분석 줄) · `:634`(결과 줄) · `adminPageGroupActions.tsx:111-125`(확인 상자) · `adminReanalyze.test.ts`.
- 단계:
  1. `reanalyzeSummary` → 네 문장: "글 N건을 **수집 완료로** 되돌려요. 그 글에서 나온 검수 대기 후보 M건(다른 줄 포함)은 목록에서 빠져요 — DB 에는 '재분석' 표시로 남아요. 이미 등록한 장소와 사람이 고친 후보 K건은 그대로예요. 다음 `pnpm data:analyze` 가 다시 읽어요."
  2. `HELP` 줄 · 결과 줄(`adminPage.tsx:634`) · 확인 상자 제목(`재분석할까요?` → `수집 완료로 되돌릴까요?`)을 같은 말로. **내부 낱말 `눕히다` 가 화면에 나오는 세 곳**(`adminPage.tsx:634` · `adminPageGroupActions.tsx:118` · `adminPageBulkBar.tsx:131`)도 — 코드 주석의 말이다.
  3. **색** — 확인 버튼이 `primary-destructive`(빨강, `adminPageGroupActions.tsx:122` · `adminPageBulkBar.tsx:35` `destructive: true`)다. 문구가 "되돌려요" 라 해도 색이 "지운다" 고 말한다 → `secondary`(상태를 되돌리는 동작, 사이트에 아무 일 없음).
  4. 테스트 단정 갱신.
- 수용 기준: 문장에 `지워요`·`없애요`·`초기화`·`눕` 이 없다(`grep`, `src/screens/adminPage*.tsx`) · 재분석 버튼에 `destructive` 가 없다.
- 문서: `features/admin-review.md` 「재분석」 첫 줄에 "지우지 않는다 — 수집 완료로 되돌린다" · `data-pipeline` 「재분석」 머리 한 줄.
- 커밋: `fix(admin) - 재분석 문구와 색을 사실대로 — 지우는 게 아니라 수집 완료로 되돌린다`
- > 메모: 문장의 "사람이 고친 후보 K건" 은 K=0 이면 "이미 등록한 장소는" 만 적는다(0건 문구가 어색해서). 일괄 확인 버튼은 `destructive` 필드는 두고(전부 false) 재분석만 `secondary` 로 칠한다.

### [x] T2.2 다시 읽은 글은 사람이 고친 가게를 또 만들지 않는다

- 근거: D3 · 요구 6. 재분석은 사람이 고친 후보를 남기는데(`adminReanalyze.ts` 규칙 3), 그 글을 다시 읽으면 같은 가게의 새 AI 후보가 그 옆에 생긴다 — 사람이 정답이라고 한 것과 AI 판단이 한 묶음에 두 벌.
  (v1 의 「함께 되돌리기」 체크는 버렸다 — ✅ 사용자: 사람이 고친 것이 맞다.)
- 읽을 것: `scripts/analyze-candidates.mjs:236-262`(pending 미리 읽기 — `reviewer_note` 도 함께 고른다) · `:420-432`(제외 분기) · `src/lib/adminApply.ts` 의 `EDITED_NOTE` · `scripts/analyze/analyzeCandidates.mjs`(`exclusionReason`).
- 단계:
  1. 순수 함수 `editedKeysFor(pendingRows)` → `Set<post_url + '\u0000' + nameKey>` — `reviewer_note` 에 `[admin] 고침` 이 있는 pending 행만. 머리표 문자열은 `EDITED_NOTE` 와 같은 값을 스크립트 쪽 상수로 두고 테스트로 둘이 같은지 묶는다(TS ↔ mjs 를 import 로 잇지 못한다).
     **⚠️ v3 — 고친 행의 `nameKey` 는 고친 이름으로 다시 계산된다**(`src/lib/adminEdit.ts:351`, 짝을 다시 잡으려고 일부러). 운영자가 이름을 고쳤으면 다시 읽은 AI 는 **원래 이름**을 내므로 키가 어긋나 복제본이 생긴다.
     그래서 `saveEdit` 이 `extracted.editedFrom = { nameKey }`(고치기 전 키, 처음 한 번만) 를 남기고, `editedKeysFor` 는 **지금 키와 원래 키 둘 다** 집합에 넣는다. 이미 고친 행(`editedFrom` 없음)은 지금 키만 — 그 구멍은 "이름을 고친 뒤 재분석" 한 번에만 열리고, 복제본은 검수 대기에서 `중복` 으로 보인다.
  2. 글 하나의 추출 결과마다 `editedKeys.has(post.url + '\u0000' + extracted.nameKey)` 면 `excluded.push({ extracted, reason: 'edited' })`, 로그 `  제외 <이름> · 사람이 고친 후보가 있음`, 요약 줄에 `· 고침 유지 N`.
  3. 테스트: 같은 글·같은 가게 → 제외 · 같은 가게·다른 글 → 만든다 · 고침 표시 없는 pending → 만든다(그건 재분석이 이미 치웠어야 할 행) · **이름을 고친 행(`editedFrom.nameKey`)과 원래 이름의 추출 → 제외**.
- 수용 기준: `pnpm test` 통과 · 재분석 확인 문장(T2.1)의 "사람이 고친 후보 K건은 그대로예요" 뒤에 "다시 읽어도 그 가게는 새로 만들지 않아요" 가 붙는다.
- 문서: data-pipeline 「재분석」 에 한 줄 · 제외 이유 `edited`.
- 커밋: `feat(analyze) - 다시 읽은 글은 사람이 고친 가게를 새로 만들지 않는다`
- > 메모: `editedFrom` 은 본문이 말한 `saveEdit` 이 아니라 `nameKey` 를 다시 계산하는 `buildEdit`(`src/lib/adminEdit.ts`)에서 남긴다 — 저장 함수는 `edit.extracted` 를 그대로 쓴다. 이미 고친 행(`editedAt` 있음)은 원래 키가 없으니 만들지 않는다. 테스트의 TS↔mjs 머리표 묶음은 `analyzeCandidates.test.mjs` 가 `adminApply` 의 `EDITED_NOTE` 를 import 해 비교. `edited` 는 `stats.excluded` 합계 밖 `stats.edited` 로 따로 센다(요약 `· 고침 유지 N`). 재분석 확인 문장의 "다시 읽어도 …" 는 고친 후보가 있을 때만 붙는다.

## P1 — 다섯 칸 탭

### [x] T3.1 탭 다섯과 건수 — 수집 완료 · 검수 대기 · 등록 완료 · 등록 해제 · 블랙리스트

- 근거: 요구 4·7 · D4·D5.
- 읽을 것: `src/screens/adminPage.tsx:90-100`(`TABS`) · `:979-990`(탭별 제목·설명) · `src/lib/adminCandidates.ts:165`(`fetchPendingCandidates`) · `src/lib/adminPlaces.ts:52`(`fetchManagedPlaces`) · `:67-80`(`내림` 을 위로 올리는 정렬 — 탭으로 가르면 필요 없어진다).
- 단계:
  1. `TTab = 'posts' | 'candidates' | 'places' | 'archived' | 'blocks'`, 라벨 `수집 완료 · 검수 대기 · 등록 완료 · 등록 해제 · 블랙리스트` **에 건수를 싣는다**(`검수 대기 21`). 기본 탭은 **검수 대기**(매일 하는 일). 블랙리스트 탭의 본문은 T1.5 — 여기서는 라벨·건수·`미적용` 표시만.
     **탭을 URL 쿼리에 적는다**(`?tab=`, 걸러 보기도 `&warn=&tier=&type=&policy=`) — `history.replaceState`, 마운트 때 읽기(정적 내보내기라 쿼리만). 지금은 전부 메모리라 새로고침·세션 만료 재로그인(12시간마다)·뒤로 가기에서 `candidates`·`all` 로 돌아간다(UX 감사 13).
     **선택 집합은 탭마다 따로**(`selected` 의 키 공간이 다르다 — 묶음 키 · place id · post url). 한 집합이면 검수 탭에서 고른 키가 등록 탭의 "N곳 고름" 에 섞인다. `writingRef` 잠금은 화면 하나로 그대로.
     **탭 전환이 언마운트가 아니어야 한다** — 패널을 모두 마운트해 `hidden` 으로 가리거나 탭별 `scrollTop`·`expanded` 를 저장한다. 검수 대기 40번째 줄을 펼친 채 등록 완료에서 짝을 보고 돌아오는 흐름이 D7 로 잦아진다.
  2. `src/lib/adminPosts.ts`(새): `countPosts(client)` → `{ total, unanalyzed, excluded }` — `select('url', { count: 'exact', head: true })` 셋(3,360행을 내려받지 않는다).
  3. `fetchManagedPlaces` 는 한 번만 부르고 `status` 로 3·4 에 나눈다(조회 둘로 쪼개지 않는다 — 그러면 `applyPlaceChange`·`placesRef` 의 수동 동기화가 state 하나로 합쳐지고, 되살리기 한 번에 3·4 건수가 **같은 틱**에 움직인다). 등록 해제 칸의 정렬은 `archived_at` 최신순이고, `내림` 뱃지·"내린 곳을 맨 위로"(`sortManagedPlaces`)는 그 탭에서 군더더기라 뺀다.
  4. 설명 줄 — 수집: `전체 N · 미분석 M · 제외 K — 터미널에서 pnpm data:analyze` · 검수: `N곳` · 등록 완료: `게시 N · 게시 대기 M` · 등록 해제: `N곳 — 사이트에 안 보여요` · 블랙리스트: `N곳 막힘 · M곳 지남`.
     **일괄 줄은 탭마다 다르다**(`AdminPageBulkBar` 는 지금 후보 전용 `TBulkMode` 넷) — 수집(다시 읽기 · 분석 제외) · 검수(등록 · 덮어쓰기 · 제외 · 재분석) · 등록 완료(다시 분석) · 해제·블랙리스트(없음). 모드 집합을 탭이 넘기는 prop 으로.
  5. 수집 칸 본문은 이 태스크에서 **건수와 명령만**(목록은 T3.2).
- 수용 기준: 탭 전환에 데이터 재조회가 없다(이미 든 것을 쓴다) · 비운영자(RLS 빈 결과)에게 건수가 0 이 아니라 "권한 없음" 으로 보인다(`adminPage.tsx:64` 의 갈래 유지) · 되살리기 한 번에 행이 4 → 3 으로 옮겨 보이고 두 탭 라벨의 수가 함께 바뀐다 · 새로고침 뒤 같은 탭·같은 걸러 보기 · 검수 탭에서 고른 뒤 등록 탭의 "고름" 이 0.
- 문서: `features/admin-review.md` 「화면 구조」 표를 다섯 칸으로(머리말 vN).
- 커밋: `feat(admin) - 탭을 수집 완료·검수 대기·등록 완료·등록 해제·블랙리스트 다섯으로 — 라벨에 건수, URL 에 탭, 탭별 선택`
- > 메모: 장소 목록·줄 상태·쓰기(`changePlace`)를 `AdminPagePlaceList` 에서 `adminPage` 로 끌어올렸다(단계 3 — 한 state 를 `status` 로 가른다). 목록은 로그인 직후 한 번 읽고, **쓰기가 성공할 때마다 조용히 다시** 읽는다(`afterWrite` — 칸을 열 때 읽던 길이 없어져서, 안 그러면 승인이 만든 새 장소가 새로고침 전까지 등록 완료에 안 뜬다). 되살리기·내리기 뒤 줄이 다른 칸으로 옮겨 가므로 옛 "구간을 벗어나도 한 번 남긴다" 예외는 지우고, 대신 두 장소 칸 위에 한 줄 안내(`placeNotice`)를 둔다. 선택 집합은 지금 검수 대기만 쓰므로 `selected` 를 칸별로 쪼개지 않았다(다른 칸의 일괄은 T3.2·T5.2 에서 칸별로 — 지금 쪼개면 빈 껍데기다). 일괄 줄 모드 집합을 탭이 넘기는 prop 으로 바꾸는 것(단계 4 끝)도 같은 이유로 T3.2 로 넘겼다. `미적용` 은 수집 완료(`blog_posts.excluded_at` — T3.2 의 마이그레이션이 생기기 전이라 지금은 늘 서 있다)와 블랙리스트(`place_blocks`) 라벨에. 새 파일: `adminUrlState.ts`(주소 쿼리, 테스트) · `adminPosts.ts`(`head` count 셋) · `adminPagePostsPanel.tsx` · `adminPageBlocksPanel.tsx`. 걸러 보기 네 타입(`TTierFilter` 등)은 주소가 같이 읽고 써야 해서 `adminUrlState.ts` 로 옮겼다. 등록 해제 칸에서는 `내림` 뱃지·빠진 정보 드롭다운·상태 칩을 뺐다. 기본 탭은 그대로 검수 대기.

### [x] T3.2 수집 완료 칸 — 글 목록 · 글 단위 분석 제외

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
- > 메모: 마이그레이션은 시간순을 지키려 `20261007160000_blog_posts_exclude.sql` 로 만들었고 사용자가 2026-10-07 적용했다(`ops_overview` 의 backlog 도 제외한 글을 뺀다 — `/admin` 의 미분석 수와 `/admin/ops` 가 갈리지 않게). "미분석" 의 정의는 `adminPosts.onlyUnanalyzed` 한 곳(머리글 수·미분석 목록·백로그가 같이 쓴다), 스크립트·워커는 `scripts/lib/postExclusion.mjs`(칸 유무를 `limit(1)` 로 보고, 없으면 경고 한 줄 후 조건 없이 — 세션·네트워크 실패는 "미적용" 으로 삼키지 않고 던진다). 글 쪽 `다시 읽기` 는 `fetchSiblings → reopenPlan → prepareReanalyze` 로 후보 쪽과 같은 규칙. 선택은 패널 안의 url 집합(칩·페이지가 바뀌면 비운다). 명세에 없던 일괄 `제외 해제` 를 더했다(제외 칩에서 체크박스만 서고 할 일이 없었다). 화면은 Chrome 으로 칩·목록·분석됨의 버전 칩·다시 읽기 확인 문장까지 봤고, 원격에 남는 쓰기 버튼은 누르지 않았다.

### [x] T3.3 옛 프롬프트로 분석된 글 고르기

- 근거: [data-pipeline 「재분석」 0단계](../architecture/data-pipeline.md) 가 "지금 `PROMPT_VERSION` 과 다른 글이 대상" 이라 하는데 그 비교를 할 자리가 화면에 없다. 브라우저는 `scripts/analyze/extractPlaces.mjs` 의 상수를 못 읽는다(sha256 이 빌드 시점 값이 아니다) — **분포로 보여 준다**: 분석된 글의 `analysis->>'promptVersion'` 별 건수 칩, 가장 최근 `analyzed_at` 의 버전을 `최신` 으로 표시.
- 선행: T3.2.
- 단계: `fetchPromptVersions(client)` — `select('analysis->promptVersion, analyzed_at')` 를 `range` 로 나눠 받아 클라이언트에서 센다(≤ 3,360행, 두 칸만). 칩을 누르면 그 버전 글만 필터 → 일괄 `다시 읽기`.
- 수용 기준: 칩 합이 `analyzed` 건수와 같다.
- 커밋: `feat(admin) - 수집 완료 칸에 프롬프트 버전 분포 — 옛 버전 글을 골라 다시 읽힌다`
- > 메모: 2026-10-08 — 칩은 `분석됨` 칩 **안**에 선다(`전부 177 · 4eca20be · 최근 3 · b0e978d8 174`, Chrome 실측 — 합 177 = `분석됨 177` = DB `group by`). 명세의 `최신` 대신 **`최근`**: 화면은 지금 코드의 판을 모르고(sha256 이 `node:crypto` 로 실행 때 만들어진다), 프롬프트를 고친 뒤 아직 안 돌렸으면 `최근` 판도 옛 판이라 `최신` 은 "다시 읽을 필요 없다" 로 읽힌다 — 칩 밑 한 줄이 그렇게 말한다. "분석됨" 의 정의는 `onlyAnalyzed`(`src/lib/adminPostVersions.ts`) 한 곳으로 모아 `fetchPosts` 와 분포가 같이 쓴다. 판 하나를 통째로 되돌리는 버튼은 안 만들었다 — `다시 읽기` 가 `requested_at` 을 찍어 워커가 떠 있으면 곧바로 글마다 `claude -p` 1회라, 50건 페이지 고르기가 그 크기를 정한다. 쓰기 뒤 분포를 다시 세고 고른 판이 비면 `전부` 로 물러선다. `다시 읽기` 자체는 기존 길(원격 쓰기라 실측 안 함)

### [ ] T3.4 낱말 — `올리기`·`승인`·`반영`·`게시` → `등록`, `내리기`·`내림` → `등록 해제`, `반려` → `제외`

- 근거: D4. 같은 동작이 다섯 이름이다 — `올리기`(버튼) · `승인`(`adminPagePlaceRow.tsx:142` · `adminPageEditForm.tsx:283` · `adminPageGroupDetail.tsx:158` 툴팁) · `반영하고 있어요`(`adminPageGroupActions.tsx:15`) · `게시`(`:188,333,377`) · `올라가요`(`adminPagePlaceRow.tsx:142`). `올리기` 만 바꾸면 `등록` 과 `승인` 이 둘로 남는다(UX 감사 11). 27곳 남짓 + 테스트 단정. **맨 마지막 한 커밋** — 앞 태스크들이 라벨 문자열을 단정하는 테스트를 건드리므로 중간에 하면 두 번 고친다.
- 읽을 것: `grep -rn "올리기\|올린 장소\|확인할 장소\|내리기\|내림\|승인\|반영\|게시" src/screens/adminPage*.tsx src/lib/admin*.ts` — `게시중`·`게시 대기`(`PLACE_STATUS_LABEL`)는 **상태** 이름이라 남긴다(`published`·`draft` 의 뜻), 동작 이름만 바꾼다. 06 「열린 것」 #9(빌드/재빌드/반영 → `갱신`)도 같은 커밋.
- 단계: 문자열만. `reviewer_note`·`places` 기록 줄에 적히는 값(`[admin] 승인` · `[admin YYYY-MM-DD] 내림` 등)은 **바꾸지 않는다**(이미 적힌 행이 안 걸린다 — `adminApply.ts:168-171` 의 같은 이유). `PLACE_STATUS_LABEL.archived`(`내림`)는 화면 문자열이라 바꾼다.
- 수용 기준: `grep -rn "올리기\|올린 장소\|확인할 장소\|승인하\|반영하" src/screens/adminPage*.tsx` 가 0 · 테스트 통과.
- 문서: `features/admin-review.md` 머리말에 낱말 교체 한 줄 · `06` D 절.
- 커밋: `style(admin) - 등록·등록 해제·제외·갱신 — 한 동작에 한 이름`

## P1 — 등록한 장소 다시 분석 (D7)

### [x] T5.1 분석이 출처 글의 짝을 건너뛰지 않는다 — 「갱신 제안」

> 메모: 2026-10-08 남은 한 줄을 했다 — 다만 명세의 `sourcesOfPost.get(post.url)?.size` (글 단위)가 아니라 **짝 단위**로 풀었다(`blockWaivedBySource`): 목록글이 한 곳의 출처면 같은 글의 다른 차단 가게까지 되살아난다. 그래서 출처 글의 차단 판정은 매칭 뒤로 미뤄 짝 id 가 그 글의 `place_sources` 에 있을 때만 넘긴다. `match.refresh`·`· 갱신 제안 N` 은 v4 대로 11 T1.1·T1.2 가 맡아 넣지 않았다. 운영자 세션이 없어 실행 실측은 못 했다 — 단위 테스트 3 + `node --check`. 실제로 쓰이는 것은 T5.2(`다시 분석` 버튼) 뒤

> v4: **출처 특례는 → [11](11-continuous-review-and-update-proposals.md) T1.1(차이 게이트)로 대체됐다**(`skipAsExisting` 이 "같은 말" 만 건너뛴다). 남은 일은 단계 2 의 **"출처 글은 블랙리스트도 건너뛴다"** 한 줄뿐 — `place_sources` 를 읽어야 해서 T5.2 와 함께 한다. 요약 줄의 `· 갱신 제안 N` 은 11 의 `· 갱신 N` 이다.

- 근거: D7 · 요구 8. 출처 글을 다시 읽혀도 짝이 `published` 면 `skipAsExisting` 이 버린다 — 버튼(T5.2)만 만들면 **아무 일도 안 일어난다**(조용히 깨진다).
- 선행: T1.2.
- 읽을 것: `scripts/analyze/analyzeCandidates.mjs:175-194` · `scripts/analyze-candidates.mjs:224-262`(기존 장소·pending 미리 읽기) · `supabase/migrations/20260920124849_zgnn_schema.sql:88-93`(`place_sources`) · `scripts/apply-approved.mjs`·`src/lib/adminApply.ts` 의 `place_sources` 쓰기(덮어쓰기가 출처를 더하는지).
- 단계:
  1. 실행 시작에 `place_sources` 를 읽어 `Map<post_url, Set<place_id>>`(운영자 select 권한 있음 — `20260922120000_narrow_grants.sql:74`).
  2. `skipAsExisting(matched, { sourcesOfPost })` — 짝의 `id` 가 이 글의 출처 집합에 있으면 **건너뛰지 않는다**. 후보 행 `extracted.match.refresh = true`(화면 표시용 한 칸).
     순서: 출처 글이면 T1.2 의 블랙리스트 판정도 **건너뛴다**(일부러 다시 읽힌 것이 블랙리스트보다 우선 — 등록 해제 + 영구 + 다시 분석 이 조합이 아니면 해제한 가게를 영영 갱신할 수 없다). `isBlocked` 앞에 `sourcesOfPost.get(post.url)?.size` 검사 한 줄.
  3. 테스트: 출처 글 + `published` 짝 → 후보 · 출처 아님 + `published` → 건너뜀 · 출처 글 + `archived` + 열린 블랙리스트 → 후보.
- 수용 기준: `pnpm test` 통과 · 요약 줄에 `· 갱신 제안 N`.
- 문서: data-pipeline 「재분석」 에 "등록한 장소의 출처 글" 절.
- 커밋: `feat(analyze) - 등록한 장소의 출처 글을 다시 읽으면 건너뛰지 않고 갱신 제안으로 올린다`

### [x] T5.2 등록 완료·등록 해제 칸의 `다시 분석`

> 메모: 2026-10-08 행 버튼만 — `planPlaceReread`(출처 합집합 → `planReread`) · `placeRereadSummary` · 쓰기는 `prepareReanalyze` 그대로, `places` 쓰기 0(`adminPosts.test.ts` 가짜 client 가 확인). 출처 수는 목록 로드가 아니라 **누를 때** 읽는다 — 그래서 미리 끄지 않고, 눌러서 0이면 "다시 읽을 글이 없어요 — 블로그 글에서 올린 장소가 아니에요". **일괄은 안 했다** — 장소 칸에 선택 상태·일괄 바가 아직 없어 그것부터 만들어야 한다(T5.2b). 운영자 세션이 없어 화면 실측 못 함(끝 열이 버튼 하나만큼 넓어졌다)

### [ ] T5.2b 등록 완료 칸의 일괄 `다시 분석`

- 장소 칸(`adminPagePlaceList`)에 체크 선택 + 일괄 바(검수 대기·수집 완료의 `adminPageBulkBar` 꼴). 계획은 `planPlaceReread(client, 여러 id)` 가 이미 합집합을 받는다 — 화면만.

- 근거: D7. 글 쪽 되돌리기는 이미 있다(`adminReanalyze.prepareReanalyze` — 규칙 1·4).
- 선행: T5.1 · T3.1.
- 단계:
  1. `src/lib/adminPlaces.ts` 에 `fetchPlaceSources(client, placeIds)` → 장소별 출처 글 url.
  2. 행 버튼 `다시 분석` — `secondary`(상태를 안 바꾸는 동작, 옆의 `등록 해제` 는 destructive). 출처 글이 0이면 끄고 `다시 읽을 글이 없어요`(✅ 🙋A — Notion 시드. 새 글로 갱신하는 길은 ADR-019 결정 7 의 업체명 재검색이 열리면). 확인 문장: "출처 글 N건을 수집 완료로 되돌려요. 사이트의 장소는 그대로이고, 다음 `pnpm data:analyze` 뒤 검수 대기에 갱신 제안으로 올라와요."
  3. 일괄(등록 완료 칸) — 체크한 장소들의 출처 글 합집합.
- 수용 기준: 장소 상태(`status`)를 건드리지 않는다(테스트 — 재빌드가 불리지 않는다) · 그 글의 pending 형제 후보는 `prepareReanalyze` 가 눕힌다.
- 문서: `features/admin-review.md` 「등록한 장소를 다시 분석」 새 절.
- 커밋: `feat(admin) - 등록한 장소를 다시 분석 — 출처 글을 수집 완료로 되돌린다`

### [ ] T5.3 검수 대기의 「갱신 제안」 · 「등록 해제된 가게의 새 글」 표시

> v4: `갱신 제안` 칩은 → [11](11-continuous-review-and-update-proposals.md) T1.2 의 `갱신` 칩(`match.kind`)이다. 남은 일은 `등록 해제된 가게의 새 글` 표시와 두 버튼, 그리고 덮어쓰기의 `place_sources` upsert(11 H.4 로 먼저 확인).

- 근거: D6·D7 — 같은 `덮어쓰기` 버튼이지만 운영자가 읽는 뜻이 다르다(새 가게가 아니라 **지금 보이는 장소를 바꾸는** 일).
- 선행: T5.1.
- 단계: 묶음 카드 머리에 칩 — `갱신 제안`(`match.refresh`) · `등록 해제된 가게의 새 글`(짝이 `archived`, 출처 아님). 갱신 제안의 기본 동작은 `덮어쓰기`. 등록 해제 짝은 두 버튼 — `덮어쓰기(내용만)`(✅ 🙋C: 상태는 `archived` 그대로) 와 `되살려서 덮어쓰기`(지금의 '되살려서 합치기', `restoreArchived`). **`덮어쓰기` 가 `place_sources` 를 upsert 하도록** `adminLatest`/`adminApply` 의 쓰기 길에 한 줄(지금은 등록 경로만 쓴다, `adminApply.ts:204`) — 안 쓰면 갱신에 쓴 글이 다음 `다시 분석` 의 출처가 아니다.
- 커밋: `feat(admin) - 검수 대기에 '갱신 제안' 과 '등록 해제된 가게의 새 글' 을 따로 표시한다`

## P0 — 운영자가 틀리게 누르는 자리 (UX 감사 2026-10-01)

화면 11파일을 읽은 감사에서 나온 25건 중, 06 「열린 것」 과 위 태스크가 안 다루는 것만 골랐다. 전부 코드에서 읽은 것이고 "추정" 은 그렇게 적었다. 나머지 10건은 P2 목록에 한 줄씩.

### [x] T6.1 `새 장소로` 가 `여기까지 · 접기` 와 같은 모양으로 같은 줄에 선다

- 근거: 결정 줄은 `justify-between` 한 줄이고(`adminPageGroupCard.tsx:354-386`), 왼쪽 버튼 묶음이 접히면 마지막 조각 `Escape`(`link-gray` · `text-xs`, `adminPageGroupActions.tsx:421-428`)가 오른쪽 끝 `접기`(`text-xs text-tertiary`) 바로 옆에 온다. 내린 곳 갈래는 버튼 6개라 1280px 에서도 접힌다. 한쪽은 접고 한쪽은 **복제본을 게시**하는데 가르는 것은 `title` 툴팁뿐.
- 단계: `접기` 를 결정 줄에서 빼 판 맨 아래 가운데 한 줄로. `Escape` 는 앞에 구분선 `|` + 밑줄 + 한 번 확인(`정말 다른 가게예요?` 한 줄, `Situation` 재사용).
- 수용 기준: 390·768·1280 에서 `새 장소로` 와 `접기` 가 같은 줄에 서지 않는다(스크린샷 셋).
- 커밋: `fix(admin) - '새 장소로' 와 '접기' 를 떼어 놓고 한 번 확인한다`
- > 메모: 확인은 `Escape` 가 자기 상태로 들고(`useState`) 인라인으로 펼친다 — 새 상태·prop 을 소유자(`adminPage`)까지 올리지 않았다. 구분선은 `|` 글자 + 밑줄 링크.

### [x] T6.2 `되살리기` 가 "게시중으로 간다" 를 말하지 않는다

- 근거: 문서(`features/admin-review.md:653`)와 `adminPlaces.ts:12` 는 라벨을 `되살리기(게시중으로)` 라 적었는데 코드는 `되살리기`(`adminPagePlaceRow.tsx:182`). 초안이었다 내려진 행도 되살리면 **게시**되고, 확인이 없다(06 #11). `color="primary"` 핑크라 내린 행이 맨 위에 모이는 지금 정렬에서 이 탭의 첫 화면이 핑크 버튼 열이다 — 등록 해제 탭(T3.1)에서는 **전부**가 그렇다.
- 단계: 라벨 `되살리기(게시중으로)` · `secondary` · 한 줄 확인(`사이트에 다시 보여요. 되살릴까요?`). 06 #11 을 여기서 닫는다.
- 커밋: `fix(admin) - 되살리기는 게시라고 말하고 한 번 묻는다`
- > 메모: 확인 상태는 행(`adminPagePlaceRow`)의 로컬 `useState`. 되살리는 중에도 확인 줄이 남아 스피너가 거기서 돈다.

### [x] T6.3 일괄 줄의 주 버튼이 늘 핑크 `올리기` 다 — 한 줄은 `동반 근거 없음` 이면 주 버튼을 `반려` 로 뒤집는데

- 근거: 한 줄 결정 줄은 교차점검 `동반 근거 없음`·`동반 불가 정황` 이면 올리기를 회색으로 내린다(`adminPageGroupActions.tsx:47`). 일괄 줄은 그 구성을 모르고 늘 `color="primary"` `올리기`(`adminPageBulkBar.tsx:100-102`). 경고 드롭다운으로 `근거 없음` 만 걸러 머리글 체크로 전부 고르면, 한 줄에서 막은 것("5곳이 핑크 한 번씩에 게시")이 일괄로 되돌아온다.
- 단계: `adminBulk.ts` 에 순수 `bulkApproveSummary(groups, selected)` → `{ ok, noEvidence, addressUnresolved, noRegion, archivedTarget, ask }`. 하나라도 0 이 아니면 `올리기` 를 `secondary` 로, 확인 문장은 "N곳 올려요 · 근거 없음 M곳·주소 다름 K곳은 건너뛰어요"(지금은 고정 문장, `adminPage.tsx:1152`). 덮어쓰기의 `bulkLatestSummary` 와 같은 꼴.
- 수용 기준: 테스트 — 고른 것에 `noEvidence` 하나 → 요약에 그 수, 주 버튼 톤 `secondary`.
- 커밋: `fix(admin) - 일괄 올리기가 고른 것의 구성을 세고, 근거 없는 줄이 있으면 주 버튼을 내린다`
- > 메모: `bulkApproveSummary(groups, selected, places?)` — 내린 곳 짝을 보려고 셋째 인자(장소 캐시)를 더했다. 근거 없음 줄은 `approveGroup` 이 **건너뛰지 않으므로** 문장은 "건너뛰어요" 가 아니라 "그중 근거 없음 M곳도 그대로 올라가요" 로 적는다(지역 없음·주소 다름·내린 곳만 건너뛴다). `ask` 는 분석 때 `tier==='ask'` 이고 짝이 없는 줄 — 올릴 때 멈출 수 있다는 어림이다(확정은 `approveGroup` 의 재대조). 주 버튼은 `bulkApproveNeedsLook` 이 참이면 `secondary`. 화면 스크린샷(T6.1 수용 기준)은 /admin 이 로그인 세션을 요구해 찍지 못했다.

## P1 — 운영자를 느리게 하는 자리 (UX 감사)

### [x] T6.4 일괄 뒤 "직접 골라야 해요" 줄을 접힌 채로 찾을 수 없다

> 메모(2026-10-07): 접힌 줄에 `골라 주세요` 뱃지 + 노란 줄기(실패는 빨간 줄기, `adminTable.tsx` 의 `ADMIN_ROW_WAITING`·`ADMIN_ROW_FAILED`) · 경고 드롭다운에 `결정 기다림`·`실패`(`BULK_MATCH` — `states` 를 보고 고르므로 `any` 엔 안 센다, 새로고침하면 빈다) ·
> 결과 줄 색은 `bulkTone`(`adminBulk.ts`, 테스트) — 제외 줄은 블랙리스트만 실패한 곳도 남은 일로 세어 노랑. **화면은 못 봤다**(로그인 뒤 일괄 쓰기 결과라 원격 쓰기 없이는 안 선다) — 다음 실제 일괄 때 한 번 볼 것.

- 근거: `needsDecision`·`archivedTarget` 은 `state.similar`/`state.archived` 만 세우고(`adminPage.tsx:668-677`), 접힌 줄은 `!expanded && state.error` 만 그린다(`adminPageGroupCard.tsx:218,391`). 141줄 중 어느 3줄이 기다리는지는 한 줄씩 펼쳐야 안다.
- 단계: `state.similar || state.archived` 면 접힌 줄에 `골라 주세요` 뱃지 + 줄기색. 경고 드롭다운에 `결정 기다림`·`실패` 선택지(`states` 기준). 결과 줄의 톤 — `tally.done === 0` 이면 `error`, 부분 실패면 `warning`(지금은 늘 `text-success-primary`, `adminPageBulkBar.tsx:122` · `adminPage.tsx:700` — "0곳 올렸어요 · 3곳 실패" 도 초록). `summarizeBulk` 에 `tone` 한 칸.
- 커밋: `feat(admin) - 일괄 뒤 기다리는 줄·실패한 줄을 접힌 채로 찾고 결과 줄이 색으로 말한다`

### [x] T6.5 141건 일괄에 진행 표시가 스피너 하나다

> 메모(2026-10-07): `bulk.progress`(`{done,total}`)를 루프 안에서 갱신, 일괄 줄에 `N / M` + `멈추기`(`bulkStopRef` — 다음 묶음 전 깃발 검사, 올리기·덮어쓰기·제외 셋 다). 된 줄은 그때그때 `setGroups` 로 뺀다.
> 안 한 수는 `TBulkTally.stopped` → `stoppedNote`, `bulkTone` 이 남은 일로 센다(테스트). 재분석 일괄은 계획 한 번의 쓰기라 뺐다. **화면은 못 봤다**(로그인·실제 일괄 필요).

- 근거: 순차 `await` 인데(`adminPage.tsx:661-695`) 몇 번째인지 없고 끝날 때까지 `setGroups` 도 안 바뀐다(된 줄이 끝에 한꺼번에 빠진다). 운영자는 멈춘 줄 안다.
- 단계: `setBulk({ busy, progress: { done, total } })` 를 루프 안에서 갱신, 확인 상자에 `12 / 141`. 중간 취소는 다음 항목 전 플래그 검사. 된 줄은 그때그때 빠진다.
- 커밋: `feat(admin) - 일괄 처리에 진행 수와 취소`

### [x] T6.6 접힌 줄에 근거가 한 조각도 없다

> 메모(2026-10-07): 이름 밑에 `블로그 원문` 칩 + 인용 한 줄(`truncate`, 접힌 동안만). 고르는 규칙은 `groupQuote`(`src/lib/adminGroupQuote.ts`) — **조건 문장(`petPolicyText`)이 먼저**(옆 조건 칩과 눈으로 맞춘다), 없으면 대표 글 → 묶인 글 순의 첫 `evidence`, 둘 다 없으면 안 그린다. ✅ 사용자 확정. 수집 완료 탭(T3.2)의 글 줄은 이 커밋 밖. 화면 확인은 로그인이 필요해 못 했다.

- 근거: 접힌 줄의 이름·지역·칩·AI 요약·종류는 전부 **AI 가 낸 값**이고(`adminPageGroupCard.tsx:235-325`) 블로그 인용(`evidence`)은 펼쳐야 보인다. 교차점검 뱃지는 지금 전부 `null` 이라 안 뜬다. 눈이 먼저 가는 것은 가장 넓은 AI 요약 열(4.6fr)이고 그것이 줄 높이를 정한다 — 결국 매 줄을 펼친다.
- 단계: 이름 밑(또는 AI 요약 앞)에 첫 인용 한 줄 `truncate` + `블로그 원문` 칩(`adminSource.tsx` 톤 재사용 — 접힌 줄에서도 "이건 사람 말" 을 가른다). 수집 완료 탭(T3.2)의 글 줄도 같은 원칙(제목 = 사람 말).
- 커밋: `feat(admin) - 접힌 줄에 블로그 인용 한 줄`

### [x] T6.7 `덮어쓰면 바뀌는 칸` 목록과 `덮어쓰기` 버튼이 판 위아래로 떨어져 있다

> 메모(2026-10-07): 이미 됐다 — `fb042fa`(2026-10-04 v4)가 체크 목록·비교표·버튼을 결정 줄 바로 위 한 표(`AdminPageGroupSiteCompare` 의 `overwrite`)로 모았다. 줄 머리에 체크, 발치에 `체크한 N칸 덮어쓰기`(`adminPageGroupActions.tsx:196-235`). 근거의 줄 번호는 그 전 코드다. 코드 변경 없이 닫는다.

- 근거: 목록은 판 맨 위(`adminPageGroupCard.tsx:349-351`), 버튼은 판 맨 아래 블로그 글 목록 뒤(`adminPageGroupActions.tsx:141-153`) — 글 5건짜리 묶음이면 한 화면 거리, 버튼 `title` 이 "위 목록에 있어요" 라고 가리키기만 한다. D7 의 갱신 제안으로 이 길이 잦아진다.
- 단계: 목록을 결정 줄 바로 위(`합칠 곳` 줄 자리)로 내리거나 `<details>` 로 접어 버튼 옆에서 열리게.
- 커밋: `fix(admin) - 덮어쓰기 버튼 옆에서 바뀌는 칸을 본다`

### [x] T6.8 등록 해제 폼의 사유·메모가 취소 뒤에도 남는다

- 근거: 줄의 `useState`(`adminPagePlaceRow.tsx:438-439`)라 `폐업 고름 → 취소 → 다른 날 다시` 에 `폐업` 이 미리 눌려 있다. 후보 반려 폼은 모드가 꺼지면 언마운트돼 비워진다 — 둘이 다르다. T1.4 가 두 폼에 같은 세그먼트를 재사용하므로 **그때 함께**(T1.4 단계 1 에 넣었다 — 여기서는 확인만).
- 커밋: T1.4 에 포함.

### [ ] T6.9 고른 칩이 주 버튼과 같은 핑크 채움이다

- 근거: v20 이 탭에서 걷어낸 이유("가장 드문 동작이 주 버튼과 같은 모양")가 상태 칩(`adminPagePlaceList.tsx:289`) · 반려 사유 칩(`adminPageRejectForm.tsx:42`) · TriButtons(`adminPageEditForm.tsx:65,324`)에 그대로다. 반려 폼에서는 고른 사유 칩(핑크)이 빨간 `반려하기` 바로 위에 선다.
- 단계: `AdminFilterChip` 하나 — `secondary` + `aria-pressed` + `border-brand` 테두리. 세 곳을 이것으로. T1.3 의 블랙리스트 세그먼트도 이 꼴.
- 커밋: `style(admin) - 고른 칩은 한 꼴 — 핑크 채움은 주 버튼만`

## P2 — 다듬기 (UX 감사, 한 줄씩 — 할 때 태스크로 올린다)

- **URL·스크롤·탭별 선택** → T3.1 에 넣었다. **`눕히다`·재분석 빨강** → T2.1 에. **낱말 다섯 벌** → T3.4 에. **블랙리스트 탭 `미적용`** → 실행 규약에.
- `?` 도움말이 `title` 툴팁 5문장(`adminPage.tsx:987-993`) — 포커스 불가 `span`. → `<button aria-describedby>` + 팝오버 또는 머리글 밑 접는 한 줄.
- 버튼 설명이 전부 hover `title`(`TipButton`, `adminPageGroupActions.tsx:434-443`) — react-aria 가 `title` 을 버려 접근성 트리에 없다. "되돌릴 수 없어요"(`:333-337`)만이라도 `Situation` 한 줄로.
- 결정 줄의 `반려`·`재분석`·`고치기` 를 누르면 버튼이 언마운트되고 포커스가 body 로(`:107-132`). 끝난 줄이 3초 뒤 사라질 때도. → 폼 첫 컨트롤에 `autoFocus`, 줄이 사라지면 다음 줄 펼침 버튼으로.
- 머리글 `aria-hidden` + 줄 전체가 한 `<button>`(`adminTable.tsx:294`) — 폰(grid 꺼짐)에서 세로로 쌓인 값이 무엇인지 모른다. → 칸마다 `<span class="sr-only max-md:not-sr-only">지역</span>`.
- `text-quaternary` 12px 상태 글자(`adminPageGroupCard.tsx:252-269,293,308`) — 흰 바탕 ≈ 4.5:1 경계, 크림 `bg-active` 에서는 아래로 내려갈 것으로 **추정**. `짝 비움 · 새 장소로` 는 "승인이 새 장소를 만든다" 는 뜻인데 가장 흐리다. → `text-tertiary` 로 한 단, `짝 비움` 은 회색 Badge.
- 빈 결과 문장이 "걸러 보기를 꺼 보세요" 라 하는데 올린 장소 칸엔 `걸러 보기 풀기` 가 없다(`adminPagePlaceList.tsx:331-333`). → 빈 상태 안에 버튼, `resetFilters`.
- 오류 줄을 지울 수 없다(`adminPageGroupCard.tsx:391` · `adminPageBulkBar.tsx:123`) — "다른 작업을 처리하고 있어요" 가 끝난 뒤에도 남는다. → `endWrite` 때 그 문구만 치우거나 `×`.
- 로그인 실패가 Supabase 영문 그대로(`adminPageLogin.tsx:274`), 이메일 칸 `autoFocus` 없음 — 06 #8 과 같은 어법.
- 만료 시각이 시·분만(`adminPage.tsx:974,1002`) — 12시간 세션이라 저녁 로그인은 `내일 오전 8:30`.
- 동반 칩 모양이 세 벌(`adminTable.tsx:190` · `adminPageGroupDetail.tsx:21` · `adminPageEditForm.tsx:124`) — 06 #12 와 한 몸으로 `<PetBadges>` 하나로. 비교표의 `나갈 값` 칸은 `AI 정리` 하늘색인데 운영자가 고친 값도 그 색에 선다 — `adminSource.tsx` 의 "사람 말 ≠ AI 말" 약속이 거기서 깨진다.

## P2 — 나중에 (설계 필요)

- **T4.1 블로그 단위 차단.** 자사 홍보 블로그 하나가 13건(README v18 실측). `blog_posts.blog_id` 로 `place_blocks` 와 같은 꼴의 `blog_blocks`, 또는 `place_blocks.kind`. 수집 칸에서 글 하나를 보며 "이 블로그 전부". 수집(`collect-blog.mjs`)이 아니라 **분석이 건너뛴다**(수집은 저수지, 싸다).
- **T4.2 좌표로 차단 대조.** 읍·면이 없는 시내 가게는 이름만으로 걸린다. 후보 좌표가 있으면 300m 안을 같은 가게로 — `matchPlace` 의 거리 규칙을 재사용.
- **T4.3 `데이터 흐름` 머리글.** 탭 줄 위에 `수집 N → 검수 M → 등록 K ⇄ 해제 J · 블랙리스트 B` 한 줄과 마지막 실행 시각(`max(fetched_at)`·`max(analyzed_at)`·`rebuild_log`).

## v2 점검 — 다른 세션이 쓴 v2 를 코드와 대 봤다 (v3)

v2 의 결정 D6·D7 과 코드 근거(`skipAsExisting:192` · `archived` 짝 `:183` · `place_sources` 스키마 `:90` · grant `:74` · `adminReanalyze` 규칙)는 **전부 맞다.** 고친 것 넷:

| 자리 | v2 | 왜 틀렸나 | v3 |
|---|---|---|---|
| T2.2 "같은 글·같은 `nameKey` 의 고친 후보" | `nameKey` 하나로 식별 | `saveEdit` 이 **고친 이름으로 `nameKey` 를 다시 계산**한다(`adminEdit.ts:351`, 짝을 다시 잡으려고 일부러). 이름을 고친 뒤 재분석하면 AI 는 원래 이름을 내 키가 어긋나고 복제본이 생긴다 | `editedFrom.nameKey` 를 남기고 둘 다 집합에 |
| 등록 해제 `중복` → 블랙리스트 영구 | 영구 | 블랙리스트는 **이름** 축이라 살아 있는 쌍둥이(3 탭)의 새 글까지 막는다. 쌍둥이는 `skipAsExisting` 이, 해제한 행은 동점 규칙(`matchPlace.mjs:178`)이 이미 처리한다 | 없음 |
| D6 의 `skipAsExisting(matched, { blockedPlaceIds })` | 이름 축(T1.2)과 `place_id` 축 둘 | 해제 때 만든 행도 `name_key` 를 가져 **이름 축에서 먼저 걸린다.** 둘째 축은 이름이 다를 때(좌표로만 잡힌 짝)만 의미가 있는데 그 경우는 블랙리스트의 뜻("이 이름") 밖이고, 로그가 `차단`/`건너뜀` 둘로 갈린다 | 이름 축 하나. `place_id` 는 되살릴 때 풀 행의 열쇠 |
| D7 갱신 제안 → `덮어쓰기` | 출처는 이미 있다고 봄 | `덮어쓰기`(`adminLatest`)는 `place_sources` 를 **안 쓴다** — 등록 경로(`adminApply.ts:204`)만 쓴다. 「등록 해제된 가게의 새 글」 을 덮어쓰면 그 글이 다음 `다시 분석` 의 출처가 아니다 | 덮어쓰기도 upsert(T5.3) |

사소한 것: `adminPlaces.ts:25` → `:26`(`ARCHIVE_REASONS`). 그 외 줄 번호는 맞다.

## 🧑 사람 손

| # | 무엇 | 언제 |
|---|---|---|
| H.1 | `supabase db push`(T1.1 · T3.2 의 마이그레이션 2개) — 로그인 필요 | T1.1 파일 커밋 뒤 |
| H.2 | ~~🙋 A~C 결정~~ → v3 에서 닫혔다 | — |
| H.3 | 첫 실측 — 반려한 가게 하나를 `3개월 제외` 하고 `pnpm data:analyze --dry-run --limit 5` 로그에 `차단 1` 이 찍히는지 | T1.3 뒤 |
| H.4 | 출처 글 없는 장소 수 실측 — `place_sources` 에 행이 없는 `places` 를 센다(A 의 근거, `supabase db query --linked`) | T5.2 전 |
| H.5 | 등록한 장소 하나를 `다시 분석` → `pnpm data:analyze --dry-run --limit 5` 로그에 `갱신 제안 1` | T5.2 뒤 |

## 🙋 닫힌 질문 (v2, 2026-10-01 사용자)

1. 사유별 제외 기본값 — 동반 불가 3개월 ✅ · **폐업 영구**(v1 제안 3개월을 바꿨다).
2. 둘째 탭 이름 — **`검수 대기`**.
3. 재분석 때 사람이 고친 후보 — **언제나 남긴다**, 체크 없음. 대신 다시 읽은 글이 그 가게를 또 만들지 않는 규칙(T2.2).

## 🙋 닫힌 질문 (v3, 2026-10-01 사용자)

- **A. 출처 글이 없는 장소** — `다시 분석` 을 **끈다**, `다시 읽을 글이 없어요`. 새 글로 갱신하는 길은 ADR-019 결정 7(업체명 재검색)이 열리면 그때 — 이 계획 밖.
- **B. 등록 해제한 가게** — **등록 해제와 블랙리스트는 두 개념**(✅ 사용자). 해제는 장소의 상태, 블랙리스트는 가게 이름의 수집 차단. 해제 탭의 가게가 새 글로 올라오는지는 블랙리스트에 있는지만 본다. 해제 폼이 그 결정을 같은 자리에서 받되 기본값은 사유별 표(`중복`·`기타` 는 없음). 블랙리스트는 **다섯째 탭**.
- **C. 해제 탭에서 덮어쓰기** — **유지**(✅ 사용자). 내용만 바뀌고 상태는 `archived`. 사이트로 내보내는 일은 `되살리기(게시중으로)` 한 버튼만.

## 🙋 열린 질문

없다(v3). 다음 🙋 는 ADR-020 초안을 쓸 때 — D1~D7 을 옮기면서 사용자가 한 번 읽는다.

## 문서 — 태스크가 끝나면 어디가 바뀌나

| 문서 | 바뀌는 절 | 태스크 |
|---|---|---|
| `features/admin-review.md` | 화면 구조(다섯 칸) · 「블랙리스트」 · 「제외」(← 반려) · 「수집 완료 칸」 · 「재분석」 첫 줄 · 「등록 해제」(← 내린다) · 「등록한 장소를 다시 분석」 | T1.3 · T1.4 · T1.5 · T2.1 · T3.1 · T3.2 · T5.2 |
| `architecture/data-pipeline.md` | 스키마 요약 · 제외 이유 `blocked`·`edited` · `archived` 짝(열린 제외면 건너뜀) · 「재분석」 머리 · 출처 글 갱신 제안 | T1.1 · T1.2 · T1.4 · T2.1 · T2.2 · T5.1 |
| `decisions/ADR-020-*.md` | D1~D7 을 옮긴다 — 🙋 는 전부 닫혔다. **첫 코드 태스크(T1.1) 와 같은 커밋**에 초안을 넣는다 | T1.1 |
| `todo/06` | D 절(낱말) · #11(되살리기 확인) 닫힘 · 머리말 | T1.3 · T3.4 · T6.2 |
| `todo/README.md` | 문서 목록 9행 · 머리말 | 이 커밋 |

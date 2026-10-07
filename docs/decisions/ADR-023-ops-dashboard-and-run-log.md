# ADR-023 — 파이프라인이 돌고 있는지는 스크립트가 남긴 실행 기록(`pipeline_runs`)으로 보고, 화면은 `/admin/ops`, 알림은 DB 가 Slack 으로 보낸다

> 최종 수정: 2026-10-07 (v2: 「하지 않은 것」 의 **Realtime 구독을 번복** — 로컬 워커([ADR-024](ADR-024-local-worker-and-db-queues.md))가 생기면서 `/admin/ops` 는 "열 때 보는 화면" 에서 "도는 동안 보는 화면" 이 됐다. `workers` · `pipeline_runs` 둘만 구독, 60초 폴링은 안전망으로 남는다. 나머지 결정은 그대로)
> 이전 2026-10-06 (v1: 제안 — 설계만. 구현은 [docs/todo/15](../todo/15-ops-dashboard.md) 가 추적한다)
> 상태: **제안**. 코드에 대응물이 없다. 결정 1~6 전부 권장안이고(6 은 "보류" 라는 결정) 🙋 는 [todo/15](../todo/15-ops-dashboard.md) 「사용자가 정할 것」 에 모았다.

## 맥락

수집·분석·반영은 전부 **사용자 터미널에서 손으로** 돈다(`pnpm data:collect` · `data:analyze` · `data:apply`, 스케줄 없음 — [ADR-015](ADR-015-supabase-source-and-rebuild.md), [todo/README](../todo/README.md) 🙋 "수집 주기"). 그래서 "지금 파이프라인이 건강한가" 를 아는 길이 셋뿐이다.

1. 터미널에 찍힌 마지막 요약 줄을 기억한다 — 터미널을 닫으면 사라진다.
2. `pnpm data:review status` 를 친다 — 후보·글·장소 **수**는 알려 주지만 "언제 마지막으로 돌았나", "그때 실패했나" 는 모른다.
3. `/admin` 머리글의 재빌드 한 줄 — 이건 다섯 단계 중 **마지막 하나**(재빌드)만 본다. 재빌드만 DB 에 기록(`rebuild_log`)이 남기 때문이다.

실행 단위 기록은 어디에도 없다. `blog_posts.fetched_at` 은 `ignoreDuplicates` upsert 라 "마지막으로 새 글이 들어온 시각" 이지 "마지막 실행 시각" 이 아니고, `analyze` 는 글 하나가 실패해도 건너뛰고 exit 0 이라 실패가 조용하다. `data/raw/*.log` 는 사람이 손으로 남긴 파일이고 브라우저에선 못 읽는다.

제약은 그대로다 — 서버가 없다(정적 내보내기), 시크릿 값은 로컬에 없다([ADR-016](ADR-016-secrets-by-login.md)), 브라우저가 Supabase 를 직접 부르는 자리는 `/admin` 하나다([ADR-018](ADR-018-in-app-admin-review.md)), 외부로 나가는 길은 DB 트리거 → Vault → `pg_net` 하나다(Deploy Hook, ADR-018 결정 9).

## 결정

1. **정본은 Supabase 표 `pipeline_runs` 한 장이다.** 쓰기 스크립트(`collect-blog` · `analyze-candidates` · `apply-approved` · `review-candidates approve/reject`)가 **시작할 때 한 행을 넣고 끝날 때 그 행을 갱신한다**(`status: running → ok | partial | failed`, `stats` jsonb = 지금 콘솔에 찍는 요약 줄의 구조화, `error` 는 메시지 한 줄). 긴 `analyze` 는 글 N건마다 `heartbeat_at` 을 찍는다 — 프로세스가 죽으면 "running 인데 심장이 멎은" 행으로 드러난다. Slack 도 로그 파일도 정본이 아니다 — Slack 은 질의할 수 없고, 로그 파일은 브라우저가 못 읽는다.
2. **기록은 실패해도 작업을 막지 않는다**(fail-soft). `pipeline_runs` insert 가 실패하면 경고 한 줄을 찍고 스크립트는 그대로 돈다. 관측 장치가 본업을 멈추게 하지 않는다. 단 `pull-db` 는 기록하지 않는다 — anon 으로 붙는 읽기 전용이고 Vercel 빌드 안에서 돈다. 그 실행은 `rebuild_log` 가 이미 보여 준다.
3. **화면은 `/admin/ops`** — `/admin` 의 하위 경로다. 같은 로그인 세션(localStorage `zgnn.admin.session`), 같은 wide·bare 레이아웃(`appShellSurface` 의 `startsWith('/admin')`), 같은 밀도 고정(`data-admin-dense`)을 **아무것도 더 안 하고** 받는다. 형제 경로 `/ops` 로 두면 뒤로가기와 reading 폭이 붙어 셸을 또 고쳐야 한다. 화면 본체는 `adminPage.tsx`(1843줄)에 **더하지 않고** `adminOpsPage.tsx` 로 따로 둔다 — `/admin` 은 "후보를 올리는 자리", `/admin/ops` 는 "장치가 도는지 보는 자리" 라 보는 사람의 질문이 다르다. 둘은 머리글 링크 하나로 오간다.
4. **건강 판정은 저장하지 않고 화면에서 계산한다.** "수집이 7일 넘게 안 돌았다", "approved 인데 반영 안 된 후보가 있다" 는 `pipeline_runs` 와 기존 표에서 **그때 도출**한다(`src/lib/adminOpsHealth.ts`, 순수 함수 + 단위 테스트). 임계값은 코드 상수다 — 저장하면 두 곳이 어긋난다. 집계 수치(기간별 깔때기)는 rpc `ops_overview(days)` 하나가 SQL 로 센다 — 브라우저에서 표 셋을 따로 세면 왕복 여덟 번이고, `data:review status` 와 같은 수를 두 번 구현하게 된다. CLI `status` 는 나중에 이 rpc 의 얇은 출력기가 된다.
5. **Slack 은 DB 가 보낸다**, 스크립트도 브라우저도 아니다. Vault 에 `slack_webhook_url` 하나, `pipeline_runs` 의 `status` 가 `failed` 로 바뀌거나 `partial` 에 실패 건수가 있을 때 AFTER UPDATE 트리거가 `pg_net` 으로 한 번 POST 한다 — Deploy Hook 과 **같은 함수 모양**(`notify_vercel_rebuild` 의 Vault 읽기 · `missing/sent/error` 기록 · URL 지우기 · 예외가 나도 쓰기를 안 깬다). 결과는 `pipeline_runs.alert` 칸(`sent/missing/error` + request_id)에 남아 화면이 보여 준다. 스크립트가 보내면 터미널마다 웹훅 값이 있어야 하고(ADR-016 위반), 브라우저가 보내면 번들에 값이 들어간다. 메시지에는 **수와 스크립트 이름만** — 블로그 본문·장소명·URL 을 넣지 않는다(채널이 어디로 전달될지 모른다).
6. **"안 돌았다" 알림은 보류한다.** 실패는 이벤트라 트리거로 되지만, "7일째 수집이 없다" 는 이벤트가 없어 **스케줄러(pg_cron)** 가 필요하다. [todo/04](../todo/04-deploy-and-propagate.md) 가 pg_cron 을 "관측을 먼저 쌓는다" 고 보류한 결정을 그대로 잇는다 — 1~5 로 기록이 쌓이고 나서 "정말 잊어서 못 돌린 적이 있었나" 를 `pipeline_runs` 로 **확인한 뒤** 켠다. 그때까지 '안 돌았다' 는 `/admin/ops` 를 열었을 때만 보인다(그리고 `/admin` 머리글의 경고 띠에도 한 줄 올린다 — 운영자는 `/admin` 은 매번 연다).

## 왜 이것인가

- **이미 있는 패턴 셋을 그대로 쓴다.** 로그인·RLS(ADR-016·018), wide 레이아웃(`/admin/**`), Vault+pg_net(ADR-018 결정 9). 새로 배우는 장치가 표 하나와 rpc 하나뿐이라 운영자(=개발자 한 명)가 유지할 수 있다.
- **쓰는 사람이 쓴다.** 스크립트는 이미 운영자 세션(JWT)으로 붙어 있어 `is_operator()` RLS 를 그대로 통과한다. 시크릿이 하나도 늘지 않는다 — Slack 웹훅도 Vault 안에만 있고 Claude 는 값을 보지 않는다(Studio 에서 사용자가 `vault.create_secret`).
- **콘솔 요약을 구조화할 뿐이다.** `collect` 의 `수집 N건 (신규·기존·제외) · 소요`, `analyze` 의 `분석 N건 (...) · 토큰`, `apply` 의 `반영 N건 (보강·신규·실패)` 가 이미 있다. `stats` 는 그 수를 jsonb 로 넣는 것이고, 화면의 한 줄 요약은 그 문장을 그대로 다시 만든다 — 터미널과 화면이 같은 말을 한다.
- **"승인 N건 = 빌드 N번" 질문에 답이 생긴다**(todo/04 🙋). 7일 훅 집계 SQL 이 문서에만 있었는데, 그 수가 화면의 '재빌드' 칸에 선다.

## 하지 않은 것

- **GitHub Actions · Vercel Cron · 외부 모니터링(Sentry Cron Monitors 등)** — 실행 주체가 사용자 터미널이라 "안 돌았다" 를 바깥에서 알 방법이 없다. 바깥 장치는 **스케줄이 생겨야** 의미가 있고, 그 결정은 todo/README 🙋 "수집 주기" 다.
- **Slack 을 로그 저장소로** — 검색·집계가 안 되고, 채널 전달 범위를 통제할 수 없다(결정 5 의 메시지 제한과 같은 이유).
- ~~**Supabase Realtime 구독** — 화면은 열어 두고 보는 것이 아니라 열 때 보는 것이다. 60초 자동 새로고침과 손 새로고침이면 된다. 구독은 publishable 키의 realtime 권한을 또 열어야 한다.~~ **v2 에서 번복** — [ADR-024](ADR-024-local-worker-and-db-queues.md) 결정 6. 워커가 도는 동안 진행률을 봐야 해서 `workers` · `pipeline_runs` 둘만 구독한다. Realtime 은 RLS 를 지키므로 세션 없는 publishable 키로는 아무 행도 안 온다.
- **알림 채널 추상화**(Slack·Discord·이메일 중 고르기) — 지금 필요한 것은 하나다. Vault 의 이름 하나(`slack_webhook_url`)와 함수 하나라 바꾸는 날 바꾸면 된다.
- **`pull-db` 기록**(결정 2) · **스크립트 쪽 재시도**(기록이 안 되면 그냥 넘어간다).
- **차트 라이브러리** — 깔때기는 수와 가는 비율 막대로 충분하다. 운영자 한 명이 PC 에서 훑는 표다(ADR-018 결정 10 과 같은 자리).

## 결과

- 마이그레이션 둘이 늘어난다(`pipeline_runs` 표+RLS+GRANT+rpc 둘, Slack 트리거 함수). `narrow_grants` 뒤라 **grant 를 직접 붙여야 한다** — authenticated 에 select/insert/update(delete 없음), `id` 는 `uuid default gen_random_uuid()`(시퀀스 usage 를 안 줘도 insert 가 된다). **`rebuild_log` 와 달리 운영자가 행을 고칠 수 있다** — 저쪽은 definer 트리거만 쓰는 위조 방지 표고, 이쪽은 운영자 세션이 쓰는 운영자 자신의 기록이다. 화면에 고치는 버튼을 두지 않는 것은 UI 규칙이지 권한 경계가 아니다. [todo/05](../todo/05-security.md)·[ADR-016](ADR-016-secrets-by-login.md) 에 표 한 줄씩.
- 쓰기 스크립트 넷이 `scripts/lib/runLog.mjs`(DB 호출)를 부르고, 콘솔 요약 문장은 기존 `formatSummary` 를 `src/lib/runSummary.ts` 로 옮겨 화면과 **같은 함수**를 쓴다(스크립트가 `src/lib` 을 읽는 방향 — 선례 `review-candidates.mjs`). `analyze`·`apply` 의 `--dry-run` 은 기록하지 않는다(실제 쓰기가 없다). `error` 칸은 분류 문구만 — 원문엔 장소명이 섞일 수 있다.
- `/admin` 머리글에 `운영 현황 →` 링크 한 칸, 경고 띠에 "수집이 N일째 없어요" 가 들어갈 수 있다.
- Slack 웹훅 회전 절차가 Deploy Hook 회전 절차(todo/05) 옆에 하나 더 선다 — 모양은 같다.
- 열린 질문(🙋)은 [todo/15](../todo/15-ops-dashboard.md) 에: 임계값(수집 7일? 분석 backlog 며칠?), Slack 을 처음부터 켤지, pg_cron 을 언제 켤지.

## 관련

- [todo/15](../todo/15-ops-dashboard.md) — 진행 · [features/ops-dashboard.md](../features/ops-dashboard.md) — 화면이 무엇을 보여 주나(제안)
- [ADR-015](ADR-015-supabase-source-and-rebuild.md) 원본=Supabase · [ADR-016](ADR-016-secrets-by-login.md) 시크릿은 로그인으로 · [ADR-018](ADR-018-in-app-admin-review.md) 앱 안 `/admin`, 결정 9(Deploy Hook) · 10(밀도)
- [todo/04](../todo/04-deploy-and-propagate.md) 4b(`rebuild_log` · pg_cron 보류) · [todo/05](../todo/05-security.md) 훅 회전
- [architecture/data-pipeline.md](../architecture/data-pipeline.md)

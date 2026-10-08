# 20. Vercel 원격 워커 — `/admin` 버튼이 운영자 세션으로 `zgnn-worker` 함수를 불러, PC 가 꺼져 있어도 수집·분석이 돈다

> 최종 수정: 2026-10-08 (v2: ADR-028 **채택**. 서버도 로컬 `once` 의 한 바퀴를 돈다(버튼 셋 중 요청 줄은 하나뿐) — T1 은 배포 대신 로컬 번들 + 레포 밖 설치로, T4 는 원자 집기 + 심장으로 비키기, T5 는 홉 하나·사슬 조건을 다시 적었다)
> 이전 2026-10-08 (v1: 신설 — 설계·태스크. T0(실측)만 끝. 결정은 [ADR-028](../decisions/ADR-028-vercel-remote-worker.md) — **제안 상태**라 T1 전에 🙋 채택이 먼저)

**한 줄:** 「추가 수집」·「재분석」·「저수지 N건 분석」 이 지금처럼 DB 에 흔적을 남기고(`collect_requests` · `requested_at` · `pipeline_requests`), 이어서 `/api/worker/run` 을 운영자 JWT 로 부른다.
함수는 로컬 `once` 와 같은 한 바퀴를 분석 하나·글 최대 5건까지 돈다(홉). 남았고 줄였으면 같은 JWT 로 자기를 다시 부른다. 로컬 워커는 그대로 남아 같은 큐를 보고, 둘은 `workers` 심장으로 비킨다(ADR-028 결정 10).

규약은 [15](15-ops-dashboard.md) 와 같다 — 한 태스크 = 한 커밋, 태스크마다 파일·수용 기준·검증. `🧑` 는 사용자 터미널 몫, `🙋` 는 사용자가 정할 것.

## 순서와 의존

```
T0 실측 ✅ ─▶ ADR-028 채택 ✅ ─▶ T1 scripts 공유 번들 실측 ─▶ T2 자식 env · T3 세션 주입 · T4 원자 집기 ─▶ T5 /api/run ─▶ T6 rewrite ─▶ T7 /admin 깨우기 ─▶ 🧑 T8 env·정리 ─▶ T9 실측
```

T2~T4 는 서로 독립이라 아무 순서나 된다. T5 는 셋 모두에 기댄다.

## 단계와 상태

### T0. Vercel 함수 안 `claude -p` 실측
- [x] ✅ 2026-10-08 c39beaf — `worker/api/probe.mjs`. 플랫폼 패키지 바이너리를 직접 실행하고 `includeFiles: node_modules/@anthropic-ai/**` 로 싣는다(nft 는 `spawn` 대상을 모른다).
  `HOME=/tmp/claude-home`. 결과는 ADR-028 「맥락」 표. 토큰은 처음 두 번 49자로 잘렸다 — 숨김 입력이 줄바꿈을 Enter 로 받는다. `pbpaste | tr -d '[:space:]' | vercel env add …` 로 108자.

### T1. 번들이 레포 밖에서 import 되는지(ADR-028 결정 9)
- [x] ✅ 2026-10-08 로컬 — 번들 1.1MB(입력 86). 레포 밖 빈 폴더에 `worker/package.json` 만 설치(`@anthropic-ai/claude-code` 둘)하고 import → 단계 셋·`createWorkerCycle` 이 실리고 `PROMPT_VERSION` 이 같다. `sessionKeychain` 은 import 만으로 `security` 를 부르지 않는다.
  단계 스크립트 끝의 `isDirectRun(import.meta.url)` 은 한 파일로 묶이면 셋이 같은 URL 이라 `node worker/api/run.mjs` 한 번에 셋이 다 돈다 — 번들에서는 늘 거짓인 가짜로 바꿔 끼운다. Vercel 위 확인은 T5 뒤.
- `pnpm worker:build`(`scripts/build-worker.mjs`, esbuild) — `worker/entry/run.mjs` 와 거기서 닿는 `scripts/`·`src/lib/` 를 `worker/api/run.mjs` 한 파일로. `@anthropic-ai/*` 만 밖에 둔다.
  수용: 번들과 `worker/package.json` 을 **레포 밖 빈 폴더**(scratchpad)에 두고 `npm install` 뒤 `node -e "import('./api/run.mjs')"` 가 된다(루트 `node_modules` 에 기대지 않는 진짜 해석).
  번들이 단계 진입점 넷(`collect-blog`·`analyze-candidates`·`apply-approved`·`workerCycle`)을 품는지, `sessionKeychain` 을 import 만으로 `security` 를 부르지 않는지.
  Vercel 위에서의 확인(`vercel deploy`, 프리뷰)은 🙋 배포 허락을 받아 T5 뒤에 한 번.

### T2. `claudeChildEnv` 에 워커 런타임 한정 토큰
- [x] ✅ 2026-10-08 4bfa257 — `scripts/analyze/extractPlaces.mjs` — `ZGNN_WORKER_RUNTIME=vercel` 일 때만 `CLAUDE_CODE_OAUTH_TOKEN` 을 넘긴다. `HOME`(`/tmp/claude-home`)·`PATH`(플랫폼 바이너리 폴더)는 진입점이 프로세스 env 에 적는다.
  수용: 테스트 둘 — 런타임 표식 없으면 토큰이 빠진다(지금 동작 유지), 있으면 들어간다.

### T3. 세션 주입 진입점
- [x] ✅ 2026-10-08 154eac3 `injectSession(token) → restore` — `scripts/lib/supabaseClient.mjs` — 단계 스크립트가 스스로 부르는 `createSupabase()` 가 키체인 대신 주입된 토큰을 읽게 하는 진입점(모듈 상태 하나). 주입 중이면 실패를 `process.exit` 대신 **throw**(함수 안에서 exit 하면 인스턴스가 죽는다).
  모듈 상태라 한 인스턴스에서 두 요청이 겹치면 안 된다 — T5 의 인스턴스 바쁨 표식이 막는다.
  수용: 만료·형식·30분 앞당김·service 키 트립와이어 테스트가 주입 경로에서도 같다. 주입 중엔 키체인을 부르지 않는다.

### T4. `pipeline_requests` 원자 집기 + 심장으로 비키기
- [x] ✅ 2026-10-08 e5227ef — 원격 실측: 같은 줄 두 번째 조건부 update 0행, 잔여 0(`db query` 는 결과로 첫 문장만 돌려줘 DO 블록 + `raise exception` 롤백으로 셌다).
  `scripts/lib/workerQueue.mjs` — 집기를 줄마다 `update(taken).eq('id').eq('status', 관찰한 값)`(오래된 `taken` 은 `taken_at` 도) `.select('id')` 로. 집힌 줄만 돌린다 — 요청 줄로 선 단계에서 하나도 못 집었으면 그 단계를 건너뛴다.
  로컬 워커(`scripts/worker.mjs`)는 `host = 'vercel'` 행이 60초 안에 뛰었고 `idle` 이 아니면 그 바퀴를 넘긴다(ADR-028 결정 10).
  수용: 가짜 클라이언트 테스트 + 원격 롤백 실측(`begin; update … returning; update … returning; rollback;` — 두 번째가 0행).

### T5. 홉 하나(`scripts/lib/workerRemote.mjs`) + 진입점(`worker/entry/run.mjs`)
- [x] ✅ 2026-10-08 — 레포 밖 번들 실측: 토큰 없음 401 · 가짜 토큰 401 · GET 405(darwin 이라 linux 바이너리 못 찾음 한 줄, import 는 된다). 테스트 22.
  명세와 다르게: 「저수지 N건」 단계의 진척은 `code === 0` 이다(N≤5 의 마지막 홉도 진척이어야 뒤따르는 반영·다음 요청이 이어진다 — 성공은 줄을 닫거나 줄이므로 돌지 않는다).
  한계 둘: ① `pipeline_requests` kind `collect`(키워드 전체 수집)는 서버에서 `collect/keywords.json` 을 `import.meta.url` 로 읽다 ENOENT — 그 요청을 넣는 화면이 없고 서버는 정기 수집을 안 하므로 로컬 몫으로 둔다.
  ② 홉 안 단계 사이에 심장이 잠깐 `idle` 이 된다 — 그 순간 로컬이 폴링하면 둘이 돌 수 있다(결정 10 이 받아들인 틈, `phase` check 에 '홉 중' 값이 없다).
- `POST` 만. Bearer → `auth.getUser` → `rpc('is_operator')`(401·403 이면 Claude 0회) → 로컬 행이 살아 있으면 200 "로컬 워커가 맡아요" → 인스턴스가 바쁘면 202 "이미 도는 중" → 202 + `waitUntil(hop())`.
  `hop` = 세션 주입 · 심장(`host: 'vercel'`) · `createWorkerCycle({ resident: false })` 를 분석 상한 5(`planCycle` 의 `analyzeCap` — 「저수지 N건」 은 N−5 를 적어 되돌린다)로, 분석 단계 하나 뒤 멈춤 → 심장 `idle` →
  다시 세어 **남았고 · 줄였고 · JWT 실효가 한 홉(5분) 이상 남았으면** 같은 토큰으로 `https://$VERCEL_PROJECT_PRODUCTION_URL/api/run` 을 부른다(배포 URL 은 Deployment Protection 뒤라 안 된다).
  한도(`onRateLimit`)는 요청을 `queued` 로 되돌리고 사슬을 멈춘다. `maxDuration: 300`, `memory: 2048`. probe 는 이 태스크에서 지운다.
  수용: 순수 부분(사슬 조건·응답 고르기) 테스트 · 번들로 토큰 없음 401 · 가짜 토큰 401.

### T6. 사이트 rewrite
- [x] 2026-10-08 — rewrite 와 `NEXT_PUBLIC_WORKER_URL`(`next.config.mjs`: 프로덕션 빌드(`VERCEL_ENV=production`)면 `/api/worker/run`, 아니면 빈 값 — env 로 덮을 수 있다). 프로덕션 401 확인은 T9.
  로컬 `vercel build --prod` 로는 못 봤다 — pnpm 12 가 `package.json` 의 `pnpm.onlyBuiltDependencies` 를 안 읽어 설치가 `ERR_PNPM_IGNORED_BUILDS` 로 멈춘다(이 변경 전부터, Vercel 은 pnpm 10 이라 무관 — NOW 「발견」).
- 루트 `vercel.json` `rewrites: [{ source: '/api/worker/:path*', destination: 'https://zgnn-worker.vercel.app/api/:path*' }]`(도메인은 배포 뒤 확정).
  로컬 dev(7727)는 Next rewrite 가 없으니 `/admin` 이 `NEXT_PUBLIC_WORKER_URL` 이 있을 때만 부른다. 없으면 깨우지 않고 로컬 워커에 맡긴다.
  수용: 프로덕션에서 `/api/worker/run` 이 401(토큰 없이). 정적 페이지 응답 헤더는 그대로.

### T7. `/admin` 깨우기
- [x] ✅ 2026-10-08 6d7964e — `/admin` 엔 refresh token 이 없어(ADR-016) 새로 고치는 대신 **50분 미만이면 안 깨우고 재로그인 안내**(`tooShortToWake`). 깨울 주소가 있는 빌드에선 "로컬 워커가 없어요 — 처리되지 않아요" 띠를 내린다(서버가 받으니 거짓). 깨우기는 호출처 여섯(세 버튼 + `prepareReanalyze` 를 부르는 셋).
- `src/lib/adminRequests.ts` 등 요청 넣는 세 곳 — insert 성공 뒤 `wakeRemoteWorker(client)`. 남은 시간이 **30분(서버의 앞당김) + 사슬 여유**보다 적으면 `refreshSession()` 뒤에 보낸다
  (30분만 보면 31분 남은 토큰이 서버에서 1분짜리가 되어 첫 홉에서 끊긴다).
  「저수지 분석」 버튼은 로컬 워커가 없어도 서버 워커가 있으면 켠다. 로컬 배지(`workerHealth`)는 `vercel` 행을 세지 않는다.
  **실패해도 요청은 그대로 남는다**(로컬 워커가 집는다). 화면엔 한 줄만: "서버 워커를 못 깨웠어요 — 로컬 워커가 이어 받아요".
  수용: 순수 부분(보낼지·새로 고칠지) 테스트. Chrome 으로 버튼 → `/admin/ops` 배지 `vercel · 분석 중`.

### T8. 🧑 env 와 정리
- [ ] 🧑 `cd worker && pbpaste | tr -d '[:space:]' | vercel env add CLAUDE_CODE_OAUTH_TOKEN production --sensitive`, 네이버 둘도 같은 식(`~/.zgnn-naver.env` 의 값).
- [ ] 🧑 프리뷰의 `CLAUDE_CODE_OAUTH_TOKEN` 지우기(`vercel env rm … preview`). Settings → Deployment Protection 의 **bypass 토큰**(T0 에 `vercel curl` 이 자동 생성) 지우기.
- [x] 2026-10-08 ADR-016 v12 · ADR-024 v3 · ARCHITECTURE v25 · data-pipeline v59 · CLAUDE.md(표 한 줄 + 「조용히 깨지는 것들」 의 단계 스크립트 `process.exit` 금지) · ADR-028 채택(v2).
- ADR-016 「서버에 두는 장기 값」 절 · ADR-024 「하지 않은 것」 번복 표시 · CLAUDE.md 표 한 줄 · ADR-028 상태 → 채택.

### T9. 실측
- [ ] PC 의 `pnpm data` 를 끈 채로: 추가 수집 1건 · 재분석 1건 · 저수지 6건(사슬 두 번). 로컬 워커를 켠 채로 같은 것을 해서 한 줄을 한 곳만 집는지.

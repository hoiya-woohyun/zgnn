# 20. Vercel 원격 워커 — `/admin` 버튼이 운영자 세션으로 `zgnn-worker` 함수를 불러, PC 가 꺼져 있어도 수집·분석이 돈다

> 최종 수정: 2026-10-09 (v4: T9 첫 실측 — 헤더 전달·첫 성공 경로 확인(4홉 · 글 20 · 후보 4). 5홉째 Vercel 508 로 사슬이 끊겨 `MAX_HOPS` 12 → 4([BUG-016](../bugs/BUG-016-worker-chain-508-loop-detected.md)) — 워커 재배포 전)
> 이전 2026-10-08 (v3: T9 는 develop → main 뒤에만 된다 — 깨우기 주소가 프로덕션 사이트 빌드에만 있다. T9 에 rewrite·헤더 전달·첫 성공 경로 로그 확인을 더했다)
> 이전 2026-10-08 (v2: ADR-028 **채택**. 서버도 로컬 `once` 의 한 바퀴를 돈다(버튼 셋 중 요청 줄은 하나뿐) — T1 은 배포 대신 로컬 번들 + 레포 밖 설치로, T4 는 원자 집기 + 심장으로 비키기, T5 는 홉 하나·사슬 조건을 다시 적었다)
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
  ② ~~홉 안 단계 사이에 심장이 잠깐 `idle`~~ → 보안 리뷰 반영(아래)으로 닫혔다. 남은 틈은 홉 **시작** 때 `startHeartbeat` 가 행을 `idle` 로 쓰고 첫 단계까지 수백 ms — 로컬이 그 순간 폴링하면 둘이 돈다(결정 10 이 받아들인 틈).
- [x] 2026-10-08 보안 리뷰(MEDIUM 종합 · 인증 우회·토큰 유출 없음) 반영: [HIGH] 사슬 폭주 — 검색이 실패해 queued 로 남는 추가 수집 요청 하나로 몇 초짜리 홉이 JWT 실효(~11시간) 내내 자기를 부를 수 있었다. 진척은 수가 줄었거나 요청 줄을 닫았을 때만, 깊이 상한 `MAX_HOPS = 12`(`X-Zgnn-Hop` 헤더).
  [MEDIUM] 인스턴스 간 겹침 — 서버 행이 바쁘면 202 busy, 홉 동안 서버 심장은 idle 로 안 내려간다(마지막 close 만). [LOW] 310초 넘은 바쁨은 낡은 것으로 · busy 로 버린 깨우기는 홉 끝에서 한 번 더 · 실효 없는 토큰은 네트워크 전에 401.
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
- [x] 2026-10-08 env 다섯(`CLAUDE_CODE_OAUTH_TOKEN` · `NAVER_CLIENT_ID`·`_SECRET` · `NAVER_MAP_CLIENT_ID`·`_SECRET`) Production·Sensitive, 프리뷰·개발엔 Claude 토큰 없음(`vercel env ls` 이름만) → `--prod` 재배포(dpl_HjDkvprY…) · 401·401·405.
- [x] 2026-10-08 프로덕션 배포(env 없음) — 이전 배포가 다 지워진 프로젝트라 첫 `vercel deploy` 가 프리뷰가 아니라 **프로덕션**으로 갔다(`zgnn-worker.vercel.app` 별칭). 공개 URL: 토큰 없음 401 · 가짜 토큰 401 · GET 405 · `entry/`·`package.json`·옛 probe 404. 보안 리뷰 반영본으로 다시 `--prod`(dpl_GduH5VCc…).
- [x] 2026-10-08 🧑 `claude setup-token` 값을 복사한 뒤 `cd worker && pbpaste | tr -d '[:space:]' | vercel env add CLAUDE_CODE_OAUTH_TOKEN production --sensitive`.
- [x] 2026-10-08 🧑 네이버 키 **넷**(검색 둘 + NCP Maps 둘)을 홈 파일에서 값을 찍지 않고 — 저장소의 파서(`parseNaverEnv`)로 한 개씩 꺼내 파이프로 넣는다:
  `cd ~/Develop/woohyun/zgnn && for k in NAVER_CLIENT_ID NAVER_CLIENT_SECRET NAVER_MAP_CLIENT_ID NAVER_MAP_CLIENT_SECRET; do node --input-type=module -e "import {parseNaverEnv,NAVER_ENV_FILE} from './scripts/lib/naverEnvFile.mjs'; import {readFileSync} from 'node:fs'; process.stdout.write(parseNaverEnv(readFileSync(NAVER_ENV_FILE,'utf8'))[process.argv[1]] ?? '')" "$k" | vercel env add "$k" production --sensitive --cwd worker; done`
- [x] 2026-10-08 프리뷰 Claude 토큰은 `vercel env ls` 에 없다(이름만 확인). 자동화 bypass(T0 의 `vercel curl` 이 16:00 에 만든 것, 1개)는 에이전트가 `vercel api` 로 회수 — 키는 조회 결과에서 회수 요청 본문으로 파이프로만 넘겨 찍지 않았다, 다시 조회 0개.
  ⚠️ `vercel curl` 로 보호된 배포를 부르면 bypass 가 **저절로 다시 생긴다** — 프리뷰 확인에 썼으면 끝나고 같은 식으로 회수한다.
- 🧑 프리뷰의 `CLAUDE_CODE_OAUTH_TOKEN` 지우기(`vercel env rm … preview`). Settings → Deployment Protection 의 **bypass 토큰**(T0 에 `vercel curl` 이 자동 생성) 지우기.
- [x] 2026-10-08 ADR-016 v12 · ADR-024 v3 · ARCHITECTURE v25 · data-pipeline v59 · CLAUDE.md(표 한 줄 + 「조용히 깨지는 것들」 의 단계 스크립트 `process.exit` 금지) · ADR-028 채택(v2).
- ADR-016 「서버에 두는 장기 값」 절 · ADR-024 「하지 않은 것」 번복 표시 · CLAUDE.md 표 한 줄 · ADR-028 상태 → 채택.

### T9. 실측 — **develop → main 뒤에만 된다**
깨우기 주소(`NEXT_PUBLIC_WORKER_URL`)는 `main` 에서 나온 프로덕션 사이트 빌드에만 들어간다. 로컬 `/admin`(7727)은 빈 값이라 깨우지 않고, 워커 주소를 직접 넣어도
다른 출처라 CORS 가 없어 막힌다(사전 요청 OPTIONS 가 405). 그래서 순서는 🧑 env → 에이전트 `--prod` 재배포 → 🙋 develop → main(다른 세션 커밋도 실려 나간다) → 이것.
- [x] 2026-10-08 dda522e 배포 뒤 — rewrite: `curl -X POST https://zgnn.vercel.app/api/worker/run/` 이 워커의 401 JSON(icn1 → iad1 경유), 슬래시 없는 주소도 308 을 따라 401.
- rewrite: `curl -X POST https://zgnn.vercel.app/api/worker/run/` 이 401(로컬 `vercel build` 로 못 본 것 — T6).
  2026-10-08 첫 합치기(f95985d)에서 **308 → 404** — `trailingSlash: true` 로 `/run` 이 `/run/` 으로 리다이렉트되고, rewrite 는 끝 슬래시까지 엄격하게 맞춰 `/api/worker/:path*` 가 `/run/` 을 놓쳤다.
  슬래시 붙은 규칙을 더하고 깨우기 주소를 `/api/worker/run/` 로.
- [x] 2026-10-08 헤더 전달 — 18:41 첫 깨우기부터 워커 로그에 `Supabase 인증: 요청 세션(JWT — operators RLS, 서버 워커)`. 운영자 JWT 가 rewrite 를 지나 왔다
  (로컬 dev 는 깨우기 주소가 비고, 다른 출처에서 직접 부르면 CORS 가 막으니 다른 길이 없다).
- [x] 2026-10-08 첫 성공 경로 — 18:49 깨우기 하나로 4홉 · 글 20건 · 후보 4(신규 2 · 기존 장소 갱신 2, 제안 패스 1) · 실패 0. 홉당 5건 87~115초(글당 ~20초).
  `promptVersion` `25f0a64c`·모델이 로컬과 같다. Vercel 위 linux `claude` 를 찾았고, 네이버 검색 축(채택 7/8)·홈페이지 카드·교차점검이 돌았다.
  - 18:42~43 세 홉은 Claude `401 Invalid bearer token` 로 글 하나에서 멈췄다(진척 없음 → 사슬도 멈춤, 설계대로). 18:46 같은 소스로 다시 묶어 18:47 재배포한 뒤로는 없다.
    env(`CLAUDE_CODE_OAUTH_TOKEN`) 생성 시각(18:25)이 실패한 배포보다 앞이라 **원인 미확인** — 다시 보이면 토큰 값(줄바꿈·잘림)부터 본다.
  - **5홉째 호출이 508**(Vercel 루프 감지) → 요청 글 37건 · 「저수지 10건」 이 `queued` 로 남은 채 화면은 끝난 것처럼 보였다. `MAX_HOPS` 12 → 4, 사슬 실패 로그를 갈랐다
    ([BUG-016](../bugs/BUG-016-worker-chain-508-loop-detected.md)). **워커 `--prod` 재배포 전에는 프로덕션이 옛 값**(🙋 배포).
- [ ] 브라우저에서 새로 깨우면 깊이가 0 부터 다시 세어지는가 — 남은 37건이 있을 때 `/admin` 버튼 하나 → 다시 4홉이 돌면 성립, 첫 홉부터 508 이면 감지가 깊이가 아니라 시간·빈도다(설계 다시).
  성립하면 `/admin` 이 "서버가 쉬는데 일이 남았다" 를 보고 다시 깨우는 길(또는 「이어서」 버튼)을 연다.
- [ ] NCP Maps(주소→좌표) 축 — 20건 동안 호출 0(주소만 있고 상호 검색이 실패한 글이 없었다). 그런 글이 지나갈 때 `Geocoding: … 호출 N` 이 0 이 아니고 요청실패 0 인지.
- [ ] PC 의 `pnpm data` 를 끈 채로 남은 것: 「저수지 10건」(사슬) → `/admin/ops` "서버 · 분석 중" · `pipeline_runs` 행 — 추가 수집 2건·요청 글은 위 첫 성공 경로에서 PC 를 끈 채 돌았다. 로컬 워커를 켠 채로 같은 것 → 응답이 `local` 이고 서버 배지가 안 뜨는지.
- 알려 둔 틈: 300초를 넘겨 버려진 홉이 있던 인스턴스에서 새 홉이 시작하면(310초 규칙), 버려진 분석의 잠금 파일(`/tmp/zgnn-data-analyze.lock`)이 **같은 pid** 라 산 것으로 보여 그 인스턴스의 분석이 매번 1 로 끝난다 — 요청은 attempts 를 태우고 3번째에 done(막히는 쪽 실패). 보이면 인계 때 자기 pid 잠금을 지운다.

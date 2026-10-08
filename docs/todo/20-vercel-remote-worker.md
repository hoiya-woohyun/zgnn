# 20. Vercel 원격 워커 — `/admin` 버튼이 운영자 세션으로 `zgnn-worker` 함수를 불러, PC 가 꺼져 있어도 수집·분석이 돈다

> 최종 수정: 2026-10-08 (v1: 신설 — 설계·태스크. T0(실측)만 끝. 결정은 [ADR-028](../decisions/ADR-028-vercel-remote-worker.md) — **제안 상태**라 T1 전에 🙋 채택이 먼저)

**한 줄:** 「추가 수집」·「재분석」·「저수지 N건 분석」 이 지금처럼 `pipeline_requests` 에 한 줄을 넣고, 이어서 `/api/worker/run` 을 운영자 JWT 로 부른다.
함수는 그 줄을 원자적으로 집어 글 최대 5건을 돌린다. 남으면 같은 JWT 로 자기를 다시 부른다. 로컬 워커는 그대로 남아 같은 큐를 본다.

규약은 [15](15-ops-dashboard.md) 와 같다 — 한 태스크 = 한 커밋, 태스크마다 파일·수용 기준·검증. `🧑` 는 사용자 터미널 몫, `🙋` 는 사용자가 정할 것.

## 순서와 의존

```
T0 실측 ✅ ─▶ 🙋 ADR-028 채택 ─▶ T1 scripts 공유 번들 실측 ─▶ T2 자식 env · T3 세션 주입 · T4 원자 집기 ─▶ T5 /api/run ─▶ T6 rewrite ─▶ T7 /admin 깨우기 ─▶ 🧑 T8 env·정리 ─▶ T9 실측
```

T2~T4 는 서로 독립이라 아무 순서나 된다. T5 는 셋 모두에 기댄다.

## 단계와 상태

### T0. Vercel 함수 안 `claude -p` 실측
- [x] ✅ 2026-10-08 c39beaf — `worker/api/probe.mjs`. 플랫폼 패키지 바이너리를 직접 실행하고 `includeFiles: node_modules/@anthropic-ai/**` 로 싣는다(nft 는 `spawn` 대상을 모른다).
  `HOME=/tmp/claude-home`. 결과는 ADR-028 「맥락」 표. 토큰은 처음 두 번 49자로 잘렸다 — 숨김 입력이 줄바꿈을 Enter 로 받는다. `pbpaste | tr -d '[:space:]' | vercel env add …` 로 108자.

### T1. `worker/` 가 `../scripts` 를 import 해 번들되는지
- [ ] 프로젝트 Root Directory = `worker`, 레포 루트에서 `vercel deploy`. "Include files outside the root directory" 가 켜져 있어야 `../scripts/analyze/*.mjs` 가 실린다.
  수용: probe 가 `import { PROMPT_VERSION } from '../../scripts/analyze/extractPlaces.mjs'` 의 값을 돌려준다. 의존성(`@supabase/supabase-js` 등)은 `worker/package.json` 에 다시 적는다 — 루트 pnpm 잠금과 따로 논다.
  안 되면: `worker/` 빌드 단계에서 필요한 파일을 복사(`buildCommand`). 실패 시 ADR-028 결정 1 의 각주로.

### T2. `claudeChildEnv` 에 워커 런타임 한정 토큰
- [ ] `scripts/analyze/extractPlaces.mjs` — `ZGNN_WORKER_RUNTIME=vercel` 일 때만 `CLAUDE_CODE_OAUTH_TOKEN` 을 넘긴다. `HOME` 은 `/tmp/claude-home`(쓰기 가능한 곳).
  수용: 테스트 둘 — 런타임 표식 없으면 토큰이 빠진다(지금 동작 유지), 있으면 들어간다. 로컬에서 env 에 토큰만 있으면 여전히 auth 로 멈춘다.

### T3. 세션 주입 진입점
- [ ] `scripts/lib/supabaseClient.mjs` — `createSupabaseWithToken(token)`(이름은 구현 때). `resolveSupabaseCredentials({ readSession: () => token })` 를 그대로 타고, 실패하면 `process.exit` 대신 **throw** 한다(함수 안에서 exit 하면 인스턴스가 죽는다).
  수용: 만료·형식·30분 앞당김·service 키 트립와이어 테스트가 주입 경로에서도 같다.

### T4. `pipeline_requests` 원자 집기
- [ ] `scripts/lib/workerQueue.mjs` — `takeRequest(client, id)` = `update({status:'taken', taken_at}).eq('id', id).eq('status','queued').select()`. 0행이면 남이 집은 것이다.
  로컬 워커(`pickRequests` 뒤)도 이걸 쓴다. 수용: 롤백 실측 — 같은 행을 두 클라이언트가 동시에 집으면 하나만 1행.

### T5. `worker/api/run.mjs`
- [ ] `POST` 만. 순서: Bearer → `auth.getUser` → `rpc('is_operator')` → 202 + `waitUntil(work())`.
  `work` = 집기 → 단계 `main(argv)` 를 `--limit 5` 로 → `workers` 심장(`host: 'vercel'`) → 남으면 `queued` 로 되돌리고 같은 토큰으로 `fetch(self)`. JWT 실효가 끝나면 멈추고 줄은 `queued` 로 남긴다.
  한도(`claudeResetAt`)면 `attempts` 규칙대로 되돌리고 `phase: rate-limited`.
  수용: 토큰 없음 401 · 비운영자 403(Claude 호출 0 — 로그로 확인) · 운영자는 202 뒤 `pipeline_runs` 한 행.
  `maxDuration: 300`, `memory: 2048`. probe 는 이 태스크에서 지운다.

### T6. 사이트 rewrite
- [ ] 루트 `vercel.json` `rewrites: [{ source: '/api/worker/:path*', destination: 'https://zgnn-worker.vercel.app/api/:path*' }]`(도메인은 배포 뒤 확정).
  로컬 dev(7727)는 Next rewrite 가 없으니 `/admin` 이 `NEXT_PUBLIC_WORKER_URL` 이 있을 때만 부른다. 없으면 깨우지 않고 로컬 워커에 맡긴다.
  수용: 프로덕션에서 `/api/worker/run` 이 401(토큰 없이). 정적 페이지 응답 헤더는 그대로.

### T7. `/admin` 깨우기
- [ ] `src/lib/adminRequests.ts` 등 요청 넣는 세 곳 — insert 성공 뒤 `wakeRemoteWorker(session)`. 남은 시간이 30분보다 적으면 `refreshSession()` 뒤에 보낸다.
  **실패해도 요청은 그대로 남는다**(로컬 워커가 집는다). 화면엔 한 줄만: "서버 워커를 못 깨웠어요 — 로컬 워커가 이어 받아요".
  수용: 순수 부분(보낼지·새로 고칠지) 테스트. Chrome 으로 버튼 → `/admin/ops` 배지 `vercel · 분석 중`.

### T8. 🧑 env 와 정리
- [ ] 🧑 `cd worker && pbpaste | tr -d '[:space:]' | vercel env add CLAUDE_CODE_OAUTH_TOKEN production --sensitive`, 네이버 둘도 같은 식(`~/.zgnn-naver.env` 의 값).
- [ ] 🧑 프리뷰의 `CLAUDE_CODE_OAUTH_TOKEN` 지우기(`vercel env rm … preview`). Settings → Deployment Protection 의 **bypass 토큰**(T0 에 `vercel curl` 이 자동 생성) 지우기.
- [ ] ADR-016 「서버에 두는 장기 값」 절 · ADR-024 「하지 않은 것」 번복 표시 · CLAUDE.md 표 한 줄 · ADR-028 상태 → 채택.

### T9. 실측
- [ ] PC 의 `pnpm data` 를 끈 채로: 추가 수집 1건 · 재분석 1건 · 저수지 6건(사슬 두 번). 로컬 워커를 켠 채로 같은 것을 해서 한 줄을 한 곳만 집는지.

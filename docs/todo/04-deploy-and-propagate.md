# 4. Vercel 배포 · 빌드 시 DB 읽기 · 승인되면 재빌드

> 최종 수정: 2026-10-06 (v12: **재빌드를 뒤쪽에서 합친다**(`20261006130000_rebuild_coalesce.sql`, ADR-018 결정 9 v7) — 트리거는 `queued` 한 줄만,
> pg_cron `flush-vercel-rebuild` 가 매분 60초 조용한 줄을 훅 **한 번**으로. 🙋 "승인 N건 = 빌드 N번" 이 닫혔다. 확인 절차에 `queued → sent` 를 더했다)
> 이전 2026-10-01 (v11: `develop` 자동 Preview 도 다시 껐다 — 확인은 로컬에서, 미리보기가 필요할 때만 대시보드 **Create Deployment** 로
> `develop` 을 손으로 띄운다. `main` 자동 배포는 그대로. 무료 플랜에서도 브랜치 고정 주소 `zgnn-git-<branch>-…vercel.app` 가 생기는 것은 확인했다
> (Preview 는 Vercel 로그인 보호로 302))
> 이전 (v10: `develop` 만 Preview 를 다시 켰다)
> 이전 (v9: **Preview 자동 배포를 껐다** — `vercel.json` 의 `git.deploymentEnabled` 를 `main` 만 `true`. 배포 기록 대부분이
> 에이전트가 올린 `claude/*` 브랜치의 Preview 였다. `main` push·Deploy Hook·`vercel` CLI 는 그대로 돈다)
> 이전 (v8: **열려 있던 두 항목을 닫는 장치를 깔았다**(`20260929121000_rebuild_log.sql`).
> ① `status_code` 가 null 이면 타임아웃과 죽은 URL 이 구분되지 않던 문제 → 호출을 `public.rebuild_log` 에 남기고 `public.rebuild_status()`(운영자 전용)가
> 결과를 그 표로 **옮겨 적는다**(pg_net 의 응답은 오래 남지 않는다). `/admin` 머리글이 그것을 한 줄로 말한다 — 4xx 면 "훅이 폐기된 것 같다" 고 짚는다.
> ② 🙋 "승인 N건 = 빌드 N번" → **게시 집합이 바뀌는 변경만** 훅을 부른다(초안·내린 곳만 고치는 UPDATE 는 만들어지는 사이트가 한 바이트도 다르지 않다).
> 소프트 삭제([ADR-018](../decisions/ADR-018-in-app-admin-review.md) 결정 6)가 그 갈래를 실제로 만들었다. 스케줄러(pg_cron)는 넣지 않았다 — 관측을 먼저 쌓는다)
> 이전 (v7: **4b 가 끝났다 — 전 구간 실측.** `places` 한 행을 건드리니 `net._http_response` 에 **201**(`{"job":{"state":"PENDING"}}`)이 찍히고
> Vercel 에 프로덕션 빌드가 섰다. 두 가지가 드러났다 — (1) **Deploy Hook 은 2026-09-17 에 이미 만들어져 있었다**(이름 `auto deploy`, 브랜치 `main`).
> 트래커가 그걸 "발급해야 할 것" 으로 열어 둔 채였다. (2) pg_net 기본 타임아웃 5초 안에 Vercel 이 응답하지 못해(실측 4.7초) 첫 시도는 `status_code` 가
> **null** 이었다 — 빌드는 정상으로 걸렸지만 성공과 실패를 구분할 수 없었다. 15초로 올렸다(`20260929030000`))
> 이전 (v6: **4b 의 DB 쪽 배선을 깔았다** — 대시보드가 아니라 마이그레이션(`20260929023000_vercel_rebuild_webhook.sql`)으로.
> `places` 변경 → `notify_vercel_rebuild()` → Vault 의 `vercel_deploy_hook` 으로 POST. **URL 은 레포에 없다** — 운영자가 Vault 에 한 줄 넣는다.
> 넣기 전까지 함수는 no-op 이라 지금 상태로도 쓰기가 멀쩡하다(롤백 트랜잭션으로 실측). 사용자 몫은 두 단계로 줄었다: Deploy Hook 발급 · Vault 한 줄.
> 대시보드에서 "Database → Webhooks" 를 못 찾는 게 정상이다 — **Integrations → Webhooks** 로 옮겨졌고, 이 프로젝트는 그 기능을 켠 적이 없었다(실측: `supabase_functions` 스키마 없음))
> 이전 (v5: 4a 의 마지막 열린 칸을 닫았다 — `main` `66b15e1` 프로덕션 Ready 로 `outputDirectory` 함정 확인 완료, `data:pull` 스냅샷 diff 없음. 4b 는 그대로 남았다)
> 이전 (v4: **(c) Actions 폐지** 반영 — 스냅샷 PR 자동화·`workflow_dispatch` 수동 경로·"수집 잡 끝에 Deploy Hook" 대안이 소멸. 4a 의 env 삭제 확인 완료(프로덕션 anon 86·15). 4b 웹훅은 그대로 목표)
> 이전 (v3: 빌드의 `data:pull` 은 service_role 이 아니라 publishable(anon) 키로 published 만 읽는다(ADR-016 v4) — Vercel env 에서 Supabase 시크릿이 사라진다)
> 이전 (v2: 4a 완료 — `vercel.json` 빌드 명령·env 확인, `outputDirectory` 함정(BUG-005) 수정. 4b 는 아직)
> 이전 (v1: 신설)
> 상태: 4a·**4b 모두 끝났다**(2026-09-29 전 구간 실측: `places` 변경 → 트리거 → 201 → 프로덕션 빌드). 열린 관찰 항목은 "승인 N건 = 빌드 N번" 하나뿐이다. 선행: 4a 는 [01](01-schema-and-seed.md), 4b 는 [03](03-analyze-and-review.md). 재빌드 방식은 [ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md) §2 로 확정.

## 왜 런타임 fetch 가 아니라 재빌드인가

앱은 `output: 'export'` 라 서버가 없고, 프리캐시가 라우트 95개를 통째로 든다. 데이터를 빌드 밖으로 빼면
"런타임 fetch 없음"·오프라인·`revisionHash` 가 전부 다시 설계 대상이 된다([ADR-011 "결과"](../decisions/ADR-011-app-gate-and-supabase.md)).
빌드 **안에서** DB 를 읽어 `src/data/*.json` 을 만들면 그 뒤는 지금과 완전히 같다 —
`revisionHash` 는 `src/` 를 해싱하므로 **데이터가 바뀌면 프리캐시 revision 도 바뀐다.** 이게 이 방식의 핵심 이점이다.

반영 지연은 빌드 시간(1~2분)이다. 하루 몇 건 승인하는 서비스에 충분하다.

## 4a. 빌드가 DB 를 읽는다

- [x] Vercel Build Command: `pnpm data:pull && pnpm build` — `vercel.json` 의 `buildCommand`(대시보드가 아니라 레포에 둔다).
      **`outputDirectory` 는 적지 않는다** — `out` 을 적으면 pull·빌드·유출 검사가 다 통과한 뒤 배포만 죽는다
      (→ [BUG-005](../bugs/BUG-005-vercel-output-directory.md)). 로컬 `vercel build --prod` 로 검증했고, **`main` `66b15e1` 프로덕션 Ready 로 닫혔다**(2026-09-23).
- [x] ~~`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 를 Vercel env(Production·Preview, Sensitive)~~ → **ADR-016 v4 로 바뀜**: 빌드는 코드 상수의
      publishable 키로 `places(published)`·`items` 만 읽는다(`createSupabase({ readOnly: true })`, RLS 가 그 집합만 연다). Vercel 에 Supabase 시크릿이 없다.
      빌드 로그의 `Supabase 인증: publishable(anon — published 읽기만)` 이 그 증거다. [x] env 삭제 뒤 확인(2026-09-22 (2): `main` `63abb90` 프로덕션 Ready, Vercel env 0개·
      연동 없음 상태에서 `publishable(anon)` 86·15, 유출 검사 통과). 코드 불변식: `readOnly` 는 env 에 service 키가 남아 있어도 anon 이다(이름만 경고).
      → 이전(service 경로): Vercel 빌드 로그에서 `pull 완료: places 86 (published) · items 15` 와 `번들 유출 검사 통과` 를 봤다(2026-09-20 배포).
- [x] `data:pull` 실패 = 빌드 실패. Vercel 은 실패한 배포를 올리지 않으니 **이전 배포가 그대로 산다.** 조용히 옛
      데이터로 새 배포가 나가는 것보다 낫다. → BUG-005 때 실제로 그랬다: 배포는 Error, 사이트는 이전 배포로 그대로.
- [x] 로컬 `pnpm build` 는 `data:pull` 없이 커밋된 스냅샷으로 — 지금과 같다.
- [ ] 커밋된 `src/data/*.json` 은 **주기적으로 갱신해 커밋**한다 — 사람이 `pnpm data:pull` 후 커밋. 안 하면 로컬과 배포가 점점 벌어진다.
      ~~초안: Actions 수집 잡 끝에 `git diff --quiet src/data || (PR 생성)`, 그러려면 `contents: write` 🙋~~ — (c) 로 워크플로가 없어 이 갈림길 자체가 사라졌다(2026-09-22).
      `data:pull` 은 anon 이라 세션 없이도 언제든 돌릴 수 있다(Claude 도). 2026-09-23 실행 → 86·15, `git diff src/data` 빈 결과(아직 안 벌어졌다).
      > 메모: 2026-10-06 갱신 → 84·15(개떼목장·롯지먼트 archived, 13 T3.1 지역 표기·`verifiedAt`·원문 보강 반영). 스냅샷을 고정해 둔 테스트 4개(좌표 없는 곳·안덕면 동수·솔숲펜션 배지·장소 수 하한)를 데이터에 맞췄다 — 내리기가 생긴 뒤로 장소 수는 줄 수 있다. 반복 항목이라 열어 둔다.

### Preview 배포

- [x] ~~PR 마다 Preview 가 뜬다~~ → **2026-10-01 껐다.** `vercel.json` `git.deploymentEnabled: { "main": true, "**": false }` — `main` 밖의
      브랜치 push 는 빌드하지 않는다. `develop` 미리보기는 대시보드 Create Deployment 로 손으로 띄운다(주소 `zgnn-git-develop-…vercel.app`)(`main` 은 두 규칙에 다 걸리지만 하나라도 `true` 면 배포된다). 필요하면 그 브랜치에서 `vercel`(Preview) 을 손으로 부른다.
      `**` 인 이유: minimatch 의 `*` 는 `/` 를 못 넘어 `claude/foo` 를 놓친다.
- [ ] Deployment Protection → **Vercel Authentication** 을 Preview 에 켠다(무료). 미완성 화면이 검색엔진·남에게 노출되지 않게.
- [ ] 네이버 지도는 Preview URL 이 매번 달라 NCP 콘솔 등록이 안 된다 → Preview 에서 지도가 안 뜨는 건 **알고 감수**한다(00 에 적음).
      Kakao 때와 달리 빈 화면이 아니라 "지도는 인터넷이 필요해요" 안내가 뜬다(ADR-008 v4).

## 4b. 승인되면 재빌드

```
/admin 에서 "맞아요"  ──▶  places INSERT/UPDATE  ──▶  트리거 places_notify_vercel_rebuild
                      ──▶  notify_vercel_rebuild()  ──▶  rebuild_log 에 queued 한 줄 (네트워크 없음)
pg_cron 매분          ──▶  flush_vercel_rebuild()  ──▶  가장 최근 queued 가 60초 조용하면
                      ──▶  Vault 의 vercel_deploy_hook 으로 POST 한 번  ──▶  잡은 줄 전부 sent(같은 request_id)  ──▶  Vercel 빌드
```
(2026-10-06 부터 — 그 전에는 트리거가 행마다 직접 POST 했다. 왜 바꿨는지는 ADR-018 결정 9 v7.)

**대시보드 경로가 바뀌었다.** Database 아래가 아니라 **Integrations → Webhooks** 다. 그리고 이 프로젝트는 그 기능을 한 번도 켠 적이 없어
`supabase_functions` 스키마도 `pg_net` 도 없었다(2026-09-29 실측). 그래서 대시보드로 만들지 않고 **마이그레이션으로 깔았다** —
대시보드에서 만든 트리거는 레포에 안 남아 "왜 승인하면 빌드가 도나" 를 찾을 곳이 없다. 스키마의 정본은 `supabase/migrations/` 다.

- [x] **DB 쪽 배선**(2026-09-29, `20260929023000_vercel_rebuild_webhook.sql`): `pg_net` 설치 · `public.notify_vercel_rebuild()`(security definer) ·
      `places` 에 행 단위 AFTER INSERT/UPDATE/DELETE 트리거. 마이그레이션 이력은 로컬=원격 6개로 맞춰 뒀다(`migration repair --status applied`).
      실측: 롤백 트랜잭션 안에서 `places` 를 한 행 UPDATE 해 **트리거가 쓰기를 깨지 않는 것**을 확인했고, 훅이 없어 `net._http_response` 는 0건이다.
- [x] **Deploy Hook** — 새로 만들 필요가 없었다. **2026-09-17 에 이미 있었다**(이름 `auto deploy` · 브랜치 `main` · id `gD3ioVFKtV`).
      `vercel deploy-hooks list` 로 확인한다. 새로 만들려면 `vercel deploy-hooks create <이름> --ref main`, 또는 대시보드
      Settings → Git → Deploy Hooks. ⚠️ **`list` 는 URL 을 통째로 찍는다** — 에이전트 세션에서 부르면 그 값이 대화 기록에 남는다(05).
- [x] **Vault 에 훅 저장**(2026-09-29): `select vault.create_secret('<URL>', 'vercel_deploy_hook', …)`. Studio → SQL Editor 에서 한 줄이면 되고,
      값은 암호화돼 `vault.decrypted_secrets` 로만 읽힌다(트리거 함수가 security definer 로 읽는다). 바꿀 때 `vault.update_secret`, 끊을 때 그 비밀만 지운다.
- [x] **전 구간 실측**(2026-09-29 11:52): `places` 한 행 UPDATE → `net._http_response` 에 `status_code 201` ·
      `{"job":{"state":"PENDING"}}` → Vercel 프로덕션 빌드 시작. 확인 쿼리는 이것이다:
      ```sql
      select status_code, timed_out, error_msg, created from net._http_response order by created desc limit 3;
      ```
- [x] 🚩 **`status_code` 가 null 일 때의 모호함을 화면이 가른다**(2026-09-29, `20260929121000_rebuild_log.sql`).
      타임아웃(빌드는 걸렸을 수 있다)과 죽은 URL 이 둘 다 null 로 보이던 문제인데, 이제 셋을 갈라 말한다 —
      **3분 안**이면 `응답을 기다리고 있어요`(실측 4.7초라 정상), **3분 넘게 null** 이면 `응답을 못 받았어요`,
      **4xx/5xx** 면 `Vercel 이 재빌드를 거절했어요(… · 404) — Deploy Hook 이 폐기된 것 같아요`.
      **단 429 는 따로**(2026-10-06): 시간당 60번 한도라 "훅은 그대로예요 · 다음 성공하는 재빌드가 같이 반영해요" — 일괄 작업이 행마다 부르면 닿는다([BUG-011](../bugs/BUG-011-rebuild-429-read-as-revoked-hook.md)).
      판정은 `src/lib/adminRebuild.ts` 의 순수 함수고 테스트가 여섯 갈래를 다 잡는다. pg_net 이 재시도하지 않는다는 사실은 그대로다.
- [x] **호출 기록을 남긴다** — `public.rebuild_log`(운영자 select 만, insert 는 definer 트리거만). 남기는 것: 언제·어느 op·어느 장소·
      그때 상태 · `hook` ∈ `sent|missing|skipped|error` · `request_id` · 옮겨 적은 응답. **훅 주소는 담지 않는다** —
      pg_net 오류 문구에 섞여 오면 저장 전에 `<hook>` 으로 지운다(이 표는 Vault 를 못 읽는 역할이 읽는다).
      `missing` 이 특히 중요하다: 예전의 "조용한 no-op" 이 그 한 줄로 **보이게** 됐다.
      읽는 길은 `public.rebuild_status(n)` 하나다 — `net._http_response` 가 스키마 `net` 에 있어 PostgREST 로는 못 보고
      authenticated 에 그 usage 가 없어서, definer 함수가 결과를 우리 표로 옮겨 적고 **우리 컬럼만** 돌려준다(어드바이저 0028/0029 는
      감수하는 예외 하나다 — invoker 로는 만들 수가 없다. 대신 첫 줄에서 `auth.uid()` 로 운영자를 직접 확인하고 anon·PUBLIC 의 execute 를 회수한다).
- [ ] `candidates` 가 아니라 **`places`** 에 건다. 승인(candidates) 자체는 화면에 아무 영향이 없고, `data:apply` 가
      `places` 를 만질 때 비로소 반영할 것이 생긴다.
- [ ] Deploy Hook URL 은 시크릿이다. 이제 **Vault(암호화 저장)에만** 있고 마이그레이션·함수 본문·로그에는 없다. 새 나가면 Vercel 에서 폐기·재발급(05).
- [x] **게시 집합이 안 바뀌는 변경은 훅을 부르지 않는다**(2026-09-29). 빌드가 읽는 것은 `status='published'` 뿐이므로
      (`pull-db.mjs` · anon 정책), 초안을 고치거나 내린 곳을 또 고치는 UPDATE 는 만들어지는 사이트가 **한 바이트도 다르지 않다.**
      판단 기준은 "published 가 끼어 있나" 다 — UPDATE 는 **이전이나 이후 중 하나라도** published 면 부른다
      (게시 → 내림 = 사라져야 하고, 내림 → 게시 = 나타나야 한다. 어느 쪽도 빼면 사이트가 DB 와 어긋난다).
      건너뛴 것도 `hook='skipped'` 로 남긴다 — "왜 빌드가 안 돌았나" 의 답이 그 줄에 있다.
      소프트 삭제가 이 갈래를 실제로 만들었다: 초안을 내리는 것은 사이트와 무관한 정리 작업이다.
- [x] **뒤쪽 합치기**(2026-10-06, `20261006130000_rebuild_coalesce.sql`) — 아래 🙋 를 닫는다. 일괄 올리기 36곳이 훅 36번 → 429(BUG-011)가 실제로 났다.
      2026-10-06 `db push` 뒤 원격: 첫째·둘째 줄 확인(잡 둘 · `username` postgres · 10:03 부터 매분 succeeded). 셋째 줄은 **반영 뒤 쓰기가 아직 없어** 새 경로의 줄이 0 —
      보이는 `sent`·201 은 전부 `flushed_at` 이 null 인 옛 경로 기록이다(09:40 한 번에 36곳 → 훅 36번, 이 작업이 고친 바로 그 모양). 롤백 트랜잭션으로 원격의
      트리거 → `queued` → 플러시 → Vault → `sent`(request_id) 까지는 확인했다(커밋 안 함 = 훅 안 나감).
      ✅ 끝까지: 10:09:55 게시 장소 한 곳 저장(값 그대로) → 10:11:00 cron 이 플러시(`flushed_at`) → `sent` · request_id 140 · **201**. 60초 조용 + 다음 분 = 65초.
      확인 절차(원격 — 사용자 터미널, `./node_modules/.bin/supabase db query --linked`):
      ```sql
      -- 잡이 하나 있고 켜져 있나 · 누구로 도나(postgres 가 아니면 PUBLIC 회수에 막혀 매분 실패한다)
      select jobid, jobname, schedule, active, username from cron.job where jobname in ('flush-vercel-rebuild', 'prune-cron-run-details');
      -- 매분 돌고 있나(succeeded · '1 row')
      select status, return_message, start_time from cron.job_run_details order by runid desc limit 3;
      -- 게시 중인 장소 하나를 저장한 뒤 1~2분: queued 가 sent 로 바뀌고, 같은 request_id 를 나눠 갖는다
      select hook, request_id, count(*), max(requested_at), max(flushed_at), max(response_status)
      from public.rebuild_log where requested_at > now() - interval '1 hour' group by 1, 2 order by 4 desc;
      ```
      `queued` 가 5분 넘게 남으면 `/admin` 머리글이 "재빌드 예약이 안 돌고 있어요" 라고 말한다 — 그때 위 첫 줄(잡이 있나·`username`)과 둘째 줄(`status = 'failed'` 의 `return_message`)을 본다. 잡이 있는데 줄이 안 빠지면 플러시가 매분 롤백되고 있는 것이다.
- [x] ~~🙋 **승인 N건 = 빌드 N번**~~ → 위 뒤쪽 합치기로 닫았다(2026-10-06). 아래는 그 전의 기록이다. 한 묶음 승인이 `places` 를 M번 건드리면 훅도 M번이었다.
      Hobby 에서 **먼저 걸리는 한도가 하루 배포 횟수인지 월 빌드 시간인지**를 첫 달에 관찰한다 — 이제 셀 수 있다:
      ```sql
      select hook, count(*) from public.rebuild_log where requested_at > now() - interval '7 days' group by hook;
      ```
      스케줄러로 묶는 것(pg_net 호출을 pg_cron 으로 내려 1분에 한 번만 부르기)은 **지금 하지 않았다** —
      "스케줄·CI 는 없다"([05](05-security.md))가 이 프로젝트의 성질이고, 위 기록이 그 결정을 언제 뒤집을지 알려 줄 계기다. 대안:
      - (기본) 그냥 둔다. 수집이 사용자 손이라 `data:apply` 한 번에 수 건이면 문제없다.
      - 웹훅을 `places` 가 아니라 별도 `deploy_requests` 테이블에 걸고, 관리 화면의 "반영" 버튼이 거기에 한 줄 넣는다.
      - 웹훅을 걸지 않고, 사용자가 `pnpm data:apply` 뒤 Deploy Hook URL 을 한 번 `curl` 한다(승인은 모였다가 반영 때 빌드 한 번. URL 은 사용자만 안다).
        ~~Actions 수집 잡 끝에서만 `curl`~~ — (c) 로 잡이 없다.
      첫 달은 기본으로 가고 빌드 횟수를 본다.

### 수동 경로도 남긴다

- Vercel 대시보드 "Redeploy" 나 `vercel deploy --prod` — 웹훅이 잘못돼도 반영할 길.
- ~~Actions `workflow_dispatch` 로 "지금 수집·분석·재빌드" 한 번에~~ → 사용자 터미널에서 `pnpm data:collect && pnpm data:analyze && pnpm data:apply` 뒤 Redeploy(2026-09-22 (c)).
  Claude 는 세션이 있어도 `data:collect` 는 못 돌린다(네이버 키 입력 거부) — 나머지 둘은 사용자가 `pnpm data:login` 한 상태면 된다.

## 앱 코드 변경 — 사실상 없다

- `src/` 는 손대지 않는다. `data:pull` 이 만든 JSON 이 지금 스키마와 같으니까(01 의 합격 기준).
- 단 하나: `place_sources` 가 생기면 상세 화면의 "후기 링크" 를 여러 개로 보여줄지 — 기능 변경이라 `docs/features/` 에 따로. 지금 범위 밖.

## 끝났다고 볼 조건

- Studio 에서 장소 이름 한 글자 고침 → 2분 안에 프로덕션 URL 에 반영, 그리고 **이미 설치된 PWA 가 다음 실행 때 새 데이터를 받는다**(revision 이 바뀌었으니). 후자를 꼭 폰에서 확인한다 — 빌드는 통과하고 화면은 그려지는데 옛 데이터만 보이는 고장이 이 자리다.
- `docs/architecture/pwa-offline.md` 에 "데이터 갱신도 revision 을 바꾼다" 한 줄. `data-pipeline.md` v2 의 배포 절.

-- **로컬 워커**(`pnpm data`)가 DB 를 보고 도는 데 필요한 표·칸·구독(ADR-024 결정 2·3·6, docs/todo/17 T2).
--
-- 왜 필요한가 — 명령 13개를 손으로 고르던 것을 터미널에 상주하는 워커 하나로 줄인다. 워커가 "할 일" 을 알아내는 곳은 대부분
-- 이미 있는 상태 칸이다(`collect_requests.status` · `candidates.status = approved` · `blog_posts.analyzed_at`). 표로 새로 세우는 것은 둘뿐이다:
--   - `pipeline_requests` — "**지금** 돌려 줘" 라는 사람의 의도. 「지금 분석 N건」(저수지에서 이번에 N건)은 다른 어느 칸에도 적을 수 없는 말이다.
--   - `workers` — 기기당 한 행. "실행이 없을 때도 워커가 살아 있나" 를 답할 행이 `pipeline_runs` 에는 없다.
-- 칸 둘: `pipeline_runs.progress`(`{done, total, current}` — 5초에 한 번, "어디까지 왔나". `heartbeat_at` 은 "살아 있나" 다) ·
--   `blog_posts.requested_at`(사람이 요청한 글 — 추가 수집에서 왔거나 재분석으로 되돌린 글. 워커의 자동 analyze 는 이것만 읽고 저수지는 안 읽는다, 결정 4).
--
-- 권한은 `pipeline_runs`·`collect_requests` 와 같은 모양이다 — authenticated 에 select/insert/update, 정책 셋 `is_operator()`, delete 없음, anon 없음.
-- 새 표에는 grant 도 정책도 자동으로 붙지 않으므로(`20260922120000` 의 4번) 전부 명시한다.
--
-- Realtime — `supabase_realtime` publication 에 여섯 표를 더한다(적용 전 원격 조회: publication 은 있고 `puballtables=false`, 표 0개).
--   워커가 구독하는 넷(`collect_requests` INSERT · `pipeline_requests` INSERT · `candidates` UPDATE · `blog_posts` UPDATE, T4)과
--   `/admin/ops` 가 구독하는 둘(`workers` · `pipeline_runs`, T5).
--   ⚠️ Realtime 의 postgres_changes 는 **구독자의 RLS 를 적용한다** — 여섯 표 모두 select 정책이 `is_operator()` 뿐이라
--   세션 없는 publishable(anon) 키로는 행이 하나도 오지 않는다(ADR-023 이 걱정한 "권한을 또 연다" 는 세션이 있어야 통과한다).
--   단 Realtime 은 DELETE 이벤트에는 RLS 를 적용하지 않는다 — 여섯 표 모두 authenticated 에 delete grant 가 없고, SQL 콘솔(postgres)에서 지워도
--   replica identity default 라 실리는 것은 PK(uuid·host) 뿐이다(replica identity 를 full 로 바꾸면 여기를 다시 본다).
--   `replica identity` 는 default 그대로다 — UPDATE 의 old 값이 필요 없다(`blog_posts`·`candidates` 는 행이 커서 full 이면 WAL 이 불어난다).
--   그 대가로 UPDATE 이벤트의 old 는 PK 뿐이라 "`requested_at` 이 **새로 생김**" 은 구별되지 않는다 — 워커는 `requested_at` 이 있는 행의
--   어떤 update 에도 깬다. `wake()` 가 디바운스·멱등이라 비용이 아니다.

-- 1. 요청 큐 — 화면이 넣고 워커가 집는다(queued → taken → done). `taken` 이 10분 넘으면 워커가 다시 집는다(T3.1).
create table public.pipeline_requests (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('collect', 'analyze', 'apply')),
  args          jsonb,                                    -- 플래그 이름·수만(`{"limit": 20}`). 값(키·URL)은 없다
  status        text not null default 'queued' check (status in ('queued', 'taken', 'done')),
  requested_at  timestamptz not null default now(),
  requested_by  uuid default auth.uid(),
  taken_at      timestamptz,
  run_id        uuid references public.pipeline_runs (id)
);

create index pipeline_requests_status_requested_idx on public.pipeline_requests (status, requested_at);

comment on table public.pipeline_requests is
  '"지금 돌려 줘" 요청(한 요청 = 한 행). /admin 이 insert, 로컬 워커(pnpm data)가 queued → taken → done. ADR-024 결정 2.';

-- 2. 워커 심장 — 기기당 한 행(upsert). 15초마다 `last_seen_at`, 단계 들어갈 때 `phase`·`run_id`(T3.3). 5분 넘게 조용하면 화면이 "워커 없음".
create table public.workers (
  host          text primary key,                         -- os.hostname()
  last_seen_at  timestamptz not null default now(),
  phase         text not null default 'idle' check (phase in ('idle', 'collect', 'analyze', 'apply', 'login-needed', 'rate-limited')),
  run_id        uuid,                                     -- 지금 도는 pipeline_runs.id. 실행 행보다 심장이 먼저 쓰일 수 있어 FK 를 걸지 않는다
  started_at    timestamptz,
  version       text                                      -- git sha 짧게
);

comment on table public.workers is
  '로컬 워커 심장(기기당 한 행). 쓰는 곳은 pnpm data, 읽는 곳은 ops_overview() 와 /admin/ops 구독. ADR-024 결정 2.';

-- 3. 칸 둘.
alter table public.pipeline_runs add column progress jsonb;   -- {done, total, current} — current 는 글 제목 앞 20자(T3.3)
alter table public.blog_posts add column requested_at timestamptz;

-- 부분 조건 안에서 analyzed_at 은 늘 null 이라 키에 넣지 않는다 — "요청된 미분석 글" 을 오래된 순으로 집는 자리다.
create index blog_posts_requested_unanalyzed_idx on public.blog_posts (requested_at) where analyzed_at is null;

-- 4. 권한 — 두 표 모두 운영자만. delete 없음(`20260922120000` 의 원칙 — 어떤 스크립트도 지우지 않는다).
alter table public.pipeline_requests enable row level security;
alter table public.workers enable row level security;

grant select, insert, update on table public.pipeline_requests to authenticated;
grant select, insert, update on table public.workers to authenticated;

create policy operators_select on public.pipeline_requests
  for select to authenticated using ((select public.is_operator()));
create policy operators_insert on public.pipeline_requests
  for insert to authenticated with check ((select public.is_operator()));
create policy operators_update on public.pipeline_requests
  for update to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

create policy operators_select on public.workers
  for select to authenticated using ((select public.is_operator()));
create policy operators_insert on public.workers
  for insert to authenticated with check ((select public.is_operator()));
create policy operators_update on public.workers
  for update to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

-- 5. Realtime publication — 이미 든 표를 다시 add 하면 에러라 하나씩 확인하고 더한다(다시 돌려도 같은 결과).
do $$
declare
  t text;
begin
  foreach t in array array['workers', 'pipeline_runs', 'pipeline_requests', 'collect_requests', 'candidates', 'blog_posts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

/*
 * 6. `ops_overview()` — 본문은 `20261006130000` 그대로이고 끝에 두 칸을 더한다(T2.2 — 화면 첫 그림용, 그 뒤 갱신은 구독).
 *   - `workers`: 행 전부(최근에 본 순). 살아 있나·없나 판정(5분)은 여기서 하지 않는다 — `adminOpsHealth.ts` 한 곳이 가진다(T5.1).
 *   - `requestsQueued`: `pipeline_requests` 의 queued 수.
 */
create or replace function public.ops_overview(days int default 7)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  span      interval := greatest(1, least(coalesce(ops_overview.days, 7), 365)) * interval '1 day';
  slack     boolean := false;
  recent    jsonb;
  result    jsonb;
begin
  if not exists (select 1 from public.operators where user_id = (select auth.uid())) then
    raise exception '운영 현황은 운영자만 볼 수 있어요.' using errcode = '42501';
  end if;

  -- Slack 알림(T5)이 남긴 request_id 의 응답을 alert 로 옮겨 적는다(`rebuild_status` 수법). 응답은 net 에 오래 남지 않는다.
  -- 실패해도 계속한다 — 여기서 올라가면 화면 전체가 비어 보인다.
  begin
    update public.pipeline_runs as p
    set alert = p.alert || jsonb_build_object(
          'responseStatus', r.status_code,
          'respondedAt', r.created,
          'responseError', nullif(regexp_replace(coalesce(r.error_msg, ''), 'https?://[^[:space:]"'']+', '<hook>', 'g'), ''))
    from net._http_response as r
    where r.id = case when jsonb_typeof(p.alert -> 'requestId') = 'number' then (p.alert ->> 'requestId')::bigint end
      and p.alert -> 'respondedAt' is null;
  exception when others then
    null;
  end;

  -- 재빌드 다섯 호출 — 옮겨 적기와 묶기를 `rebuild_status` 가 한다. 그 안의 옮겨 적기는 스스로 실패를 삼키므로 여기서 감싸지 않는다
  -- (감싸서 '[]' 로 바꾸면 "기록 없음" 과 "진단기 고장" 이 같은 얼굴이 된다).
  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at desc), '[]'::jsonb) into recent
  from public.rebuild_status(5) x;

  -- 이름만 본다. decrypted_secrets 를 읽지 않는다 — 값이 이 함수의 어떤 변수에도 들어오지 않게.
  begin
    slack := exists (select 1 from vault.secrets where name = 'slack_webhook_url');
  exception when others then
    slack := false;
  end;

  with
  latest as (
    select distinct on (r.script) r.*
    from public.pipeline_runs r
    order by r.script, r.started_at desc
  ),
  -- 끝까지 돈 마지막 실행 — partial 포함(analyze 의 partial 은 건너뛴 글이 있었을 뿐 돌았다). 마지막 실행이 failed 일 때
  -- "마지막으로 성공한 게 언제인가" 를 latest 만으로는 답할 수 없어 따로 준다(수집 칸의 '7일 넘음' 이 이 값을 본다).
  last_ok as (
    select distinct on (r.script) r.*
    from public.pipeline_runs r
    where r.status in ('ok', 'partial')
    order by r.script, r.started_at desc
  ),
  analyze_30d as (
    select r.stats
    from public.pipeline_runs r
    where r.script = 'analyze' and r.started_at >= now() - interval '30 days'
  ),
  meters as (
    select m.value
    from analyze_30d a
    cross join lateral jsonb_each(case when jsonb_typeof(a.stats -> 'meters') = 'object' then a.stats -> 'meters' else '{}'::jsonb end) m
  )
  select jsonb_build_object(
    'days', extract(day from span)::int,
    'runsLatest', coalesce((
      select jsonb_object_agg(l.script, to_jsonb(l) - 'operator') from latest l), '{}'::jsonb),
    'runsLastOk', coalesce((
      select jsonb_object_agg(o.script, to_jsonb(o) - 'operator') from last_ok o), '{}'::jsonb),
    'funnel', jsonb_build_object(
      'newPosts',   (select count(*) from public.blog_posts b where b.fetched_at >= now() - span),
      'analyzed',   (select count(*) from public.blog_posts b where b.analyzed_at >= now() - span),
      'candidates', (select count(*) from public.candidates c where c.created_at >= now() - span),
      -- 반영되면 merged 로 바뀌므로 approved 만 세면 빠진다. reviewed_at 은 트리거가 approved/rejected 로 바뀔 때만 찍는다.
      'approved',   (select count(*) from public.candidates c where c.reviewed_at >= now() - span and c.status in ('approved', 'merged')),
      'rejected',   (select count(*) from public.candidates c where c.reviewed_at >= now() - span and c.status = 'rejected'),
      -- extracted.applied.at 은 앱·스크립트가 ISO 문자열로 적는다. 모양이 아니면 세지 않는다(캐스트 오류로 죽지 않게 —
      -- AND 는 평가 순서를 보장하지 않으므로 case 로 순서를 못 박는다).
      'applied',    (select count(*) from public.candidates c
                      where case when jsonb_typeof(c.extracted -> 'applied' -> 'at') = 'string'
                                      and (c.extracted -> 'applied' ->> 'at') ~ '^\d{4}-\d{2}-\d{2}T'
                                 then (c.extracted -> 'applied' ->> 'at')::timestamptz >= now() - span
                                 else false end),
      -- 행이 아니라 요청을 센다 — 한 요청에 묶인 행이 여러 개다(`20261006130000` 5번 주석).
      'rebuilds',   (select count(distinct l.request_id) from public.rebuild_log l
                      where coalesce(l.flushed_at, l.requested_at) >= now() - span
                        and l.hook = 'sent' and l.response_status between 200 and 299),
      'pendingNow', (select count(*) from public.candidates c where c.status = 'pending')),
    'backlog', (
      select jsonb_build_object('count', count(*), 'oldestFetchedAt', min(b.fetched_at))
      from public.blog_posts b where b.analyzed_at is null),
    'pending', (
      select jsonb_build_object('count', count(*), 'oldestCreatedAt', min(c.created_at))
      from public.candidates c where c.status = 'pending'),
    -- approved 인데 merged 아님(= `countStrandedCandidates`). /admin 승인 경로에선 거의 0 이고, 0 이 아니면 `data:apply` 를 돌릴 차례다.
    'stranded', (select count(*) from public.candidates c where c.status = 'approved'),
    'usage30d', jsonb_build_object(
      'claudeCalls', (select coalesce(sum(case when jsonb_typeof(m.value -> 'calls') = 'number' then (m.value ->> 'calls')::numeric end), 0) from meters m),
      'input',       (select coalesce(sum(case when jsonb_typeof(m.value -> 'input') = 'number' then (m.value ->> 'input')::numeric end), 0) from meters m),
      'output',      (select coalesce(sum(case when jsonb_typeof(m.value -> 'output') = 'number' then (m.value ->> 'output')::numeric end), 0) from meters m),
      'cacheRead',   (select coalesce(sum(case when jsonb_typeof(m.value -> 'cacheRead') = 'number' then (m.value ->> 'cacheRead')::numeric end), 0) from meters m),
      'cacheWrite',  (select coalesce(sum(case when jsonb_typeof(m.value -> 'cacheWrite') = 'number' then (m.value ->> 'cacheWrite')::numeric end), 0) from meters m),
      'naverCalls',  (select coalesce(sum(case when jsonb_typeof(r.stats -> 'naverCalls') = 'number' then (r.stats ->> 'naverCalls')::numeric end), 0)
                      from public.pipeline_runs r
                      where r.script in ('collect', 'analyze') and r.started_at >= now() - interval '30 days'),
      'rebuilds2xx', (select count(distinct l.request_id) from public.rebuild_log l
                      where coalesce(l.flushed_at, l.requested_at) >= now() - interval '30 days'
                        and l.hook = 'sent' and l.response_status between 200 and 299)),
    -- `rebuild_status(5)` 그대로(한 행 = 한 호출, `place_count`·`responded_at` 포함).
    'rebuildRecent', recent,
    'slackConfigured', slack,
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'host', w.host, 'last_seen_at', w.last_seen_at, 'phase', w.phase,
               'run_id', w.run_id, 'started_at', w.started_at, 'version', w.version)
             order by w.last_seen_at desc)
      from public.workers w), '[]'::jsonb),
    'requestsQueued', (select count(*) from public.pipeline_requests q where q.status = 'queued')
  ) into result;

  return result;
end;
$fn$;

comment on function public.ops_overview(int) is
  '운영 현황(/admin/ops) 집계 한 벌 — 스크립트별 마지막 실행, 기간 흐름, backlog, 보류, 반영 끊김, 30일 사용량, 최근 재빌드(호출 단위), Slack 웹훅 유무(boolean), 로컬 워커 심장, 대기 중인 요청 수. 운영자만.';

revoke execute on function public.ops_overview(int) from anon, public;
grant execute on function public.ops_overview(int) to authenticated;

/*
 * 적용 뒤 검증(사용자가 `db push --linked` 한 다음 돌린다 — 롤백으로 끝나 행이 남지 않는다).
 * `postgres` 그대로면 RLS 를 우회하므로 `set local role` 로 역할을 바꾼다. 42501 을 기대하는 문장은 savepoint 로 하나씩 감싼다
 * (한 문장이 실패하면 트랜잭션 전체가 죽어 뒤의 확인이 안 돈다). 운영자 uuid 는 표에서 집는다 — 값을 파일에 적지 않는다.
 *
 *   begin;
 *   select set_config('request.jwt.claims',
 *     json_build_object('sub', (select user_id from public.operators limit 1), 'role', 'authenticated')::text, true);
 *   set local role authenticated;
 *   -- 운영자: insert·update 됨(각 1행)
 *   insert into public.pipeline_requests (kind, args) values ('analyze', '{"limit": 10}');
 *   update public.pipeline_requests set status = 'taken', taken_at = now() where status = 'queued';
 *   insert into public.workers (host, phase) values ('verify-host', 'idle')
 *     on conflict (host) do update set last_seen_at = now(), phase = excluded.phase;   -- 워커의 upsert 모양(select 권한도 필요하다)
 *   insert into public.workers (host, phase) values ('verify-host', 'analyze')
 *     on conflict (host) do update set last_seen_at = now(), phase = excluded.phase;
 *   select (public.ops_overview(7) -> 'workers') as workers, (public.ops_overview(7) -> 'requestsQueued') as queued;
 *   -- 운영자: delete 42501
 *   savepoint s1; delete from public.pipeline_requests; rollback to s1;
 *   savepoint s2; delete from public.workers; rollback to s2;
 *   -- 비운영자 세션: insert 42501 · rpc 42501 · select 0행
 *   savepoint s3; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
 *     select count(*) from public.workers;   -- 0(RLS 는 에러가 아니라 0행)
 *     insert into public.workers (host) values ('x'); rollback to s3;
 *   savepoint s4; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
 *     select public.ops_overview(7); rollback to s4;
 *   -- anon: select·insert 42501(grant 가 없다)
 *   savepoint s5; set local role anon; select count(*) from public.workers; rollback to s5;
 *   savepoint s6; set local role anon; insert into public.pipeline_requests (kind) values ('collect'); rollback to s6;
 *   rollback;
 *   select (select count(*) from public.pipeline_requests) as requests, (select count(*) from public.workers) as workers;   -- 둘 다 0
 *   select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;                            -- 여섯 표
 *
 * ⚠️ `rollback to sN` 은 savepoint 이후의 `set local role` 도 되돌린다 — s3~s6 뒤에는 운영자 authenticated 로 돌아와 있다.
 */

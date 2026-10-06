-- 파이프라인이 **돌았는지** 를 남기는 표와, 운영 현황 화면(`/admin/ops`)이 한 번에 읽는 집계 함수(ADR-023 결정 1·4, docs/todo/15 T1.1·T1.2).
--
-- 왜 필요한가 — 수집·분석·반영은 사용자 터미널에서 손으로 돈다(스케줄 없음). 그런데 실행 단위의 기록이 어디에도 없었다:
--   `blog_posts.fetched_at` 은 `ignoreDuplicates` upsert 라 "마지막으로 새 글이 들어온 시각" 이지 "마지막 실행" 이 아니고,
--   `analyze` 는 글 하나가 실패해도 건너뛰고 exit 0 이라 실패가 조용하다. 남는 것은 터미널 스크롤백뿐이었다.
--   DB 에 기록이 남는 단계는 재빌드(`rebuild_log`) 하나였다. 이 표가 나머지 넷(수집·분석·반영·CLI 승인)을 채운다.
--
-- 쓰는 쪽은 스크립트다(`scripts/lib/runLog.mjs`) — 시작할 때 insert, 끝날 때 update, 긴 analyze 는 그 사이 `heartbeat_at`.
-- 기록 실패는 작업을 막지 않는다(fail-soft, ADR-023 결정 2) — 그래서 이 파일이 원격에 적용되기 **전에도** 스크립트는 그대로 돈다
-- (insert 가 42P01 로 실패하면 경고 한 줄만 찍는다).
--
-- ⚠️ `rebuild_log` 와 다른 점 — **운영자가 행을 직접 update 할 수 있다.** 저쪽은 definer 트리거만 쓰는 위조 방지 표이고(select 만 grant),
--   이쪽은 운영자 세션(JWT)으로 도는 스크립트가 쓰는 운영자 자신의 메모장이다. 화면에 고치는 버튼을 두지 않는 것은 UI 규칙이지 권한 경계가 아니다
--   (ADR-023 「결과」). delete 는 주지 않는다 — 어떤 스크립트도 지우지 않는다(`20260922120000` 의 원칙).
--
-- ⚠️ `error` 칸에는 **분류 문구만** 들어간다("Claude 인증 실패" · "네이버 검색 429" · "DB 쓰기 실패" · "중단(SIGINT)" · "알 수 없음").
--   원문(PostgREST details 의 `Key (…)=(값)` 등)에는 장소명이 섞일 수 있어 콘솔에만 남는다 — 이 표는 나중에 Slack 트리거(T5)가 읽는다.

create table public.pipeline_runs (
  id           uuid primary key default gen_random_uuid(),   -- 스크립트가 randomUUID() 로 미리 정해 보낸다(insert 에 .select() 를 붙이지 않으려고)
  script       text not null check (script in ('collect', 'analyze', 'apply', 'approve', 'reject')),
  status       text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  -- 시작할 때도 찍어 둔다 — tick 을 한 번도 못 부르고 죽은 실행도 "심장이 멎은 running" 으로 읽혀야 한다(null 이면 화면이 무엇과 비교할지 갈린다).
  heartbeat_at timestamptz default now(),
  args         jsonb,                                         -- 플래그 목록·개수만. 값(키·URL)은 없다
  stats        jsonb,                                         -- 콘솔 요약 줄이 읽는 수 전부(src/lib/runSummary.ts 가 이걸로 같은 문장을 다시 만든다)
  error        text,                                          -- 분류 문구 한 줄(머리 주석)
  alert        jsonb,                                         -- {state:'sent'|'missing'|'error', requestId, responseStatus, respondedAt, note} — T5 의 Slack 트리거가 쓴다
  operator     uuid default auth.uid()
);

create index pipeline_runs_script_started_idx on public.pipeline_runs (script, started_at desc);

comment on table public.pipeline_runs is
  '수집·분석·반영·CLI 승인 스크립트의 실행 기록(한 실행 = 한 행). 쓰는 곳은 scripts/lib/runLog.mjs. 읽는 길은 public.ops_overview() 와 직접 select(운영자).';

-- 새 테이블에는 grant 도 정책도 자동으로 붙지 않는다(`20260922120000` 의 4번 — default privileges 를 걷어 뒀다).
-- id 는 uuid 라 시퀀스 usage 가 필요 없다. anon 에는 아무것도 주지 않는다.
alter table public.pipeline_runs enable row level security;
grant select, insert, update on table public.pipeline_runs to authenticated;

create policy operators_select on public.pipeline_runs
  for select to authenticated using ((select public.is_operator()));
create policy operators_insert on public.pipeline_runs
  for insert to authenticated with check ((select public.is_operator()));
create policy operators_update on public.pipeline_runs
  for update to authenticated using ((select public.is_operator())) with check ((select public.is_operator()));

/*
 * 운영 현황 화면이 왕복 한 번으로 받는 집계. 브라우저에서 표 넷을 따로 세면 왕복 여덟 번이고, `data:review status` 와 같은 수를
 * 두 번 구현하게 된다(ADR-023 결정 4). **건강 판정(초록·노랑·빨강)은 여기서 하지 않는다** — 수만 세고, 임계값과 판정은
 * `src/lib/adminOpsHealth.ts`(T3.3) 한 곳이 가진다. 여기서도 판정하면 규칙이 두 벌이 된다.
 *
 * `security definer` 인 이유는 셋이다 — `net._http_response`(alert 응답 옮겨 적기), `vault.secrets`(Slack 웹훅이 **있는지** 만),
 * `public.rebuild_status()` 의 옮겨 적기. 그래서 `rebuild_status` 와 같은 셋을 지킨다:
 *   1. 첫 줄에서 `auth.uid()` 가 operators 에 있는지 직접 본다(`is_operator()` 는 invoker 라 definer 안에서 뜻이 달라진다). 아니면 42501.
 *   2. anon·PUBLIC 의 execute 를 회수한다.
 *   3. `net`·`vault` 의 컬럼을 그대로 돌려주지 않는다. Slack 은 **이름이 있는지** boolean 하나뿐이고, 웹훅 값(decrypted_secrets)은 읽지도 않는다.
 *
 * jsonb 에서 수를 꺼내는 자리는 전부 `jsonb_typeof(...) = 'number'` 로 감싼다 — 손으로 고친 행 하나(문자열 "3")가 캐스트 오류로
 * 이 함수를 통째로 죽이면, 화면은 "기록 없음" 과 "진단기 고장" 을 같은 얼굴로 보여 준다(`rebuild_status` 머리 주석과 같은 이유).
 *
 * `backlog` 는 `/admin` 의 `fetchPostBacklog` 와 같은 수를 SQL 로 한 번 더 센다(두 벌임을 인정한다, todo/15 T1.2).
 * 단 `blog_posts.excluded_at`(글 단위 분석 제외)은 **어느 마이그레이션에도 없어** 여기서 참조할 수 없다 — 그 칸이 원격에 생기면
 * `/admin` 은 제외한 글을 빼고 이 함수는 넣으므로 두 수가 갈린다. 그 칸의 마이그레이션이 생길 때 여기도 한 줄 더한다.
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

  -- 재빌드 응답 옮겨 적기는 `rebuild_status` 가 이미 한다 — 그대로 부르고(결과는 버린다) 아래에서 `responded_at` 까지 직접 읽는다.
  begin
    perform public.rebuild_status(5);
  exception when others then
    null;
  end;

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
      'rebuilds',   (select count(*) from public.rebuild_log l
                      where l.requested_at >= now() - span and l.hook = 'sent' and l.response_status between 200 and 299),
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
      'rebuilds2xx', (select count(*) from public.rebuild_log l
                      where l.requested_at >= now() - interval '30 days' and l.hook = 'sent' and l.response_status between 200 and 299)),
    -- `rebuild_status(5)` 와 같은 다섯 행 + `responded_at`(재빌드 칸이 "응답 null 이 3분 넘음" 을 이 값 없이 판정할 수 없다).
    'rebuildRecent', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.requested_at desc)
      from (
        select l.requested_at, l.op, l.place_name, l.place_status, l.hook, l.note, l.response_status, l.response_error, l.responded_at
        from public.rebuild_log l
        order by l.requested_at desc
        limit 5
      ) x), '[]'::jsonb),
    'slackConfigured', slack
  ) into result;

  return result;
end;
$fn$;

comment on function public.ops_overview(int) is
  '운영 현황(/admin/ops) 집계 한 벌 — 스크립트별 마지막 실행, 기간 흐름, backlog, 보류, 반영 끊김, 30일 사용량, 최근 재빌드, Slack 웹훅 유무(boolean). 운영자만.';

revoke execute on function public.ops_overview(int) from anon, public;
grant execute on function public.ops_overview(int) to authenticated;

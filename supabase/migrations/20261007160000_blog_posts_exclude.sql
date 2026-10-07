-- 글 단위 분석 제외(docs/todo/09 T3.2). 광고·목록 글은 **글**이 문제라 가게 블랙리스트(`place_blocks`)로는 못 막는다 —
-- 같은 글이 분석될 때마다 엉뚱한 가게 열 곳을 후보로 세운다. `/admin` 의 수집 완료 칸이 글마다 `분석 제외` 를 찍고,
-- `pnpm data analyze`(기본 고르기·`--requested-only`·요청 글 앞줄)와 상주 워커의 "요청 글" 세기가 이 칸이 빈 글만 본다.
--
-- 적용은 사용자 터미널의 `supabase db push` 몫이다(에이전트는 파일만 만든다). 적용 전에도 아무것도 멈추지 않는다 —
-- 스크립트와 화면은 칸이 있는지 먼저 보고(`select excluded_at limit 1`), 없으면 조건 없이 예전처럼 돈다(경고 한 줄 / "미적용" 한 줄).
--
-- GRANT·RLS 는 더하지 않는다: `blog_posts` 의 update 는 표 단위 grant(`20260922120000_narrow_grants.sql` — `grant select, insert, update
-- on table … blog_posts … to authenticated`)와 운영자 정책 `operators_update`(행 단위, 열을 가리지 않는다)뿐이고 열 단위 grant 는 어느
-- 마이그레이션에도 없다. 새 두 칸은 운영자에게 그대로 열리고 anon 에게는 그대로 닫혀 있다.

alter table public.blog_posts
  add column if not exists excluded_at timestamptz,
  add column if not exists exclude_note text;

comment on column public.blog_posts.excluded_at is
  '분석 제외한 시각(글 단위, /admin 수집 완료 칸). null 이 아니면 pnpm data analyze 가 이 글을 고르지 않는다. 09 T3.2.';
comment on column public.blog_posts.exclude_note is
  '분석 제외 사유(운영자 한 줄, 선택). 제외 해제하면 같이 비운다.';

-- 분석이 고르는 집합(`analyzed_at is null and excluded_at is null`)을 최신순으로 — 스크립트의 `unanalyzed()` 와 화면의 미분석 목록이 같은 꼴이다.
-- 옛 `blog_posts_analyzed_at_idx`(전체 analyzed_at)는 분석됨 목록·건수가 그대로 쓰므로 남긴다.
create index if not exists blog_posts_analyze_queue_idx
  on public.blog_posts (posted_at desc nulls last, url)
  where analyzed_at is null and excluded_at is null;

-- 제외 목록·건수(화면의 `제외` 칩) — 몇 건 안 되는 집합이라 작은 부분 인덱스로 둔다.
create index if not exists blog_posts_excluded_idx
  on public.blog_posts (posted_at desc nulls last, url)
  where excluded_at is not null;

/*
 * `ops_overview()` 의 backlog 도 제외한 글을 뺀다 — `20261006120000_pipeline_runs.sql` 머리 주석이 "그 칸의 마이그레이션이 생길 때
 * 여기도 한 줄 더한다" 고 미뤄 둔 것이다. 안 더하면 `/admin` 의 "미분석 N"(제외 뺌)과 `/admin/ops` 의 backlog(제외 넣음)가 갈린다.
 * 본문은 `20261007140000_local_worker.sql` 그대로이고 바뀐 곳은 backlog 의 where 한 줄이다.
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
      from public.blog_posts b where b.analyzed_at is null and b.excluded_at is null),
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

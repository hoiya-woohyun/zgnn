-- 운영 현황 분석 칸의 주의 기준을 **요청한 글** 로(docs/todo/15 T8.6 — 사용자 결정 2026-10-27). 옛 기준 "가장 오래된 미분석 글 2일" 은
-- 저수지(키워드 수집이 쌓고 워커가 일부러 읽지 않는 글, ADR-024 결정 4)까지 세서 서버 워커 운영에선 늘 노랗다 — 노랑이 뜻을 잃었다.
-- 새 기준은 "사람이 읽어 달라고 한 것이 2시간 넘게 안 읽힘" 이고, 그 시각을 이 함수가 한 칸으로 준다: `oldestRequestAt`.
--
-- 요청은 두 갈래다 — 둘 중 더 오래된 쪽(`least` 는 null 을 건너뛴다, 둘 다 없으면 null):
--   ① 요청 글: `blog_posts.requested_at` 이 있고 아직 안 읽은 글(추가 수집에서 왔거나 재분석으로 되돌린 글). 워커의 `analyze --requested-only`
--      와 같은 집합이다 — 분석 제외(`excluded_at`)한 글은 읽지 않으니 세지 않는다.
--   ② 「지금 분석」 요청: `pipeline_requests` 의 `kind = 'analyze'` · `status = 'queued'`. **kind 를 거른다** — collect·apply 요청이 분석 칸을
--      노랗게 하면 안 된다. `taken` 은 세지 않는다(집혔으면 실행 행이 있고, 그 칸의 "돌고 있음·중단된 듯" 이 말한다).
--
-- 화면(`src/lib/adminOpsHealth.ts`)은 키가 **없으면**(이 파일을 올리기 전 원격) 요청 나이를 모르는 것으로 보고 시간 기준 주의를 띄우지 않는다 —
-- 그래서 적용 순서가 화면을 깨지 않는다. 적용은 사용자 터미널의 `supabase db push` 몫이다(에이전트는 파일만 만든다).
--
-- 본문은 `20261007160000_blog_posts_exclude.sql` 그대로이고 더한 것은 `oldestRequestAt` 한 줄이다. 권한·Vault 읽기는 그대로(값 없음, 시각 하나).
-- 부분 인덱스 `blog_posts_requested_unanalyzed_idx (requested_at) where analyzed_at is null`(`20261007140000`)·
-- `pipeline_requests_status_requested_idx (status, requested_at)` 가 두 min 을 받친다.

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
    'requestsQueued', (select count(*) from public.pipeline_requests q where q.status = 'queued'),
    -- 분석 칸의 주의 기준(15 T8.6) — 요청 글·「지금 분석」 요청 중 가장 오래된 시각. 머리 주석의 ①·② 그대로.
    'oldestRequestAt', least(
      (select min(b.requested_at) from public.blog_posts b
        where b.requested_at is not null and b.analyzed_at is null and b.excluded_at is null),
      (select min(q.requested_at) from public.pipeline_requests q
        where q.kind = 'analyze' and q.status = 'queued'))
  ) into result;

  return result;
end;
$fn$;

comment on function public.ops_overview(int) is
  '운영 현황(/admin/ops) 집계 한 벌 — 스크립트별 마지막 실행, 기간 흐름, backlog, 보류, 반영 끊김, 30일 사용량, 최근 재빌드(호출 단위), Slack 웹훅 유무(boolean), 로컬 워커 심장, 대기 중인 요청 수, 가장 오래된 분석 요청 시각(요청 글·「지금 분석」 요청). 운영자만.';

revoke execute on function public.ops_overview(int) from anon, public;
grant execute on function public.ops_overview(int) to authenticated;

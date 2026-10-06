-- 재빌드를 **뒤쪽에서 합친다**(trailing-edge) — 트리거는 줄만 세우고, 1분마다 도는 잡이 조용해진 줄을 한 번에 부른다
-- (docs/todo/13 §5.1 「P2 재빌드를 뒤쪽에서 합친다」 · ADR-018 결정 9 v-next).
--
-- 왜 필요한가 — `20260929121000` 의 트리거는 published 가 끼는 **행마다** Deploy Hook 을 불렀다. `/admin` 일괄 올리기는 묶음마다
--   따로 PostgREST 요청을 보내고(요청 하나 = 문장 하나 = 트랜잭션 하나), 합치기 한 건도 published 행을 여러 문장으로 고친다.
--   36곳을 올리면 훅이 36번을 넘고, Deploy Hook 은 시간당 60번이라 끝쪽 쓰기가 429 로 거절된 채 남는다(BUG-011).
--   문장 단위 트리거(`for each statement`)로 바꿔도 요청이 따로 오므로 **줄지 않는다.**
--
-- 왜 "최근에 보냈으면 건너뛴다"(앞쪽 합치기)가 아닌가 — **쓰기를 잃는다.** 첫 훅이 띄운 빌드가 36번째 쓰기보다 먼저 DB 를 읽으면,
--   그 뒤 35번의 "건너뜀" 이 가리키는 쓰기는 어떤 빌드에도 실리지 않는다. 지켜야 할 불변식은 하나다:
--     **게시에 닿는 쓰기마다, 그 커밋 뒤에 보낸 훅이 하나 있다.**
--   뒤쪽 합치기는 이것을 구조로 지킨다 — 플러시는 자기 스냅샷에 **보이는**(= 커밋된) `queued` 만 잡고, `net.http_post` 는
--   플러시 트랜잭션이 커밋된 뒤에 워커가 보낸다. 아직 커밋 안 된 쓰기의 줄은 안 보여 남고, 다음 분의 플러시가 잡는다.
--
-- 대가 — 빌드가 **1~2분 늦는다**(마지막 쓰기 뒤 60초 조용 + cron 주기 1분). 그리고 쉬지 않고 60초보다 촘촘히 쓰면 그동안은
--   부르지 않는다(멈춘 뒤 1~2분에 한 번). 쓰기를 잃지는 않으므로 최대 대기(max-wait)는 두지 않았다 — 필요해지면 플러시 조건에
--   "가장 오래된 queued 가 N분" 을 OR 로 더하면 된다.
--
-- ⚠️ 새로 생긴 고장 하나 — **cron 이 안 돌면 영원히 안 빌드된다.** 트리거는 줄만 세우고 성공하므로 쓰기도 화면도 멀쩡해 보인다.
--   `rebuild_log` 를 만든 이유(훅이 없으면 조용히 아무 일도 안 일어남)와 같은 모양의 고장이라, 짝으로 화면 경고를 둔다:
--   가장 최근 `queued` 가 5분 넘게 남아 있으면 `/admin` 머리글이 "재빌드 예약이 안 돌고 있어요" 라고 말한다(`src/lib/adminRebuild.ts`).
--   확인할 것은 `select jobname, schedule, active from cron.job where jobname = 'flush-vercel-rebuild'` 한 줄이다.
--
-- 훅 주소 규칙은 그대로다(`20260929121000` 머리 주석 (1)·(2)) — 주소는 컬럼에 넣지 않고, 오류 문구의 주소는 모양으로 지운다.

-- 1. 표 — `queued` 를 더하고, 한 번의 플러시를 묶는 열(`flushed_at`)을 더한다.
--    `request_id` 만으로 묶으면 `missing`·`error` 플러시(요청 id 가 없다)가 행마다 따로 보인다. `now()` 는 트랜잭션 안에서 같은 값이라
--    한 플러시가 잡은 행들이 같은 `flushed_at` 을 갖는다 — 그것이 묶음 열쇠다. 예전 행(직접 보낸 것)은 null 이고 행마다 한 호출이다.
alter table public.rebuild_log drop constraint rebuild_log_hook_check;
alter table public.rebuild_log add constraint rebuild_log_hook_check
  check (hook in ('queued', 'sent', 'missing', 'skipped', 'error'));

alter table public.rebuild_log add column flushed_at timestamptz;
comment on column public.rebuild_log.flushed_at is
  '플러시(public.flush_vercel_rebuild)가 이 행을 잡은 시각. 한 플러시의 행들은 같은 값이라 묶음 열쇠다. queued·skipped·예전 행은 null.';

-- 플러시가 매분 "가장 최근 queued" 를 본다. 평소 queued 는 0행이라 부분 인덱스가 거의 비어 있다.
create index rebuild_log_queued_idx on public.rebuild_log (requested_at) where hook = 'queued';

/*
 * 2. 트리거 — **네트워크를 부르지 않는다.** published 가 끼는지 판단(`20260929121000` 의 1번)은 그대로, 끼면 `queued` 한 줄.
 *    쓰기를 깨지 않는 계약이 더 단순해졌다: Vault 도 pg_net 도 안 건드리므로 여기서 실패할 것은 우리 표의 insert 하나뿐이다.
 *    그 insert 는 일부러 `exception` 으로 감싸지 않는다 — 삼키면 줄이 안 선 쓰기가 **조용히** 빌드에서 빠진다(불변식이 깨진다).
 *    그 경우에는 쓰기가 실패하는 편이 낫다(예전 트리거도 skipped·missing 기록 insert 는 감싸지 않았다).
 *    180일 지운 기록 정리는 매분 도는 플러시로 옮겼다(쓰기 경로에서 하나라도 덜 하려고).
 */
create or replace function public.notify_vercel_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  touched public.places;
  affects boolean;
begin
  if tg_op = 'DELETE' then
    touched := old;
    affects := old.status = 'published';
  elsif tg_op = 'INSERT' then
    touched := new;
    affects := new.status = 'published';
  else
    touched := new;
    affects := old.status = 'published' or new.status = 'published';
  end if;

  insert into public.rebuild_log (op, place_id, place_name, place_status, hook)
  values (tg_op, touched.id, touched.name, touched.status, case when affects then 'queued' else 'skipped' end);

  return null;
end;
$fn$;

comment on function public.notify_vercel_rebuild() is
  'places 변경 → published 가 끼면 public.rebuild_log 에 queued 한 줄(호출은 public.flush_vercel_rebuild 가 묶어서 한다), 아니면 skipped.';

/*
 * 3. 플러시 — 줄이 60초 조용해졌으면 Deploy Hook 을 **한 번** 부르고 잡은 행 전부에 결과를 적는다.
 *
 * 순서가 요점이다:
 *   - 먼저 "가장 최근 queued 가 60초 넘었나" 를 본다. 아직 쓰기가 이어지는 중이면 아무것도 안 하고 다음 분을 기다린다.
 *   - 그다음 `for update skip locked` 로 잡는다. 잡은 것이 0행이면(다른 플러시가 쥐고 있거나 방금 비었다) 부르지 않는다.
 *   - 부른 뒤의 실패(`exception`)는 서브트랜잭션만 되돌린다 — 잡은 행의 잠금은 바깥에 남아 있어 `error` 로 적을 수 있다.
 * `error`·`missing` 은 다시 시도하지 않는다(예전 트리거와 같다). 다음 게시 쓰기가 새 줄을 세우고, 빌드는 DB 전체를 읽으므로
 * 그 한 번이 놓친 변경까지 같이 반영한다.
 *
 * 부르는 곳은 pg_cron 하나다. anon·authenticated·PUBLIC 의 execute 를 회수한다 — 운영자가 rpc 로 불러 한도를 쓸 이유가 없다.
 */
create or replace function public.flush_vercel_rebuild()
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  last_at  timestamptz;
  ids      bigint[];
  hook_url text;
  req_id   bigint;
  fail     text;
begin
  -- 기록을 영원히 쌓아 두지 않는다. 인덱스를 타고 평소엔 0행을 지운다.
  -- `queued` 는 빼고 지운다 — cron 이 오래 죽었다 살아나면 첫 실행이 아직 안 부른 줄을 플러시하기 **전에** 지워 그 쓰기가 빌드에서 빠진다.
  delete from public.rebuild_log where requested_at < now() - interval '180 days' and hook <> 'queued';

  select max(l.requested_at) into last_at from public.rebuild_log l where l.hook = 'queued';
  if last_at is null or last_at > now() - interval '60 seconds' then
    return 0;
  end if;

  select array_agg(q.id) into ids
  from (
    -- 위에서 60초를 잰 집합까지만 잡는다. 그 사이에 커밋된 방금의 쓰기는 다음 분에 — 이어지는 묶음과 함께 한 번에 간다.
    select l.id from public.rebuild_log l where l.hook = 'queued' and l.requested_at <= last_at for update skip locked
  ) q;
  if ids is null then
    return 0;
  end if;

  select decrypted_secret into hook_url
  from vault.decrypted_secrets
  where name = 'vercel_deploy_hook'
  limit 1;

  if hook_url is null or hook_url = '' then
    update public.rebuild_log
    set hook = 'missing', flushed_at = now(),
        note = 'Vault 에 vercel_deploy_hook 이 없어요 — docs/todo/04 의 절차로 한 줄 넣어 주세요.'
    where id = any(ids);
    return cardinality(ids);
  end if;

  begin
    req_id := net.http_post(url := hook_url, body := '{}'::jsonb, timeout_milliseconds := 15000);
    update public.rebuild_log
    set hook = 'sent', request_id = req_id, flushed_at = now()
    where id = any(ids);
  exception when others then
    -- 문구에 훅 주소가 섞여 올 수 있다 — 방금 부른 값과, 그것과 다른 주소의 모양을 둘 다 지운다(`20260929121000` 머리 주석 (2)).
    fail := regexp_replace(replace(coalesce(sqlerrm, ''), hook_url, '<hook>'), 'https?://[^[:space:]"'']+', '<hook>', 'g');
    update public.rebuild_log
    set hook = 'error', flushed_at = now(), note = format('%s: %s', sqlstate, fail)
    where id = any(ids);
  end;

  return cardinality(ids);
end;
$fn$;

comment on function public.flush_vercel_rebuild() is
  'rebuild_log 의 queued 가 60초 조용하면 Vercel Deploy Hook 을 한 번 부르고 잡은 행 전부를 sent(같은 request_id)·missing·error 로 적는다. pg_cron 이 매분 부른다.';

-- service_role 도 걷는다 — `20260922120000` 은 **표**의 default privileges 만 걷어 새 함수에는 Supabase 기본값대로 service_role execute 가 붙는다.
-- 부르는 곳은 pg_cron(postgres) 하나다.
revoke execute on function public.flush_vercel_rebuild() from anon, authenticated, service_role, public;

/*
 * 4. `rebuild_status()` — **한 행 = 한 호출**로 바꾼다. 반환 타입이 바뀌므로 drop 후 다시 만든다(grant 도 다시).
 *
 * 왜 반환 타입을 바꾸나(최소 변경을 따져 본 결과) — 예전처럼 행을 그대로 돌려주면 `limit 5` 가 **행**에 걸린다. 36곳을 묶은 한 호출이
 *   다섯 줄을 다 채우므로 화면은 "N곳 묶어 한 번" 의 N 을 셀 수가 없고, 마지막 장소 이름만 홀로 보인다. 그래서 묶음은 SQL 이 한다.
 *   더하는 칸은 둘: `place_count`(이 호출이 실은 쓰기 수) · `responded_at`(운영 현황이 "응답 null 3분" 판정에 쓰던 값 — 이제
 *   `ops_overview` 가 이 함수를 그대로 읽어 묶는 규칙이 두 벌이 되지 않는다).
 *
 * ⚠️ 묶은 행의 `requested_at` 은 **훅을 부른 시각**(`flushed_at`)이다 — 쓰기 시각이 아니다. 화면의 "응답 3분 대기" 와
 *   "2xx 뒤 10분이면 반영됨" 이 이 값에서 잰다. 쓰기 시각에서 재면 정상 플러시(1~2분 뒤)가 응답 대기 3분을 거의 다 먹어
 *   멀쩡한 호출이 곧바로 "응답을 못 받았어요" 가 된다. `queued` 묶음은 아직 부르지 않았으므로 **가장 최근 쓰기 시각**이다 —
 *   "5분 넘게 대기면 cron 고장" 이 그 값에서 잰다(가장 오래된 것에서 재면 쉬지 않고 쓰는 중에 거짓 경보가 난다).
 *
 * 묶음 열쇠: queued 전부 하나 · request_id · flushed_at(+hook) · 그 밖(skipped·예전 행)은 행마다.
 * 대표 행(장소 이름·상태·note)은 묶음 안 가장 최근 쓰기다. 권한 규칙은 `20260929121000` 의 것을 그대로 옮겼다.
 */
drop function public.rebuild_status(int);

create function public.rebuild_status(n int default 5)
returns table (
  requested_at    timestamptz,
  op              text,
  place_name      text,
  place_status    text,
  hook            text,
  note            text,
  response_status int,
  response_error  text,
  place_count     int,
  responded_at    timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if not exists (select 1 from public.operators where user_id = (select auth.uid())) then
    raise exception '재빌드 기록은 운영자만 볼 수 있어요.' using errcode = '42501';
  end if;

  -- 옮겨 적기(`20260929121000` 의 것 그대로). 한 요청을 공유하는 행 전부가 같은 응답을 받는다.
  begin
    update public.rebuild_log as l
    set response_status = r.status_code,
        response_error  = nullif(regexp_replace(coalesce(r.error_msg, ''), 'https?://[^[:space:]"'']+', '<hook>', 'g'), ''),
        responded_at    = r.created
    from net._http_response as r
    where r.id = l.request_id
      and l.request_id is not null
      and l.responded_at is null;
  exception when others then
    null; -- 옮겨 적지 못했다. 아래 select 는 우리 표만 읽으므로 영향이 없다.
  end;

  -- 최근 1000행 안에서 묶는다 — 180일 전체를 매번 묶지 않으려고. 한 호출이 1000곳을 넘으면 그 수가 덜 세질 뿐이다.
  return query
    with recent as (
      select l.* from public.rebuild_log l order by l.requested_at desc, l.id desc limit 1000
    ),
    keyed as (
      select r.*,
             case
               when r.hook = 'queued' then 'q'
               when r.request_id is not null then 'r' || r.request_id::text
               when r.flushed_at is not null then 'f' || r.flushed_at::text || r.hook
               else 'i' || r.id::text
             end as k
      from recent r
    ),
    grouped as (
      select distinct on (g.k)
             coalesce(max(g.flushed_at) over w, max(g.requested_at) over w) as at,
             g.op, g.place_name, g.place_status, g.hook, g.note,
             max(g.response_status) over w as response_status,
             max(g.response_error) over w as response_error,
             (count(*) over w)::int as place_count,
             max(g.responded_at) over w as responded_at,
             g.id
      from keyed g
      window w as (partition by g.k)
      order by g.k, g.requested_at desc, g.id desc
    )
    select x.at, x.op, x.place_name, x.place_status, x.hook, x.note,
           x.response_status, x.response_error, x.place_count, x.responded_at
    from grouped x
    -- `queued` 묶음은 늘 맨 위다. `requested_at` 은 쓰기 트랜잭션의 **시작** 시각이라 플러시 직전에 시작해 직후에 커밋된 쓰기의 줄이
    -- 방금 부른 묶음(`flushed_at`)보다 이른 시각을 가질 수 있다 — 시각만으로 세우면 대기 중인 쓰기가 있는데 머리글이 "걸렸어요" 라고 한다.
    order by (x.hook = 'queued') desc, x.at desc, x.id desc
    limit greatest(1, least(coalesce(n, 5), 50));
end;
$fn$;

comment on function public.rebuild_status(int) is
  '최근 재빌드 호출(한 행 = 한 호출, place_count 곳을 묶음). 읽기 전에 net._http_response 의 결과를 rebuild_log 로 옮겨 적는다. 운영자만.';

revoke execute on function public.rebuild_status(int) from anon, public;
grant execute on function public.rebuild_status(int) to authenticated;

/*
 * 5. `ops_overview()` — 본문은 `20261006120000` 그대로이고 바뀐 곳은 셋이다.
 *   - `rebuilds`·`rebuilds2xx`: 행이 아니라 **`request_id` distinct** 를 센다. 이제 한 요청에 여러 행이 붙는다 —
 *     행을 세면 36곳 묶은 한 번이 "재빌드 36회" 로 보여 한도(시간당 60)를 읽는 눈을 속인다. 시각도 부른 시각(`flushed_at`)으로 잰다.
 *   - `rebuildRecent`: 표를 직접 읽지 않고 `rebuild_status(5)` 를 읽는다 — 묶는 규칙이 한 벌이 되고, 옮겨 적기도 그 안에서 한다
 *     (예전의 `perform public.rebuild_status(5)` 가 이 select 로 바뀌었다). `ops_overview` 가 운영자 확인을 이미 했으므로 안쪽 확인도 통과한다.
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
      -- 행이 아니라 요청을 센다 — 한 요청에 묶인 행이 여러 개다(위 5번 주석).
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
    'slackConfigured', slack
  ) into result;

  return result;
end;
$fn$;

comment on function public.ops_overview(int) is
  '운영 현황(/admin/ops) 집계 한 벌 — 스크립트별 마지막 실행, 기간 흐름, backlog, 보류, 반영 끊김, 30일 사용량, 최근 재빌드(호출 단위), Slack 웹훅 유무(boolean). 운영자만.';

revoke execute on function public.ops_overview(int) from anon, public;
grant execute on function public.ops_overview(int) to authenticated;

/*
 * 6. pg_cron — 매분 플러시. 확장은 Supabase 문서(「Cron · Install」)의 방식 그대로 `pg_catalog` 에 켜고 `cron` 스키마를 postgres 에 연다.
 *    다시 돌려도 잡이 둘이 되지 않게 같은 이름을 먼저 지우고 만든다(pg_cron 의 같은 이름 덮어쓰기 동작에 기대지 않는다).
 *    잡은 이 마이그레이션을 돌린 역할(postgres)로 돈다 — 플러시가 definer 라 그 역할의 권한과 무관하다.
 */
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'flush-vercel-rebuild';
select cron.schedule('flush-vercel-rebuild', '* * * * *', $$select public.flush_vercel_rebuild()$$);

-- 매분 도는 잡이라 `cron.job_run_details` 가 하루 1,440행씩 쌓이고 호스트는 비워 주지 않는다(Supabase 문서가 정리 잡을 따로 두라고 권한다).
-- 7일이면 "플러시가 매분 실패하고 있다"(아래 화면 경고가 가리키는 곳)를 보기에 충분하다.
select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'prune-cron-run-details';
select cron.schedule('prune-cron-run-details', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

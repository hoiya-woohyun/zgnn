-- /ux-eval 4단계(종합)에서 **메인만** 읽는 실사용 신호 — 지난 7일. docs/decisions/ADR-029-ui-events.md.
--   ./node_modules/.bin/supabase db query --linked -f .claude/skills/ux-eval/signals.sql
--
-- 결과는 **한 줄(JSON)** 이다 — `db query -f` 는 마지막 문장의 결과만 돌려준다. 원본 줄을 읽지 않는다(구독 토큰도 비용이다).
-- 세션이 20 미만이면 숫자 두 개만 낸다 — 초기엔 표본이 거의 없어서, 문턱이 없으면 몇 건의 우연을 신호로 읽는다.
-- 목록마다 **세션 2개 이상**에서 나온 것만 — 한 사람의 버릇이 한 줄을 차지하지 않게.
--
-- 읽는 법: `screens.exits` 는 그 화면을 마지막으로 보고 끝난 세션 수(이탈), `bounces` 는 들어갔다 10초 안에 온 곳으로 돌아간 것,
-- `dead` 는 눌리지 않는 곳을 누른 것(카드를 링크로 알았다 등), `rage` 는 같은 곳 0.7초 간격 세 번. `screen` 은 장소 id 를 접은 경로다.
with ev as (
  select *, regexp_replace(route, '^/place/[^/]+', '/place/:id') as screen
  from public.ui_events
  where received_at >= now() - interval '7 days'
),
views as (
  select
    sid,
    seq,
    screen,
    lag(screen) over w as prev_screen,
    lead(screen) over w as next_screen,
    lead(t_ms) over w - t_ms as dwell_ms
  from ev
  where name = 'view'
  window w as (partition by sid order by seq)
),
screens as (
  select
    screen,
    count(*) as views,
    count(distinct sid) as sessions,
    count(*) filter (where next_screen is null) as exits,
    round((percentile_cont(0.5) within group (order by dwell_ms) filter (where dwell_ms is not null) / 1000)::numeric, 1) as median_dwell_s
  from views
  group by screen
),
bounces as (
  select prev_screen as from_screen, screen as went_to, count(*) as n, count(distinct sid) as sessions
  from views
  where prev_screen is not null and next_screen = prev_screen and dwell_ms < 10000
  group by 1, 2
),
taps as (
  select name, screen, target, count(*) as n, count(distinct sid) as sessions
  from ev
  where name in ('tap', 'dead', 'rage')
  group by 1, 2, 3
  having count(distinct sid) >= 2
),
paths as (
  select
    sid,
    string_agg(screen, ' → ' order by seq) filter (where rn <= 6) || case when count(*) > 6 then ' → …' else '' end as path
  from (select sid, seq, screen, row_number() over (partition by sid order by seq) as rn from ev where name = 'view') x
  group by sid
),
searches as (
  select screen, count(*) as searches, count(*) filter (where n = 0) as zero_results, count(distinct sid) as sessions
  from ev
  where name = 'search'
  group by screen
),
totals as (
  select count(distinct sid) as sessions, count(*) as events from ev
)
select case
  when (select sessions from totals) < 20 then jsonb_build_object(
    'window', '지난 7일',
    'sample', '부족 — 세션 20 미만은 신호로 읽지 않는다',
    'sessions', (select sessions from totals),
    'events', (select events from totals)
  )
  else jsonb_build_object(
    'window', '지난 7일',
    'sessions', (select sessions from totals),
    'events', (select events from totals),
    'builds', (select jsonb_agg(distinct app_build) from ev),
    'screens', (select jsonb_agg(s order by s.views desc) from (select * from screens order by views desc limit 15) s),
    'bounces', (select jsonb_agg(b order by b.n desc) from (select * from bounces where sessions >= 2 order by n desc limit 10) b),
    'dead', (select jsonb_agg(t order by t.n desc) from (select screen, target, n, sessions from taps where name = 'dead' order by n desc limit 15) t),
    'rage', (select jsonb_agg(t order by t.n desc) from (select screen, target, n, sessions from taps where name = 'rage' order by n desc limit 10) t),
    'taps', (select jsonb_agg(t order by t.n desc) from (select screen, target, n, sessions from taps where name = 'tap' order by n desc limit 20) t),
    'paths', (select jsonb_agg(p order by p.sessions desc) from (select path, count(*) as sessions from paths group by path having count(*) >= 2 order by count(*) desc limit 15) p),
    'search', (select jsonb_agg(s order by s.searches desc) from searches s)
  )
end as signals;

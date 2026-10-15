-- **실사용 이벤트** 표. 사이트의 셸이 publishable 키로 insert 만 한다. docs/decisions/ADR-029-ui-events.md.
--
-- ADR-015 §2 "사용자 화면은 런타임 fetch 없음" 을 **두 번째로** 깬다(첫 번째는 `place_reports`, ADR-021). 깨는 범위는 제보와 같다 —
-- "insert 한 번, 읽기 없음". 비로그인 역할에게 select 를 주지 않으므로 보낸 기기도 남의 줄도 읽을 수 없다
-- (보내는 쪽 `uiEventsSend.ts` 는 `Prefer: return=minimal` — RETURNING 을 달라고 하면 select 권한이 필요해 42501).
-- 읽는 것은 운영자의 CLI(`supabase db query --linked`)뿐이다 — `/ux-eval` 이 집계 SQL(`.claude/skills/ux-eval/signals.sql`)로 몇 줄만 읽는다.
--
-- 받지 않는 것(ADR-012 의 선 바깥에 머물기 위해, ADR-021 「받지 않는 것」 과 같은 목록): 연락처 · 위치 · **기기 식별자** · 강아지 프로필 · 판정 결과 ·
-- 화면 글자와 입력값(검색어 포함). `sid` 는 페이지 로드 하나의 임시 아이디(메모리에만, 30분 쉬면 새로)다 — 재방문을 잇지 않는다.
-- `target` 은 요소 종류(`button`·`a:/places/cafe`)나 코드에 적힌 이름표(`data-ev`)뿐이다.
--
-- 경계는 GRANT · RLS · CHECK 셋이다(ADR-021 R2 와 같은 선). 서버 쪽 속도 제한은 두지 않는다. **재빌드 방아쇠가 아니다**(트리거를 붙이지 않는다 —
-- 붙이면 탭 한 번이 프로덕션 빌드 한 번이다).
--
-- 남용은 "표가 커지는 것" 으로 끝나지 않는다 — 무료 플랜은 DB 가 500 MB 를 넘으면 **프로젝트 전체가 읽기 전용**이 될 수 있어서, 이 표를 채우는 스팸이
-- `places`·`/admin` 승인·파이프라인 쓰기까지 멈춘다. 그래서 크기 차단기(`ui_events_size_guard`)를 매분 돌려 150 MB 를 넘으면 `anon_insert` 를 스스로 뗀다
-- (사이트는 42501 을 받고 그 페이지 로드 동안 조용히 멈춘다). 되살리기는 손으로 — 아래 `create policy` 한 줄을 다시 친다.
--
-- **이 표의 글자는 Claude 가 읽는다**(`/ux-eval` 종합). 누구나 publishable 키로 쓸 수 있으니 `route`·`target`·`app_build` 에 문장을 넣으면 그대로
-- 프롬프트가 된다 — 그래서 셋 다 공백 없는 좁은 글자 집합만 받는다(경로·호스트·이름표에 필요한 것뿐). 사이트 쪽도 같은 집합으로 다듬어 보낸다(`uiEvents.ts`).
-- 원본 줄은 90일 뒤 pg_cron 이 지운다. 주간 요약은 `/ux-eval` 의 `00-종합.md` 가 레포에 남기므로 따로 굴린 집계 표를 두지 않는다.
--
-- `20260922120000_narrow_grants.sql` 뒤로 새 표에는 grant 가 자동으로 붙지 않는다 — 아래 grant 가 없으면 정책이 있어도 42501 이다.

create table public.ui_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  sid uuid not null,
  seq integer not null,
  t_ms integer not null,
  name text not null,
  route text not null,
  target text,
  n integer,
  app_build text not null,
  -- 숫자는 `src/lib/uiEvents.ts` 의 상수와 같다. 한쪽만 바꾸면 그 줄이 든 묶음 전체가 400 이 된다.
  constraint ui_events_name_check check (name in ('view', 'tap', 'dead', 'rage', 'search')),
  constraint ui_events_seq_range check (seq between 0 and 5000),
  constraint ui_events_t_ms_range check (t_ms between 0 and 86400000),
  constraint ui_events_route_length check (char_length(route) between 1 and 120),
  constraint ui_events_target_length check (target is null or char_length(target) <= 80),
  constraint ui_events_n_range check (n is null or n between 0 and 100000),
  constraint ui_events_build_length check (char_length(app_build) between 1 and 40),
  -- 글자 집합: 문장(공백·따옴표·괄호)을 못 싣게. 경로(`/place/:id`)·호스트(`map.naver.com`)·이름표(`tab>a:/places`)에 필요한 것만.
  constraint ui_events_route_chars check (route ~ '^[A-Za-z0-9_./:>-]+$'),
  constraint ui_events_target_chars check (target is null or target ~ '^[A-Za-z0-9_./:>-]+$'),
  constraint ui_events_build_chars check (app_build ~ '^[A-Za-z0-9._-]+$'),
  -- 모양: 탭류만 대상이 있고, 검색만 결과 수가 있다. 칸을 엉뚱하게 채운 줄(= 우리 코드가 아닌 쓰기)을 거른다.
  constraint ui_events_target_shape check ((name in ('tap', 'dead', 'rage')) = (target is not null)),
  constraint ui_events_n_shape check ((name = 'search') = (n is not null))
);

comment on table public.ui_events is
  '실사용 이벤트(화면 이동·탭·눌리지 않는 곳·연타·검색 결과 수). 비로그인은 insert 만, 읽기는 운영자 CLI 뿐. 90일 보관. ADR-029.';

create index ui_events_received_at_idx on public.ui_events (received_at);

alter table public.ui_events enable row level security;

-- 열 단위 — `id`·`received_at` 은 보낼 수 없고 기본값이 채운다(받은 시각을 기기가 꾸밀 수 없다).
grant insert (sid, seq, t_ms, name, route, target, n, app_build) on table public.ui_events to anon;

-- 정책은 열어 둔다 — 걸러 내는 것은 위 CHECK 다. 이 정책을 끄는(drop) 것이 남용에 대한 대응이다.
create policy anon_insert on public.ui_events
  for insert to anon
  with check (true);

-- 보관 90일. 하루 한 번, 다른 정리 잡(`prune-cron-run-details`, 03:17)과 겹치지 않는 시각에. 다시 돌려도 같은 잡 하나다.
select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'prune-ui-events';
select cron.schedule('prune-ui-events', '41 3 * * *', $$delete from public.ui_events where received_at < now() - interval '90 days'$$);

-- 크기 차단기 — 위 머리말. 150 MB 는 무료 500 MB 에서 나머지 표(2026-10-15 에 28 MB)와 여유를 빼고 남긴 값이다. 실제 사용은 하루 400방문을 90일 쌓아도 ~70 MB.
-- 정책을 떼면 돌려준다(true) — 매분 도는 잡의 기록(`cron.job_run_details`)은 기존 정리 잡이 7일로 지운다.
create or replace function public.ui_events_size_guard(limit_bytes bigint default 157286400)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if pg_total_relation_size('public.ui_events') <= limit_bytes then
    return false;
  end if;
  drop policy if exists anon_insert on public.ui_events;
  return true;
end;
$$;

-- PostgREST 로 부를 수 없게 — 함수는 기본으로 PUBLIC 에 실행이 열린다. 부르는 것은 cron(postgres) 하나다.
revoke all on function public.ui_events_size_guard(bigint) from public, anon, authenticated;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'ui-events-size-guard';
select cron.schedule('ui-events-size-guard', '* * * * *', $$select public.ui_events_size_guard()$$);

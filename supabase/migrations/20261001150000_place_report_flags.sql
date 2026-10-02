-- 빌드가 **열린 폐업 제보가 있는 장소**를 알게 하는 함수. 상세의 "○년 ○월 확인" 을 그때는 그리지 않는다(ADR-021 R5 · docs/todo/10 T2.3).
--
-- 왜 함수인가: 빌드(`data:pull`)는 비로그인(publishable) 역할로 돈다. 그 역할에게 `place_reports` 의 select 를 주면 제보의 한 줄(note)까지
-- 누구나 읽게 된다 — 제보는 "insert 한 번, 읽기 없음" 으로 못 박았다(R1). 그래서 표는 그대로 닫아 두고, **장소 id 와 종류만** 돌려주는
-- security definer 함수 하나를 연다. 내용·날짜·건수는 나가지 않는다(R5 "건수·제보 내용은 사용자에게 보이지 않는다").
-- 게시중인 장소만, 폐업 갈래(`closed`·`replaced`)만 — 사이트가 이 사실로 하는 일은 날짜를 안 그리는 것 하나뿐이라 그 밖은 줄 이유가 없다.
--
-- 런타임 읽기는 여전히 없다 — 이 함수를 부르는 것은 빌드 하나다. 제보가 들어와도 사이트는 다음 빌드에서야 날짜를 내린다
-- (이 표는 재빌드 방아쇠가 아니다). 운영자가 제보를 처리하면 그 처리가 `places` 를 바꿔 재빌드를 부른다.
create or replace function public.place_report_flags()
returns table (place_id text, kinds text[])
language sql
stable
security definer
set search_path = ''
as $$
  select r.place_id, array_agg(distinct r.kind order by r.kind)
  from public.place_reports r
  join public.places p on p.id = r.place_id
  where r.status = 'open'
    and r.kind in ('closed', 'replaced')
    and p.status = 'published'
  group by r.place_id
  order by r.place_id;
$$;

comment on function public.place_report_flags() is
  '열린 폐업 제보(closed·replaced)가 있는 게시 장소의 id 와 종류만. data:pull 이 빌드 때 부른다 — 제보 내용·건수·날짜는 돌려주지 않는다. ADR-021 R5.';

-- Postgres 는 함수를 만들면 PUBLIC 에 execute 를 준다 — 걷고 필요한 둘에게만 준다(`20260922120000` 의 is_operator 와 같은 어법).
revoke all on function public.place_report_flags() from public;
grant execute on function public.place_report_flags() to anon, authenticated;

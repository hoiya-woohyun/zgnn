-- 사용자 **장소 제보** 표. 사이트의 상세 화면이 publishable 키로 insert 만 한다. docs/decisions/ADR-021-place-reports.md (R1~R5) · docs/todo/10 T1.1.
--
-- 왜 이 표가 처음인가: ADR-015 §2 "사용자 화면은 런타임 fetch 없음" 을 **처음 깬다.** 깨는 범위를 "insert 한 번, 읽기 없음" 으로 못 박는다 —
-- 비로그인 역할에게는 select 를 주지 않는다. 보낸 사람도 자기가 보낸 것을 다시 읽을 수 없다(supabase-js 는 `.insert()` 뒤 `.select()` 를
-- 붙이지 않아야 `return=minimal` 로 201 이 온다 — 붙이면 42501). 그래서 남이 쓴 제보를 긁어 갈 길도 없다.
--
-- 경계는 GRANT · RLS · CHECK 셋이다(R2). 서버 쪽 속도 제한·CAPTCHA 는 두지 않는다 — 익명·답장 없음이라 남용의 효과가 "표가 커지는 것" 뿐이고,
-- 이 표는 **재빌드 방아쇠가 아니다**(`places_notify_vercel_rebuild` 는 `places` 에만 걸려 있다 — 여기에 트리거를 붙이지 않는 것이 의도다.
-- 붙이면 제보 한 건이 프로덕션 빌드 한 번이 되고, 그것은 Deploy Hook 을 공개한 것과 같다). 폭주하면 `anon_insert` 정책 하나를 끄는 것이 대응이다.
--
-- 받지 않는 것(ADR-012 의 선 바깥에 머물기 위해): 연락처 · 위치 · 기기 식별자 · 강아지 프로필 · 판정 결과. 열이 없으니 실을 수도 없다.
-- 비로그인 역할의 insert 는 **열 단위** grant 다 — `status`·`handled_*`·`id`·`created_at` 은 보낼 수 없고 기본값이 채운다.
--
-- 운영자에게도 delete 는 없다(R3, ADR-018 결정 6~8 과 같은 선). `dismissed` 가 삭제다.
-- `20260922120000_narrow_grants.sql` 뒤로 새 표에는 grant 가 자동으로 붙지 않는다 — 아래 grant 가 없으면 정책이 있어도 42501 이다.
create table public.place_reports (
  id             uuid primary key default gen_random_uuid(),
  place_id       text references places (id),            -- suggest(장소 제안)만 null
  kind           text not null,
  note           text,
  app_build      text,                                   -- 어느 배포(=어느 데이터)를 보고 한 말인가. NEXT_PUBLIC_APP_BUILD
  status         text not null default 'open',
  handled_note   text,
  handled_at     timestamptz,
  created_at     timestamptz not null default now(),

  constraint place_reports_kind_check check (
    kind in ('closed', 'replaced', 'address', 'policy', 'phone', 'other', 'visited_ok', 'suggest')
  ),
  constraint place_reports_status_check check (status in ('open', 'handled', 'dismissed')),
  constraint place_reports_note_length check (note is null or char_length(note) <= 200),
  constraint place_reports_build_length check (app_build is null or char_length(app_build) <= 40),
  -- 제안은 장소가 없고 이름(note)이 있어야 한다. 그 밖은 장소가 있어야 한다(상세에서 자동으로 실린다).
  constraint place_reports_shape check (
    (kind = 'suggest' and place_id is null and note is not null and char_length(btrim(note)) > 0)
    or (kind <> 'suggest' and place_id is not null)
  )
);

create index place_reports_place_idx on public.place_reports (place_id) where place_id is not null;
create index place_reports_open_idx on public.place_reports (created_at) where status = 'open';

comment on table public.place_reports is
  '사용자 제보(폐업·주소·조건·전화·기타·다녀왔어요·장소 제안). 비로그인은 insert 만, 운영자는 select·update. delete 없음. ADR-021.';

alter table public.place_reports enable row level security;

grant insert (place_id, kind, note, app_build) on table public.place_reports to anon;
grant select, update on table public.place_reports to authenticated;   -- insert·delete 없음 — 운영자는 처리만 한다

-- 비로그인 insert: 사이트에 보이는 장소에만(R4). places 의 공개 읽기 정책(`anon_read_published`)이 같은 집합을 보므로
-- 하위 질의는 invoker 권한으로도 published 만 찾는다. 열린 상태로만 들어온다(열 grant 가 status 를 막지만 정책도 같은 말을 한다).
create policy anon_insert on public.place_reports
  for insert to anon
  with check (
    status = 'open'
    and handled_at is null
    and handled_note is null
    and (
      (kind = 'suggest' and place_id is null)
      or exists (select 1 from public.places p where p.id = place_id and p.status = 'published')
    )
  );

create policy operators_select on public.place_reports for select to authenticated using ((select is_operator()));
create policy operators_update on public.place_reports for update to authenticated using ((select is_operator())) with check ((select is_operator()));

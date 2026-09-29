-- 이미 올린 장소를 **내리는** 길(소프트 삭제). `/admin` 이 쓴다 — 지금까지는 후보를 올리는 길만 있었다.
--
-- 왜 하드 삭제가 아닌가: 고민한 결과가 아니라 **이미 정해져 있었다.** `20260922120000_narrow_grants.sql` 이
-- authenticated 에 `select, insert, update` 만 주고 `delete` 는 일부러 안 줬다(정책도 delete 가 없다).
-- 그래서 화면에서 행을 지우는 길은 처음부터 막혀 있고(42501), 남은 것은 `status` 를 `archived` 로 바꾸는 것뿐이다.
-- 그 한 글자가 나머지를 알아서 한다 — anon 정책(`using (status = 'published')`)과 `pull-db.mjs` 의
-- `.eq('status','published')` 가 같은 집합을 보므로, 다음 빌드의 `places.json` 에서 그 곳이 빠진다.
-- 그리고 `places` 가 바뀌었으니 `places_notify_vercel_rebuild` 가 그 빌드를 알아서 부른다(재빌드 장치를 새로 만들지 않는다).
--
-- 여기서 더하는 것은 두 칸과 그것을 찍는 트리거뿐이다.
--   archived_at  — 언제 내렸나. 목록을 "최근에 내린 순" 으로 세우고, 되살리면 다시 null 이 된다.
--   archive_note — **왜** 내렸나. 없으면 한 달 뒤에 "이 곳은 폐업인가 중복인가" 를 아무도 모른다.
--                  `candidates.reviewer_note` 와 같은 어법으로 **한 줄씩 덧붙인다**(덮어쓰지 않는다) —
--                  내렸다 되살린 이력이 한 칸 안에 시간순으로 남아야 "왜 내렸고 왜 되살렸나" 가 붙어 읽힌다.
--
-- 시각을 **코드가 아니라 트리거**가 찍는 이유는 `candidates.reviewed_at`(20260928150000)과 같다 — 쓰는 곳이
-- 둘(화면·CLI)이라 한쪽이 잊으면 그 행만 시각이 빈다. 트리거는 잊지 않는다.
alter table places add column if not exists archived_at  timestamptz;
alter table places add column if not exists archive_note text;

comment on column places.archived_at is
  '내린 시각. status 가 archived 로 바뀔 때 트리거가 찍고, 되살리면 null 로 돌린다.';
comment on column places.archive_note is
  '게시 상태를 사람이 바꾼 기록(한 줄씩 덧붙임). 내림 사유와 되살림이 같은 칸에 시간순으로 쌓인다.';

create or replace function set_place_archived_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- INSERT 로 archived 행이 생기는 경로는 지금 없다(`toNewPlaceRow` 는 draft/published 만 만든다).
  -- 그래도 막지 않고 시각만 채운다 — 나중에 다른 경로가 생겼을 때 시각만 비는 행이 남는 쪽이 더 나쁘다.
  if tg_op = 'INSERT' then
    if new.status = 'archived' and new.archived_at is null then
      new.archived_at = now();
    end if;
    return new;
  end if;

  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_at = now();
  elsif new.status is distinct from 'archived' and old.status = 'archived' then
    -- 되살린 행에 내린 시각이 남아 있으면 목록이 그것을 "내린 곳" 으로 정렬한다. 사유(archive_note)는 이력이라 남긴다.
    new.archived_at = null;
  end if;
  return new;
end;
$$;

-- `before update of status` 로 좁힌다 — 이름·조건문만 고치는 UPDATE 마다 이 함수를 부를 이유가 없다.
-- 같은 테이블의 다른 BEFORE 트리거(`places_set_updated_at`)와 이름순으로 나란히 돌고(archived < updated),
-- 둘은 서로 다른 칸만 만지므로 순서가 결과를 바꾸지 않는다.
drop trigger if exists places_set_archived_at on places;
create trigger places_set_archived_at
  before insert or update of status on places
  for each row
  execute function set_place_archived_at();

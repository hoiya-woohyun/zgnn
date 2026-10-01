-- 가게 **차단 목록**. 분석(`pnpm data:analyze`)이 실행마다 읽어, 여기 걸린 가게는 후보를 만들지 않는다. docs/decisions/ADR-020 (D1·D2).
--
-- 왜 새 표인가(D1): 분석은 지금 `candidates.status = 'pending'` 만 읽는다(`scripts/analyze-candidates.mjs`) — 반려한 가게를 쓴 새 글이
-- 오면 **매번 다시 후보로 올라온다.** 그렇다고 `rejected` 를 차단으로 재활용하면 `[admin] 재분석` 으로 눕힌 행과 `중복` 반려까지
-- 차단이 된다(재분석한 가게가 다시 안 올라온다). 제외는 **가게**에 대한 결정이고 후보는 그 가게의 **글 하나**다 — 개체가 달라 표가 따로 있어야 한다.
-- 키는 `name_key`(normalizeName(이름), 후보의 `extracted.nameKey` 와 같은 함수) + 선택 `town`(주소의 읍·면). 이름만으로 막으면
-- 체인·동명 가게(우도 카페살레 vs 본섬)가 같이 막힌다 — `town` 이 있으면 둘 다 맞아야 걸리고, 후보 쪽 읍·면을 모르면 이름만으로 건다.
--
-- 왜 스케줄러가 없나(D2): 「3개월 뒤 자동 해제」 는 돌아가는 것이 아니라 **비교**다. cron·Actions 가 없다(ADR-016 v5). 분석이 읽는 순간
-- `until is null or until > now()` 인 행만 보면 지난 제외는 저절로 안 걸리고, 영구는 `until null` 이다. 일찍 푸는 것은 `lifted_at` 을
-- 찍는다 — DELETE 는 일부러 안 준다(`20260922120000_narrow_grants.sql` 과 같은 소프트 삭제 경계).
--
-- 비로그인(공개) 역할에는 아무것도 주지 않는다 — 운영자의 결정이고 사이트가 읽을 이유가 없다. `candidate_id`·`place_id` 는 어디서 걸었나(후보 반려 /
-- 장소 등록 해제)와, 되살릴 때 풀 행을 찾는 열쇠다 — 분석의 판정 축이 아니다(이름 축 하나, D6).
create table public.place_blocks (
  id            uuid primary key default gen_random_uuid(),
  name_key      text not null,                 -- normalizeName(이름). candidates.extracted.nameKey 와 같은 함수
  town          text,                          -- 읍·면(있으면 둘 다 맞아야 걸린다). null = 이름만
  display_name  text not null,                 -- 화면용 원 이름
  reason        text not null,                 -- REJECT_REASONS 또는 ARCHIVE_REASONS 의 값
  note          text,
  until         timestamptz,                   -- null = 영구
  lifted_at     timestamptz,                   -- 일찍 푼 시각(DELETE 없음)
  candidate_id  uuid references candidates (id),
  place_id      text references places (id),
  created_at    timestamptz not null default now()
);

create index place_blocks_name_key_idx on public.place_blocks (name_key);

alter table public.place_blocks enable row level security;

grant select, insert, update on table public.place_blocks to authenticated;   -- delete 없음

create policy operators_select on public.place_blocks for select to authenticated using ((select is_operator()));
create policy operators_insert on public.place_blocks for insert to authenticated with check ((select is_operator()));
create policy operators_update on public.place_blocks for update to authenticated using ((select is_operator())) with check ((select is_operator()));

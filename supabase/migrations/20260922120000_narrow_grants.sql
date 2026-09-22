-- 테이블 권한(GRANT)을 스크립트가 실제로 하는 일만큼으로 좁힌다 (ADR-016 v5: Actions 폐지 — 인증 출처는 세션(운영자 JWT)·anon(publishable) 둘뿐).
--
-- 왜 지금인가 — 앞선 두 마이그레이션은 "service_role 은 RLS 를 우회하므로 이 파일과 무관" 이라고 썼다. 그 키는 퇴역했고(legacy API keys disable)
-- 새 secret key 는 만들지 않는다. 남은 두 출처는 둘 다 RLS 를 지나므로, 이제는 **GRANT 가 곧 상한** 이다: RLS 정책은 "어느 행" 을 가르고 GRANT 는
-- "어느 동작" 을 가른다. Supabase 의 기본 default privileges 는 postgres 가 만드는 모든 테이블에 anon·authenticated 에 ALL(select/insert/update/
-- delete/truncate/references/trigger)을 붙인다 — 그 위에서는 정책 실수 하나(`for all` 을 `using (true)` 로 잘못 고치는 식)가 delete·truncate 까지 연다.
-- GRANT 를 스크립트가 쓰는 동작으로 내려 두면, 정책이 틀려도 delete 는 42501 로 막힌다(방어선 둘).
--
-- 스크립트별 테이블 동작(2026-09-22 실측 — scripts/*.mjs 의 supabase-js 호출 전수. `.delete(` 는 0개, 쓰기에 `.select()` 를 체인한 곳도 0개 →
-- Prefer: return=minimal, RETURNING 없음). scripts/analyze/*.mjs · scripts/collect/*.mjs 는 순수 함수라 DB 를 만지지 않는다.
--
--   스크립트                 출처   places                 items            blog_posts                       candidates        place_sources          operators
--   pull-db.mjs              anon   select(published)      select           –                                –                 –                      –
--   seed-db.mjs              세션   upsert(id) → do update upsert → do upd  –                                –                 –                      –
--   collect-blog.mjs         세션   –                      –                select(url) · upsert(url,        –                 –                      –
--                                                                            ignoreDuplicates → do nothing)
--   analyze-candidates.mjs   세션   select(≠archived)      –                select · update(analyzed_at)     insert            –                      –
--   apply-approved.mjs       세션   select · update ·      –                –                                select · update   upsert(ignoreDuplicates –
--                                   insert(draft)                                                                                → do nothing)
--   is_operator() (세션 정책 안)                                                                                                                      select(자기 행)
--
--   upsert 두 종류를 나눠 읽는다 — seed-db 는 ignoreDuplicates 없음 = `on conflict do update` 라 insert 정책(with check)과 update 정책(using+with check)
--   둘 다 지나고, collect·apply 의 ignoreDuplicates: true 는 `on conflict do nothing` 이라 insert 만 지난다. update 의 `.eq('id'|'url', …)` 는 WHERE 로
--   기존 행을 읽으므로 select 권한(과 select 정책)도 함께 걸린다 — 아래 grant 가 select 를 항상 포함하는 이유.
--   place_sources 는 어떤 스크립트도 읽지 않지만 다섯 테이블을 같은 모양(select/insert/update)으로 둔다 — 표만 보고 "왜 이것만 다른가" 를 캐지 않게.
--
-- service_role 은 어느 문장에도 넣지 않는다 — Supabase 내부 역할이고 키는 이미 꺼져 있다. 여기서 만지면 대시보드 쪽 동작이 어디서 깨지는지 예측할 수 없다.
-- Studio(SQL editor · Table editor)는 postgres(테이블 소유자)로 돌므로 이 파일의 영향을 받지 않는다 — 사람이 Studio 에서 지우는 건 그대로 된다.

-- 1. 기존 여섯 테이블의 기본 ALL 을 전부 걷어낸다. default privileges 변경(4)은 소급되지 않으므로 이미 있는 테이블은 이름을 불러 직접 회수해야 한다.
--    references 회수는 안전하다 — FK 검사(candidates→blog_posts/places · place_sources→places/blog_posts)는 제약 소유자 권한으로 돌아 호출자의 권한을 안 본다.
--    trigger 회수도 안전하다 — places_set_updated_at 은 이미 만들어져 있고, 발화 시점에는 호출자의 trigger 권한을 확인하지 않는다.
revoke all on table places, items, blog_posts, candidates, place_sources, operators from anon, authenticated;

-- 2. anon(publishable 키 = Vercel 빌드의 data:pull): places·items 의 select 뿐. 행 범위는 기존 정책(anon_read_published · anon_read_items)이 그대로 가른다.
grant select on table places, items to anon;

-- 3. authenticated(운영자 세션): 표의 합집합 = 다섯 테이블 select/insert/update. delete 는 어느 스크립트도 안 하므로 주지 않는다.
--    operators 는 select 만 — is_operator() 가 invoker 라 호출자 권한으로 operators 를 읽는다. 이 grant 가 없으면 운영자의 모든 쿼리가 정책 평가에서 42501.
grant select, insert, update on table places, items, blog_posts, candidates, place_sources to authenticated;
grant select on table operators to authenticated;

-- (시퀀스 없음 — 스키마의 키는 전부 text/uuid(gen_random_uuid) 이고 serial·identity 컬럼이 없다. 생기면 그 마이그레이션에서 usage 를 준다.)

-- 4. 앞으로 postgres 가 만드는 테이블에는 anon·authenticated 기본 grant 를 붙이지 않는다(`db push` 와 Studio Table editor 둘 다 postgres 로 만든다).
--    함정: 이 뒤로 새 테이블은 RLS 정책을 붙여도 명시 grant 전엔 API 로 아무도 못 본다 — 증상은 42501 "permission denied for table" 이고, 정책 버그처럼
--    읽힌다. grant 는 했는데 정책이 없으면 그때는 조용한 `[]`. 새 테이블 마이그레이션에 grant 한 줄을 같이 쓰는 것이 규칙이다.
--    postgres 역할의 default privileges 만 바꾼다 — supabase_admin 이 만드는 객체(확장 등)는 이 파일이 다루지 않고 다룰 수도 없다(멤버가 아니다).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- 5. `for all` 정책 → 동작별 세 정책. GRANT(3) 가 delete 를 이미 막지만 정책도 같은 말을 하게 둔다 — 한쪽을 실수로 넓혀도 다른 쪽이 남는다.
--    (select is_operator()) 로 감싸는 이유는 이전 마이그레이션과 같다(쿼리당 한 번 평가, initPlan). anon 정책 둘과 operators_read_self 는 건드리지 않는다.
drop policy operators_all on places;
create policy operators_select on places for select to authenticated using ((select is_operator()));
create policy operators_insert on places for insert to authenticated with check ((select is_operator()));
create policy operators_update on places for update to authenticated using ((select is_operator())) with check ((select is_operator()));

drop policy operators_all on items;
create policy operators_select on items for select to authenticated using ((select is_operator()));
create policy operators_insert on items for insert to authenticated with check ((select is_operator()));
create policy operators_update on items for update to authenticated using ((select is_operator())) with check ((select is_operator()));

drop policy operators_all on blog_posts;
create policy operators_select on blog_posts for select to authenticated using ((select is_operator()));
create policy operators_insert on blog_posts for insert to authenticated with check ((select is_operator()));
create policy operators_update on blog_posts for update to authenticated using ((select is_operator())) with check ((select is_operator()));

drop policy operators_all on candidates;
create policy operators_select on candidates for select to authenticated using ((select is_operator()));
create policy operators_insert on candidates for insert to authenticated with check ((select is_operator()));
create policy operators_update on candidates for update to authenticated using ((select is_operator())) with check ((select is_operator()));

drop policy operators_all on place_sources;
create policy operators_select on place_sources for select to authenticated using ((select is_operator()));
create policy operators_insert on place_sources for insert to authenticated with check ((select is_operator()));
create policy operators_update on place_sources for update to authenticated using ((select is_operator())) with check ((select is_operator()));

-- 6. is_operator() 의 execute. 이 함수가 뜻이 있는 자리는 authenticated 정책 안뿐이다. anon 이 /rest/v1/rpc/is_operator 를 부르면 (1) 뒤로는 어차피
--    operators 읽기에서 42501 이 나지만, 그 오류 문구가 테이블 이름(operators)을 실어 나간다 — 함수 자체를 못 부르게 두면 문구는 함수 이름뿐이다.
--    public 을 함께 회수해야 효과가 있다 — Postgres 는 함수 생성 시 PUBLIC 에 execute 를 주므로 anon 만 빼면 PUBLIC 경유로 그대로 실행된다.
--    그래서 authenticated 에는 **명시적으로 다시 준다**: PUBLIC 회수 뒤 authenticated 의 execute 가 Supabase 기본 grant 에 기대고 있었다면 운영자의
--    모든 쿼리가 "permission denied for function is_operator" 로 죽고, 그 증상은 pnpm test 로는 보이지 않는다. 이미 있으면 no-op 이다.
--    어드바이저: execute 축소를 경고하는 린트는 없다(0028/0029 는 definer 함수의 노출 경고였고 invoker 로 이미 닫았다).
--    PUBLIC 회수는 service_role 이 PUBLIC 경유로 갖던 execute 도 걷는다(머리 주석의 "service_role 은 안 만진다" 의 유일한 예외) — 실효는 없다:
--    service_role 은 bypassrls 라 정책을 평가하지 않고, 스크립트에 .rpc( 는 0개다.
revoke execute on function public.is_operator() from anon, public;
grant execute on function public.is_operator() to authenticated;

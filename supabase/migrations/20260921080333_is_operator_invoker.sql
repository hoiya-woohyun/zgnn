-- 직전 마이그레이션의 is_operator() 는 security definer 였다 — Supabase 어드바이저 0028/0029: definer 함수는 /rest/v1/rpc 로 anon·authenticated 가
-- 부를 수 있다고 경고한다(반환값은 "호출자가 운영자인가" 뿐이라 실해는 없지만, 경고를 남기면 다음 진짜 경고가 묻힌다).
-- invoker 로 바꾸면 함수 안의 operators 조회에 RLS 가 걸리므로, 자기 행 하나만 읽는 정책을 operators 에 둔다.
-- 결과: 운영자는 자기 행만 보이고(목록 열거 불가), 비운영자는 빈 결과 → is_operator() 가 false.
alter function is_operator() security invoker;

create policy operators_read_self on operators
  for select to authenticated
  using (user_id = (select auth.uid()));

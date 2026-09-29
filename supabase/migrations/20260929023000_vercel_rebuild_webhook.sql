-- places 가 바뀌면 Vercel 을 한 번 불러 사이트를 다시 빌드한다 (docs/todo/04 의 4b).
--
-- 대시보드 Integrations → Webhooks 로도 같은 것을 만들 수 있지만(그쪽은 supabase_functions.http_request 래퍼를
-- 쓴다) 여기 SQL 로 둔 이유는 **레포가 스키마의 정본**이어서다 — 대시보드에서 만든 트리거는 마이그레이션에
-- 안 남아 다음 사람이 "왜 승인하면 빌드가 도나" 를 찾을 곳이 없다.
--
-- ⚠️ Deploy Hook URL 은 이 파일에 없다. 시크릿이라 레포에 둘 수 없어서(ADR-016) **Vault** 에 넣는다:
--     select vault.create_secret('<Deploy Hook URL>', 'vercel_deploy_hook', 'Vercel main 배포 훅');
--   Studio SQL Editor 에서 운영자가 한 번 실행한다. 그때까지 아래 함수는 아무 일도 하지 않는다(no-op).
--   훅을 바꿀 때는 vault.update_secret, 끊을 때는 그 비밀을 지우면 된다 — 트리거는 그대로 둬도 된다.
create extension if not exists pg_net;

create or replace function public.notify_vercel_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  hook_url text;
begin
  -- 훅이 없으면 조용히 끝낸다. 여기서 예외를 던지면 트리거가 쓰기와 같은 트랜잭션이라
  -- /admin 의 모든 승인과 data:apply 가 통째로 실패한다 — 재빌드는 부가 기능이지 쓰기의 조건이 아니다.
  select decrypted_secret into hook_url
  from vault.decrypted_secrets
  where name = 'vercel_deploy_hook'
  limit 1;

  if hook_url is null or hook_url = '' then
    return null;
  end if;

  -- Deploy Hook 은 본문을 보지 않는다. pg_net 은 비동기라 응답을 기다리지 않는다 — 결과는 net._http_response 에 쌓인다.
  perform net.http_post(url := hook_url, body := '{}'::jsonb);
  return null;
end;
$fn$;

comment on function public.notify_vercel_rebuild() is
  'places 변경 → Vercel Deploy Hook(Vault 의 vercel_deploy_hook) 호출. 훅이 없으면 no-op. 절차는 docs/todo/04.';

-- 행 단위다. statement 단위로 두면 0행을 건드린 UPDATE 도 빌드를 한 번 부른다.
-- 우리 쓰기는 한 번에 한 행이라 요청 수는 같고, 여러 행을 한 문장으로 바꾸는 날에도 Vercel 이 같은 브랜치의
-- 대기 중 빌드를 건너뛴다(docs/todo/04 의 🙋 "승인 N건 = 빌드 N번" 관찰 항목).
drop trigger if exists places_notify_vercel_rebuild on public.places;
create trigger places_notify_vercel_rebuild
after insert or update or delete on public.places
for each row execute function public.notify_vercel_rebuild();

-- 재빌드 훅의 응답 대기를 5초 → 15초로. `20260929023000` 의 함수를 그대로 바꿔 쓴다.
--
-- 왜: pg_net 의 기본 timeout 이 5초인데 Vercel Deploy Hook 이 그 안에 응답하지 않았다(실측 2026-09-29:
-- `Timeout of 5000 ms reached. Total time: 5002ms — DNS 9ms · TCP/SSL 268ms · HTTP 4723ms`).
-- **빌드는 정상으로 걸렸다** — 요청은 갔고 Vercel 이 받아 배포를 시작했으며, 다만 우리 쪽이 응답을 못 받아
-- `net._http_response.status_code` 가 null 로 남았다. 그래서 고장은 아니지만 **관측이 죽는다**:
-- docs/todo/04 의 확인 절차("status_code 가 200/201 인가")가 성공과 실패를 구분할 수 없게 된다.
-- 응답을 못 받는 것이 위험한 이유가 하나 더 있다 — pg_net 은 재시도하지 않으므로, 훅이 폐기되거나 URL 이
-- 틀려 4xx 가 와도 타임아웃과 똑같이 null 로 보인다. 그러면 "승인했는데 사이트가 안 바뀐다" 를 진단할 단서가 없다.
--
-- 15초로 둔 이유: 실측이 4.7초였으니 3배 남긴다. 이 대기는 pg_net 백그라운드 워커가 하는 것이고
-- 트리거는 `perform` 으로 요청만 큐에 넣고 바로 끝나므로, **쓰기(승인)가 15초 동안 붙잡히지 않는다.**
create or replace function public.notify_vercel_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  hook_url text;
begin
  select decrypted_secret into hook_url
  from vault.decrypted_secrets
  where name = 'vercel_deploy_hook'
  limit 1;

  if hook_url is null or hook_url = '' then
    return null;
  end if;

  perform net.http_post(
    url := hook_url,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  return null;
end;
$fn$;

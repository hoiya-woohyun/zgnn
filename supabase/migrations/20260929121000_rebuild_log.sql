-- 재빌드가 **실제로 불렸는지** 를 남긴다 + 게시에 영향 없는 변경으로는 빌드를 부르지 않는다.
--
-- 왜 필요한가 — `20260929023000` 의 함수는 훅이 없으면 **조용히 아무 일도 하지 않는다**(`return null`).
-- 그게 그 자리에서는 옳은 선택이었다(재빌드는 부가 기능이지 쓰기의 조건이 아니다). 대가는 이것이다:
--   Vault 의 비밀이 지워졌거나 이름이 틀렸거나, Vercel 에서 훅을 폐기해 404 가 나도 **화면은 똑같이**
--   "사이트에는 다음 빌드에서 보여요" 라고 말한다. 승인은 성공하고 사이트는 영원히 안 바뀌는데,
--   운영자가 그것을 알 방법이 앱 안에 없다. `net._http_response` 는 스키마 `net` 에 있어 PostgREST 로 보이지 않고,
--   authenticated 에는 그 스키마 usage 가 없다 — 즉 **Studio 를 열지 않으면 진단이 불가능**했다.
--
-- 이 문제가 지금 급해진 이유: Deploy Hook URL 이 에이전트 대화 기록에 남아(docs/todo/05) 폐기·재발급이
-- 권장되는데, **재발급을 하고 Vault 에 잘못 붙여 넣으면 증상이 "아무 일도 안 일어남" 이다.** 회전을 안전하게
-- 만드는 것은 새 URL 이 아니라 "회전이 됐는지 확인할 수 있는 자리" 다. 그 자리를 여기서 만든다.
--
-- ⚠️ 이 표에 **훅 주소는 절대 들어가지 않는다.** 이 표는 운영자(authenticated)가 읽지만 Vault 는 못 읽으므로,
--   그 경계를 이 표가 깨면 안 된다. 지키는 방법이 둘이다:
--     (1) insert 문들이 `hook_url` 을 컬럼에 넣지 않는다.
--     (2) pg_net 이 준 오류 문구에는 주소가 섞여 올 수 있다(libcurl 오류가 URL 을 싣는다) → 저장 전에 **모양으로** 지운다.
--   (2) 를 "지금 Vault 에 있는 값과 같으면 지운다" 로 두면 **회전 직후에 옛 주소가 그대로 저장된다** —
--   v1 로 보낸 요청의 오류 문구를 v2 로 바꾼 뒤에 읽어 적으면 v1 과 일치하는 것이 없다. 그게 바로 이 표를 만든 이유인
--   "회전" 시나리오라, 값 비교가 아니라 `https?://…` 패턴을 지운다. 비밀이 지워진 상태에도 같은 규칙이 돈다.

create table public.rebuild_log (
  id              bigint generated always as identity primary key,
  requested_at    timestamptz not null default now(),
  op              text not null,                  -- INSERT | UPDATE | DELETE
  place_id        text,
  place_name      text,
  place_status    text,                           -- 쓰기 뒤 상태(DELETE 면 지워진 행의 상태)
  -- sent: 훅으로 보냈다 · missing: Vault 에 훅이 없다(예전의 조용한 no-op) ·
  -- skipped: 게시 집합이 안 바뀌어 부르지 않았다 · error: 보내다 터졌다(쓰기는 살렸다)
  hook            text not null check (hook in ('sent', 'missing', 'skipped', 'error')),
  request_id      bigint,                         -- net.http_post 가 준 id. net._http_response.id 와 짝
  note            text,                           -- error 일 때 sqlstate + 사유(훅 주소는 지운 뒤)
  response_status int,                            -- 아래 rebuild_status() 가 net 에서 옮겨 적는다
  response_error  text,
  responded_at    timestamptz
);

create index rebuild_log_requested_at_idx on public.rebuild_log (requested_at desc);

comment on table public.rebuild_log is
  'places 변경 → Vercel 재빌드 호출 기록. 훅 주소는 담지 않는다. 읽는 길은 public.rebuild_status().';

-- 새 테이블에는 grant 도 정책도 자동으로 붙지 않는다(`20260922120000` 의 4번 주석 — default privileges 를 걷어 뒀다).
-- **select 만** 준다: 넣는 쪽은 아래 트리거 함수(security definer, 소유자 postgres)라 authenticated 의 insert 권한이 필요 없고,
-- 주지 않는 것이 곧 "운영자가 기록을 위조할 수 없다" 는 뜻이다. identity 시퀀스도 같은 이유로 usage 를 주지 않는다.
alter table public.rebuild_log enable row level security;
grant select on table public.rebuild_log to authenticated;

create policy operators_select on public.rebuild_log
  for select to authenticated
  using ((select public.is_operator()));

/*
 * 트리거 함수를 다시 쓴다(`20260929030000` 의 것을 대체). 더하는 일은 둘이다.
 *
 * 1. **게시 집합이 바뀌는 변경에만 훅을 부른다.** 빌드가 읽는 것은 `status = 'published'` 뿐이므로
 *    (`pull-db.mjs`, anon 정책), draft 를 고치거나 내린 곳을 또 고치는 UPDATE 는 만들어지는 사이트가
 *    **한 바이트도 다르지 않다.** 그런 변경까지 빌드를 부르면 Hobby 의 하루 배포 횟수를 이유 없이 쓴다
 *    (docs/todo/04 의 🙋 "승인 N건 = 빌드 N번"). 소프트 삭제가 들어오면서 이 갈래가 실제로 생겼다 —
 *    초안을 내리는 것은 사이트와 무관한 정리 작업이다.
 *    ⚠️ 판단 기준은 "published 가 끼어 있나" 다. UPDATE 는 **이전이나 이후 중 하나라도** published 면 부른다
 *    (게시 → 내림 = 사라져야 하고, 내림 → 게시 = 나타나야 한다. 어느 쪽도 빼면 사이트가 DB 와 어긋난다).
 * 2. **무엇을 했는지 남긴다.** 위 표에.
 *
 * 쓰기를 깨지 않는다는 원래 계약은 그대로다. 훅이 없으면 기록만 남기고 끝내고, 보내다 터져도
 * `exception` 으로 받아 기록만 남긴다 — 여기서 예외가 올라가면 트리거가 쓰기와 같은 트랜잭션이라
 * `/admin` 의 승인과 `data:apply` 가 통째로 실패한다.
 */
create or replace function public.notify_vercel_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  hook_url text;
  touched  public.places;
  affects  boolean;
  req_id   bigint;
  fail     text;
begin
  if tg_op = 'DELETE' then
    touched := old;
    affects := old.status = 'published';
  elsif tg_op = 'INSERT' then
    touched := new;
    affects := new.status = 'published';
  else
    touched := new;
    affects := old.status = 'published' or new.status = 'published';
  end if;

  -- 기록을 영원히 쌓아 두지 않는다. 쓰기가 하루 몇 건인 규모라 이 DELETE 는 사실상 0행을 지운다.
  delete from public.rebuild_log where requested_at < now() - interval '180 days';

  if not affects then
    insert into public.rebuild_log (op, place_id, place_name, place_status, hook)
    values (tg_op, touched.id, touched.name, touched.status, 'skipped');
    return null;
  end if;

  select decrypted_secret into hook_url
  from vault.decrypted_secrets
  where name = 'vercel_deploy_hook'
  limit 1;

  if hook_url is null or hook_url = '' then
    insert into public.rebuild_log (op, place_id, place_name, place_status, hook, note)
    values (tg_op, touched.id, touched.name, touched.status, 'missing',
            'Vault 에 vercel_deploy_hook 이 없어요 — docs/todo/04 의 절차로 한 줄 넣어 주세요.');
    return null;
  end if;

  begin
    req_id := net.http_post(url := hook_url, body := '{}'::jsonb, timeout_milliseconds := 15000);
    insert into public.rebuild_log (op, place_id, place_name, place_status, hook, request_id)
    values (tg_op, touched.id, touched.name, touched.status, 'sent', req_id);
  exception when others then
    -- 문구에 훅 주소가 섞여 올 수 있다. 이 표는 Vault 를 못 읽는 역할이 읽으므로 주소만은 지운다.
    -- 두 번 지운다: 방금 부른 그 값(정확하다)과, 그것과 다른 주소가 섞여 온 경우를 위한 모양(머리 주석 (2)).
    fail := regexp_replace(replace(coalesce(sqlerrm, ''), hook_url, '<hook>'), 'https?://[^[:space:]"'']+', '<hook>', 'g');
    insert into public.rebuild_log (op, place_id, place_name, place_status, hook, note)
    values (tg_op, touched.id, touched.name, touched.status, 'error', format('%s: %s', sqlstate, fail));
  end;

  return null;
end;
$fn$;

comment on function public.notify_vercel_rebuild() is
  'places 변경 → Vercel Deploy Hook(Vault 의 vercel_deploy_hook). published 가 끼는 변경만 부르고, 결과는 public.rebuild_log 에 남긴다.';

/*
 * 운영자가 "빌드가 돌았나" 를 앱 안에서 보는 유일한 길.
 *
 * `security definer` 인 이유는 하나뿐이다 — `net._http_response` 가 스키마 `net` 에 있고 authenticated 에는 그 usage 가 없다.
 * 어드바이저(0028/0029)는 /rest/v1/rpc 로 부를 수 있는 definer 함수를 경고하는데(`20260921080333` 에서 `is_operator()` 를
 * invoker 로 바꾼 이유), 이 함수는 invoker 로 만들 수가 없다. 그래서 대신 셋을 지킨다:
 *   1. 첫 줄에서 **운영자인지 직접 확인**하고 아니면 42501 로 던진다. `is_operator()` 를 부르지 않는다 —
 *      그 함수는 invoker 라 definer 안에서는 호출자가 postgres 가 돼 뜻이 달라진다. 여기서는 `auth.uid()` 를 직접 본다
 *      (역할과 무관하게 요청의 JWT claim 을 읽으므로 definer 안에서도 맞는 답이 나온다).
 *   2. anon·PUBLIC 의 execute 를 회수한다(`is_operator()` 와 같은 처리 — PUBLIC 을 안 걷으면 anon 이 그 경유로 그대로 부른다).
 *   3. `net` 의 컬럼을 **그대로 돌려주지 않는다.** 필요한 값만 우리 표(`rebuild_log`)로 옮겨 적고 우리 컬럼만 돌려준다.
 *
 * 옮겨 적는(back-fill) 이유가 하나 더 있다: pg_net 의 응답은 오래 남지 않는다(`net._http_response` 는 unlogged 이고
 * 워커가 주기적으로 지운다). 옮겨 두지 않으면 어제 빌드가 성공했는지를 오늘 알 수 없다. 그래서 이 함수는 읽기 전에
 * 비어 있는 칸을 채운다 — `stable` 이 아니라 `volatile` 인 이유다.
 *
 * 응답이 아직 안 왔으면 `response_status` 는 null 로 남는다(실측 4.7초). 그것은 고장이 아니라 **대기**다 —
 * 화면이 그 둘을 다른 말로 보여 준다.
 */
create or replace function public.rebuild_status(n int default 5)
returns table (
  requested_at    timestamptz,
  op              text,
  place_name      text,
  place_status    text,
  hook            text,
  note            text,
  response_status int,
  response_error  text
)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if not exists (select 1 from public.operators where user_id = (select auth.uid())) then
    raise exception '재빌드 기록은 운영자만 볼 수 있어요.' using errcode = '42501';
  end if;

  /*
   * 아직 결과를 못 적은 요청만 채운다. Vault 를 **읽지 않는다** — 주소는 모양으로 지우므로 값이 필요 없고,
   * 안 읽는 만큼 이 함수가 쥐는 권한도 작아진다(머리 주석 (2)).
   *
   * 옮겨 적기가 실패해도 **함수는 계속한다.** `net._http_response` 의 select 권한은 Supabase 의 pg_net 버전에
   * 따라 다를 수 있고, 여기서 예외가 올라가면 기록을 하나도 못 읽어 화면이 "재빌드 기록 없음" 으로 보인다 —
   * 그러면 "훅이 없다" 와 "진단기가 고장났다" 가 또 같은 얼굴이 된다. 우리 표에 이미 적힌 것은 그대로 보여 준다.
   */
  begin
    update public.rebuild_log as l
    set response_status = r.status_code,
        response_error  = nullif(regexp_replace(coalesce(r.error_msg, ''), 'https?://[^[:space:]"'']+', '<hook>', 'g'), ''),
        responded_at    = r.created
    from net._http_response as r
    where r.id = l.request_id
      and l.request_id is not null
      and l.responded_at is null;
  exception when others then
    null; -- 옮겨 적지 못했다. 아래 select 는 우리 표만 읽으므로 영향이 없다.
  end;

  return query
    select l.requested_at, l.op, l.place_name, l.place_status, l.hook, l.note, l.response_status, l.response_error
    from public.rebuild_log as l
    order by l.requested_at desc
    limit greatest(1, least(coalesce(n, 5), 50));
end;
$fn$;

comment on function public.rebuild_status(int) is
  '최근 재빌드 호출 기록. 읽기 전에 net._http_response 의 결과를 rebuild_log 로 옮겨 적는다. 운영자만.';

revoke execute on function public.rebuild_status(int) from anon, public;
grant execute on function public.rebuild_status(int) to authenticated;

-- 검수 대기 **묶음의 소개**(AI 종합). 분석(`pnpm data analyze`)의 넷째 패스가 쓴다 — docs/todo/13 §5.3 A2, `scripts/analyze/groupIntroPass.mjs`.
--
-- 왜 새 표인가: 묶음 소개는 후보 한 행의 값이 아니다. 대표 후보(`lead`)의 `extracted` 에 얹으면 confidence 가 바뀌어 대표가 다른 행이 되는 순간
-- 값이 엉뚱한 행에 남는다. 묶음의 행 전부에 같은 값을 적으면 글 58편 묶음(엔젤하우스)이 쓰기 58번이고, 운영자가 고치는 `extracted` 를 통째로 덮는 경합이 생긴다.
-- 그래서 열쇠는 **묶음 키**(`groupCandidates` 의 key — 신규는 `name:<이름 키>`, 같은 자리로 합친 묶음은 원래 키 중 앞의 것)이고 대표와 무관하다.
-- 대상은 신규 묶음뿐이다 — 기존 장소의 소개는 사람이 쓴 글이라 AI 가 다시 쓰지 않는다(`proposePlaces.mjs`).
--
-- 다시 만드는 때는 `fingerprint`(재료 = 다녀온 글의 요약들과 그 글 주소, `groupIntroMaterials.mjs`)가 지금 묶음과 다를 때다. 부른 결과는
-- 거부(`intro` null + `reasons`)·충돌(`conflict`)이어도 저장한다 — 지문이 있어야 늘 거부되는 묶음을 실행마다 다시 부르지 않는다.
-- 지문은 프롬프트 버전을 넣지 않는다(명세: "새 글이 붙었거나 요약이 바뀐 묶음만") — 어느 프롬프트로 만든 값인지는 `prompt_version` 이 따로 말한다.
-- 묶음이 사라져도(승인·반려) 줄은 남는다 — 지우지 않는다(delete grant 없음). 화면은 지금 묶음의 키·지문이 맞는 줄만 쓴다(A3).
--
-- 비로그인(공개) 역할에는 아무것도 주지 않는다 — 운영자의 검수 재료이고 사이트는 읽지 않는다(등록하면 소개가 `places.features` 로 들어간다).
-- `narrow_grants`(20260922120000) 뒤라 새 표는 명시 grant 전엔 API 로 아무도 못 본다(42501) — grant 를 같이 적는다.
-- 쓰기는 분석 스크립트의 upsert(`on conflict (group_key) do update`, `.select()` 없음 = return=minimal)라 insert·update 정책 둘 다 지난다.
create table public.group_intros (
  group_key       text primary key,              -- groupCandidates 의 key ('name:<nameKey>')
  fingerprint     text not null,                 -- materialsFingerprint(재료) — 다르면 다시 만든다
  intro           text,                          -- 소개 한 줄(문장들을 이은 것). null = 거부 · 충돌
  sentences       jsonb not null default '[]'::jsonb,  -- [{ text, posts: [글 주소] }] — 문장마다 근거 글
  conflict        jsonb,                         -- { reason, posts } — 요약끼리 업태 등이 갈림. 있으면 intro null
  reasons         jsonb not null default '[]'::jsonb,  -- 거부 이유(문장 검사, `checkSynthesis`)
  model           text not null,
  prompt_version  text not null,                 -- SYNTH_PROMPT_VERSION
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.group_intros enable row level security;

grant select, insert, update on table public.group_intros to authenticated;   -- delete 없음 · anon 없음

create policy operators_select on public.group_intros for select to authenticated using ((select is_operator()));
create policy operators_insert on public.group_intros for insert to authenticated with check ((select is_operator()));
create policy operators_update on public.group_intros for update to authenticated using ((select is_operator())) with check ((select is_operator()));

-- 적용 뒤 확인(Claude, 원격 읽기 · 롤백 실측 — 행이 남지 않는다):
--   select count(*) from group_intros;                                   -- 표가 있다(0)
--   begin; set local role anon; select * from group_intros; rollback;     -- 42501(anon 은 grant 없음)
--   pnpm data analyze --synth-only --dry-run                              -- "group_intros 가 없으니" 줄이 사라지고 부를 묶음 수가 나온다

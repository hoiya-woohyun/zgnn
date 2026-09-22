# TODO — 블로그 수집 → AI 분석 → 승인 → DB → 자동 배포

> 최종 수정: 2026-09-22 (v10: **(c) 구현** — `collect.yml` 삭제 · `supabaseClient` 세션/anon 둘(service 키는 CI 든 아니든 트립와이어) · `collect-blog` 네이버 키 숨김 입력 ·
> `loginReadHidden` → `readHidden` 리네임 · 옛 Actions 문구 정리 · (b) `narrow_grants` 마이그레이션 **파일** · 문서(todo 00·02·03·04·05·이 README). GitHub 시크릿 2개 삭제 완료(`gh secret list` 빈 결과 — **0개**). **원격 적용·검증(b)는 메인 세션 이어서.**
> 다음 할 일 4 삭제(목표 소멸), 5 이후 번호 하나씩 당김)
> 이전 (v9: **결정 2 = (c) Actions 폐지** + 네이버·Kakao 키는 사용자가 로컬에서 직접 관리(스크립트는 env 또는 TTY 숨김 입력, 저장 없음).
> 구현 계획을 다음 할 일 2 에 항목화 — 새 세션은 거기서 시작. 대시보드 몫(legacy secret 퇴역·sign-up off·secure password change on) 완료)
> 이전 (v8: 다음 할 일 3 의 Claude 파트 완료 — Preview 빌드 로그 `publishable(anon)` 실측(Preview env 에 service 키가 남아 있어도), self-cr minor 4건 반영(+29 테스트=440).
> 사용자 재확인: 마켓플레이스 연동은 끊는다(쓰는 기능 0, 넣는 값은 전부 만료 없는 우회 키). 옛 env 파일 2개는 지워진 것 확인)
> 이전 (v7: 사용자 결론 "Claude 는 민감정보를 알아선 안 된다" 를 계획으로 — 실행 경로가 곧 읽기 경로이므로 만료 없는 우회 키·접속 정보를
> 에이전트가 트리거할 수 있는 경로(로컬 파일·Vercel env·Actions)에서 전부 뺀다. RLS 는 PostgREST 로 실측 완료. 마켓플레이스 연동은 끊기로. Actions 경로는 🙋)
> 이전 (v6: 다음 할 일 0(Auth 로그인 모델) 구현 완료 — 마이그레이션 2개 적용, `pnpm data:login/logout`, 통로 재작성. 남은 건 사용자 몫(publishable 키·대시보드 3개·회전)과 엔드투엔드 확인. 보안 리뷰 반영)
> 이전 (v5: 배포 복구 확인 완료. 시크릿은 저장하지 않고 로그인된 CLI 로 실행 시점에(ADR-016) — 다음 할 일 1·2 를 그 절차로, 세션 로그)
> 이전 (v4: 3 코드 완료(Claude 는 구독 `claude -p`), 4a 완료(+BUG-005 수정), 5 검증 항목 완료. 세션 로그·🙋 표 갱신)
> 이전 (v3: 0·1·2·5 에 실제 코드가 생겨 진행 상태를 항목별로 쪼갬. 세션 로그 절 추가)
> 이전 (v2: 가정 두 개가 확정돼 ADR-015 로 옮김. 회원은 todo 범위 밖으로)
> 이전 (v1: 신설 — 5단계 파이프라인의 실행 트래커)
> 상태: **진행 중**. 0·1·2·3·5 는 코드가 있고 4a(빌드가 DB 를 읽음)도 끝났다. 시크릿 모델은 ADR-016(Auth 로그인, v5 = 세션·anon 두 출처)로 **구현 완료** — (c) Actions 폐지가 브랜치 `feature/local-only-pipeline` 에 구현됐고(미커밋), 수집·분석·반영은 사용자 터미널에서만 돈다. Vercel 은 연동·env 없이 공개값 둘로만 빌드한다(실측). 남은 것은 **(b) GRANT 축소 원격 적용·검증 → GitHub 죽은 시크릿 2개 삭제 → 커밋·self-cr·push → 로컬 잠금 3개 → 첫 실행(사용자 터미널)**과 4b(웹훅 재빌드). 각 항목의 `[ ]` 를 채워 가며 진행하고, 결정이 확정되면 ADR 로 옮기고 여기서는 링크만 남긴다.

## 목표

지금은 Notion 에서 한 번 뽑은 86곳이 빌드에 구워져 있고 갱신은 사람 손이다. 이걸 아래로 바꾼다.

```mermaid
flowchart LR
  K[키워드 목록] -->|네이버 검색 API<br/>최근 1년| P[(blog_posts)]
  P -->|Claude 추출| C[(candidates)]
  C -->|사람이 링크 열어 확인·승인| PL[(places)]
  PL -->|DB 웹훅 → Vercel Deploy Hook| B[next build<br/>빌드 시 DB 를 읽어 JSON 으로]
  B --> S[정적 사이트 · PWA]
  N[(Notion 86곳)] -.->|1회 시드| PL
```

| 단계 | 문서 | 지금 | 목표 |
|---|---|---|---|
| 0 | [00-setup-supabase-vercel.md](00-setup-supabase-vercel.md) | Supabase·Vercel 생성 완료 · GitHub 에 죽은 시크릿 2개 | 프로젝트 둘 다 생성, **시크릿은 GitHub 0개·Vercel 0개**(로컬은 세션만) |
| 1 | [01-schema-and-seed.md](01-schema-and-seed.md) | 데이터는 `src/data/*.json` 뿐 | Supabase 가 원본. 86곳·15개 시드, `data:pull` 로 JSON 생성 |
| 2 | [02-collect-naver-blog.md](02-collect-naver-blog.md) | 코드 완료(실행 전) | 키워드로 최근 1년 블로그 글을 **사용자 터미널에서 수집**(`pnpm data:collect`, 스케줄 없음) |
| 3 | [03-analyze-and-review.md](03-analyze-and-review.md) | 코드 완료(실행 전) | Claude(구독, 로컬 `claude -p`)가 장소·조건을 뽑고, 사람이 링크 보고 승인 — 사용자 터미널의 운영자 세션에서 |
| 4 | [04-deploy-and-propagate.md](04-deploy-and-propagate.md) | 4a 완료(빌드가 DB 를 anon 으로 읽음) · 4b 없음 | 승인 → 자동 재빌드 → 사이트 반영(수동 경로는 `data:apply` 뒤 Redeploy) |
| 5 | [05-security.md](05-security.md) | 두 출처(세션·anon) · (b) GRANT 축소 파일만 | 키 분리·RLS·GRANT 상한·웹훅 서명·프리뷰 보호 |

## 이 계획이 서 있는 결정 — [ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md)

2026-09-18 사용자 확인으로 확정됐다. 요지만:

1. **원본은 Supabase.** 와이프가 더 이상 Notion 을 편집하지 않는다 → Notion 은 1회 시드. 손으로 고칠 일은 Studio 에서.
2. **반영은 재빌드.** DB 웹훅 → Deploy Hook → 빌드 안에서 `data:pull`. 앱 번들에 Supabase 없음, 기존 ADR 전부 유지.
3. **회원·로그인은 todo 에 없다.** ADR-011·012 는 "추후 고도화" 로 보류. 필요해지면 4 만 런타임 fetch 로 다시 쓴다.

## 순서와 의존

```
0 (계정·시크릿) ──▶ 1 (스키마·시드·data:pull) ──▶ 4 (Vercel 빌드 = pull + build)   ← 여기까지가 "DB 가 원본" 의 최소 완성
                                   │
                                   └──▶ 2 (수집) ──▶ 3 (분석·승인) ──▶ 4 의 웹훅 재빌드
5 (보안) 은 0 에서 시작해 각 단계마다 항목이 하나씩 붙는다
```

**0 → 1 → 4 를 먼저 끝낸다.** 수집·분석(2·3) 없이도 "Studio 에서 한 줄 고치면 사이트가 바뀐다" 가 성립하고,
그 상태가 2·3 을 만드는 동안의 안전한 기반이다.

## 진행 상태

- [x] 가정 1·2 확인 → [ADR-015](../decisions/ADR-015-supabase-source-and-rebuild.md) (2026-09-18)
- **0** Supabase · Vercel · GitHub Secrets
  - [x] Supabase 프로젝트(서울 리전, `zgnn_supabase`) 생성 · CLI link
  - [x] Vercel Git 연동(대시보드에서 `main` → Production)
  - [x] GitHub Secrets — (c) 결정(2026-09-22 (3))으로 **목표가 0개** → 2026-09-22 (5) 죽은 값 2개(`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_URL`) `gh secret delete`(이름만) → `gh secret list` 빈 결과. **0개 달성.**
        ~~Actions 워크플로도 삭제 예정~~ → [x] `collect.yml` 삭제(2026-09-22 (5), `.github/` 소멸)
  - [x] Vercel CLI link · Kakao 지도 배포 도메인(`zgnn.vercel.app/map` 정상). Vercel 환경변수는 ADR-016 v4 뒤로 **필요 없어졌다** — [x] 마켓플레이스 연동 해제 + env 전부 삭제(2026-09-22 (2), `vercel env ls` → No Environment)
  - **시크릿 모델 = Auth 로그인**([ADR-016](../decisions/ADR-016-secrets-by-login.md), v5 = 세션·anon 두 출처)
    - [x] 마이그레이션 `operators`+RLS 8정책(`20260921075901`·`20260921080333`, 원격 적용, 어드바이저 No issues)
    - [ ] **(b) `20260922120000_narrow_grants.sql`** — 파일 작성(2026-09-22 (5)): 여섯 테이블 ALL 회수 · anon 은 places·items select · authenticated 는 5 테이블 select/insert/update + operators select ·
          default privileges 차단 · `operators_all` → select/insert/update 15 정책 · `is_operator()` execute 는 authenticated 만. **원격 미적용·미검증** — 검증 순서는 다음 할 일 2
    - [x] `pnpm data:login`/`logout`(`scripts/login.mjs`·`logout.mjs`·`lib/sessionKeychain.mjs`) · `lib/supabaseClient.mjs` ~~출처 3단계 + 13 테스트~~ → **출처 둘(세션/anon) + 18 테스트**(2026-09-22 (5):
          service 경로·`SUPABASE_URL` override·`inCi` 삭제, env 에 service 키가 있으면 CI 든 아니든 throw, `readOnly` 는 anon + 이름만 경고) · `pull-db` readOnly · deny 확장
    - [x] `PUBLISHABLE_KEY` 상수 채움(2026-09-21 (4)) → `pnpm data:pull` 이 **PostgREST 의 anon 경로**로 86·15 행, diff 없음 — anon 정책은 실측됐다
    - [x] `operators` insert(`zgnn@gmail.com` 만 — `zgnn-test@gmail.com` 은 비운영자 역할로 밖에 둔다) · **RLS 를 PostgREST 로 실측**(2026-09-21 (4), `data:apply --dry-run`):
      세션 없음 → 로그인 안내 exit 1 · 비운영자 → `places 가 비어 있다` exit 1 · 운영자 → `반영 0건` exit 0. 세 결과가 갈렸으므로 이제 추론이 아니다
    - [x] 대시보드(2026-09-22 (3) 사용자 완료 보고): 회원가입 off · Secure password change on · legacy JWT secret 퇴역(Migrate → Rotate → legacy API keys disable → Revoke).
      퇴역 뒤 anon `data:pull` 86·15 diff 없음 실측. JWT expiry 값은 다음 `pnpm data:login` 의 만료 문구로 확인. (옛 메모: **JWT expiry 는 기본 3600 유지로 사용자 결정** — 코드의 30분 skew 때문에
      로그인 뒤 **30분**만 세션으로 쓸 수 있다(ADR-016 은 ≥ 8시간 전제). 긴 `data:analyze` 를 돌리기 전에 43200 으로 올리거나 skew 를 줄이는 결정이 남았다) · ~~Vercel env 삭제~~(완료)
  - [ ] Vercel Deploy Hook(4b)
- [x] 1 스키마 + RLS + 시드 + `scripts/pull-db.mjs` (시드→pull 왕복, `git diff src/data` 빈 결과로 확인)
- **2** 수집
  - [x] 코드 — `scripts/collect/keywords.json` · `scripts/collect/naverBlog.mjs`(23 테스트) · `scripts/collect-blog.mjs`(네이버 키: env 또는 TTY 숨김 입력, `CLAUDECODE` 거부 — 2026-09-22 (5)) ·
        `scripts/lib/readHidden.mjs`(← `loginReadHidden`, 두 소유자라 리네임, 17 테스트). ~~`.github/workflows/collect.yml`~~ 삭제
  - [ ] 실행 — 사용자 터미널에서(`pnpm data:login` → `pnpm data:collect`). 네이버 개발자센터 키 발급 전이라 아직 한 번도 안 돌림
- **3** 분석·승인
  - [x] 코드 — `scripts/analyze/{naverPostBody,extractPlaces,kakaoLocal,matchPlace,analyzeCandidates,applyApproved}.mjs`(테스트 포함) ·
        `scripts/analyze-candidates.mjs` · `scripts/apply-approved.mjs`. ~~`collect.yml` 에 analyze→apply step~~ → 사용자가 따로 부른다. Claude 인증은 로컬 `claude` 로그인뿐(자식 env 허용 목록에서 토큰·CI 제거, 2026-09-22 (5))
  - [x] `matchPlace` 본체 — 기본안 구현(🙋 였던 자리. `THRESHOLD`·`WEIGHT` 로 조정). 자동 승인은 `AUTO_APPROVE=false` 로 시작
  - [x] 엔드투엔드 1건 — 실제 후기 링크로 본문 → `claude -p` → 대조까지(DB 쓰기 없이)
  - [ ] 실행 — `blog_posts` 가 비어 있어(02) 아직. 사용자 터미널의 운영자 세션에서(다음 할 일 4·5)
- [x] 4a Vercel 빌드 명령 `pnpm data:pull && pnpm build`(`vercel.json`) — 첫 배포는 `outputDirectory: "out"` 때문에 실패했고(BUG-005) 고쳐 커밋했다. push 뒤 확인
- [ ] 4b DB 웹훅 → Deploy Hook 자동 재빌드
- **5** 보안
  - [x] `scripts/check-bundle.mjs` 유출 검사(빌드 뒤 자동 실행) · `.env.example` 커밋
  - [x] anon select 빈 결과(5 테이블 `[]`) · env→번들 유출 경로(참조가 있을 때만 잡힘 — 그게 맞는 자리) · 보안 헤더 3개(`vercel.json`)
  - [x] ~~🙋 마켓플레이스가 넣은 여분 시크릿 정리~~ → 연동 해제 + env 0개(2026-09-22 (2)) · service_role 은 회전 대신 퇴역(2026-09-22 (3))
  - [ ] 프리뷰 보호 · 키 회전 절차(남은 대상은 네이버 키·Deploy Hook 뿐) · (b) GRANT 축소 원격 적용·검증 · 7일 일시정지를 깨우는 잡이 없어졌다(05 에 비용으로 기록)
- [x] `docs/architecture/data-pipeline.md` v2 (이번에 반영)

체크박스가 정본이다. 진행 상황을 다음 세션에 넘길 때는 아래 세션 로그에 한 줄 남긴다.

## 다음 할 일 (2026-09-22 기준 — 새 세션은 여기서 시작)

브랜치 `feature/local-only-pipeline`(`main` `63abb90` 에서 시작 — (c) 구현, 2026-09-22 (5) 워크플로, **미커밋**). 그 앞의 `feature/supabase-login-model` 은 `main` 에 머지됐다.
ADR-016 v4 는 구현·**실측 완료** — publishable 키 채움, `operators` = `zgnn@gmail.com`, `data:apply --dry-run` 이 세션 없음·비운영자(`zgnn-test@gmail.com`)·운영자에서 세 결과로 갈렸다(2026-09-21).

**사용자 결론(2026-09-22): Claude 는 민감정보(DB 접속 정보, 키, 토큰)를 알아선 안 된다.** 이 원칙의 함정은 "값을 숨기면 된다" 가 아니라는 것이다 —
에이전트가 push 할 수 있으면 빌드·Actions 의 env 는 `console.log(process.env.X)` 한 줄로 읽힌다(접근 경로 = 읽기 경로). 그래서 원칙은 이렇게 구현한다:

> **만료 없는 우회 키·접속 정보를 에이전트가 트리거할 수 있는 실행 경로(로컬 파일 · Vercel 빌드 env · GitHub Actions) 어디에도 두지 않는다.**
> Claude 가 아는 값은 공개값 둘(`PROJECT_REF`·`PUBLISHABLE_KEY`)과, 손에 넣어도 하루면 죽고 RLS 밖은 못 하는 운영자 세션뿐이다.

0. ~~Auth 로그인 모델 구현 · publishable 키 · operators · RLS 실측~~ **완료.**
1. **경로 닫기(사용자 터미널·대시보드)** — 실행 순서대로. 로그아웃은 각 심부름의 **끝**에(먼저 하면 다음 단계가 막힌다):
   - ~~**로컬 파일**: `rm -f .env.local .vercel/.env.production.local`~~(2026-09-22 (2) 둘 다 없는 것 확인).
   - **Vercel — 마켓플레이스 연동을 끊는다**(2026-09-22 결정. 이 프로젝트는 정적 내보내기 + 빌드 시 anon 읽기라 연동이 주는 기능 — env 주입·통합 청구·Preview
     Redirect URL·Branching — 중 쓰는 게 없다. 회원(ADR-011)을 붙일 때 publishable 키·Redirect URL 만 쓰는 조건으로 다시 붙인다):
     1. ~~**먼저 A/B 판별**~~(2026-09-22 (2) 사용자가 연동 해제 — 마켓플레이스 변수 12개가 같이 사라짐) — Supabase 대시보드 Organization 설정의 청구가 "Managed by Vercel" 이면 A(마켓플레이스 네이티브: **Integration 을 uninstall 하면 조직째 삭제**).
        A 면 Vercel 프로젝트 Settings 에서 **Disconnect project 만**, 리소스·연동 삭제는 누르지 않는다. B(Supabase 쪽 Integrations → Vercel)면 거기서 연결 해제.
     2. ~~`vercel env ls`~~(완료 — 손으로 넣었던 3개는 Claude 가 `vercel env rm` 으로, 값 노출 없음. 지금 `No Environment`) `vercel env ls`(이름만 나온다)로 남은 `SUPABASE_*`·`POSTGRES_*` 를 보고 `vercel env rm <NAME> production` / `preview` 로 전부 제거. 손으로 넣었던 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 포함.
     3. 끝나면 `vercel logout`(휴지). 배포 확인 때만 로그인.
   - ~~**Supabase legacy secret 퇴역**~~(2026-09-22 (3) 사용자 완료 · 퇴역 뒤 anon pull 실측 OK)(정정 — "JWT secret 회전" 버튼은 없다. 지금 Supabase 는 JWT 서명키 시스템이라 legacy HS256 secret 은
     회전이 아니라 **퇴역**시킨다. 옛 todo 의 "JWT 서명키 회전" 과 "새 secret key + legacy service_role 폐기" 는 이 절차 하나다. 공식 docs `guides/auth/signing-keys`):
     Project Settings → **JWT Keys**(`/settings/jwt`) → ① **Migrate JWT secret** → ② standby 키(ECC P-256) 만들고 **Rotate keys** → ③ Settings → **API Keys** 에서 legacy
     `anon`·`service_role` **disable**(둘은 legacy secret 으로 서명된 JWT 라 먼저 꺼야 한다) → ④ JWT Keys 의 "previously used" legacy 키 **Revoke**.
     우리 코드는 `sb_publishable_` 만 쓰므로 영향 없음. 키체인 세션은 ④ 뒤 무효 → `pnpm data:login` 한 번. GitHub Secret `SUPABASE_SERVICE_ROLE_KEY` 는 죽는다(2 로 대체).
     **근거 있는 유출은 없다**(값을 찍은 빌드 없음) — 원칙상 예방 조치라 건너뛰면 ADR-016 잔존 위험 표에 한 줄. ③ 은 2 와 무관하게 결국 해야 한다.
     새 secret key 는 **만들지 않는다** — (a)·(c) 어느 쪽도 service 키를 쓰지 않는다.
   - **`supabase` CLI**: 휴지 = 로그아웃(2026-09-22 확인됨). 스키마 작업 때만 `pnpm exec supabase login`, 끝나면 logout.
   - **`gh` · SSH**: `gh auth logout -u hoiya-woohyun` · `ssh-keygen -p -f ~/.ssh/id_ed25519_hoiya`(암호구). push·시크릿 삭제 때만 연다. Free private 레포는 브랜치 보호가
     안 되므로 **이것이 "에이전트가 빌드를 트리거할 수 없다" 를 만드는 유일한 문**이다(Actions 는 (c) 로 없어졌으니 남은 트리거는 Vercel 빌드뿐 — 그 빌드는 anon 이라 읽을 시크릿도 없다).
   - ~~**대시보드 확인**~~(2026-09-22 (3) 완료): Sign In / Providers → Allow new users to sign up **off** · Email → Secure password change **on**. JWT expiry 는 기본 3600 유지(사용자 결정) —
     코드의 30분 skew 와 합치면 로그인 뒤 **30분**만 세션으로 쓸 수 있다. 4 의 `data:analyze` 를 돌리기 전에 Sessions 에서 `43200` 으로 올리는 것을 권한다(≤1일이라 원칙 안).
2. **결정 완료(2026-09-22 (3)): (c) Actions 폐지 — 구현 완료(2026-09-22 (5) 워크플로), 남은 것은 (b) 원격 적용·검증.** 수집·분석·반영은 사용자가
   `pnpm data:login` 한 로컬 세션에서만 돈다. GitHub 시크릿 0개가 목표.
   **키 전달도 결정됨**: 네이버 검색 키(client id·secret)는 **사용자가 로컬에서 직접 관리**한다 — 스크립트는 env 로 받고, 없고 TTY 면 숨김 입력으로 받는다.
   레포·키체인·파일 어디에도 저장하지 않는다(에이전트 세션이면 exit 1 안내 — 수집은 사용자 터미널 몫). Kakao REST 키는 사용자가 안 쓴다(지도 JS 키와 다른 키) —
   선택 사항 그대로 env 만 보고 없으면 보강 건너뜀. Claude 는 로컬 `claude` 로그인(토큰 불필요). **비용**: 화·금 자동 수집이 없다 — `blog_posts` 는 사용자가 돌릴 때만 찬다.
   7일 비활성 일시정지를 깨우던 잡도 없다(05). (a) 봇 운영자 로그인은 기각(GitHub 에 시크릿이 남는 경로라서). 구현 목록(2026-09-22 (5) 워크플로에서 4갈래 병렬로 끝냄):
   - ~~`.github/workflows/collect.yml` **삭제**(스케줄·`workflow_dispatch` 소멸).~~ (2026-09-22 (5) 워크플로 — `.github/` 자체가 소멸)
   - ~~`scripts/lib/supabaseClient.mjs`: service 경로·`SUPABASE_URL` override·`GITHUB_ACTIONS` 안내·`inCi` 삭제 → 출처는 **세션/anon 둘**. `SUPABASE_SERVICE_ROLE_KEY` 가
     env 에 있으면 CI 여부와 무관하게 **무조건 throw**(트립와이어 강화 — 조용히 무시되면 사고 감지가 사라진다), 단 `readOnly` 는 그 전에 anon 반환(`1b4264c` 불변식 유지).
     테스트의 CI/service 케이스 4개는 삭제가 아니라 "service 키는 CI 든 아니든 거부" · "readOnly + service 키 → anon" 으로 재작성.~~ (2026-09-22 (5) 워크플로 — 20→18 테스트.
     `readOnly` 가 service 키를 무시할 때 `ignoredEnv` 로 **이름만** 한 줄 경고 — 옛 `.env.local` 잔존을 처음 잡은 게 그 출처 로그였다. 트립와이어는 linkedRef·publishable 검사 뒤라 둘 다 어긋나면 linkedRef 문구가 먼저)
   - ~~`scripts/collect-blog.mjs`: env 없고 TTY 면 두 키를 숨김 입력(`CLAUDECODE` 면 거부). `loginReadHidden` 이 두 소유자가 되므로 `scripts/lib/readHidden.mjs` 로 리네임(owner-prefix 예외 2).~~
     (2026-09-22 (5) 워크플로 — `CLAUDECODE` 가드가 TTY 검사보다 먼저(에이전트 세션도 TTY 를 가질 수 있다) · 세션 검사가 키 입력보다 먼저 · 둘 중 없는 쪽만 묻는다 · Ctrl-C 는 exit 130)
   - ~~옛 문구 정리: `collect-blog.mjs:11`("GitHub Secrets 만") · `analyze-candidates.mjs:54` · `analyze/extractPlaces.mjs:6,198` · `extractPlaces.mjs:245` allowlist 의
     `CLAUDE_CODE_OAUTH_TOKEN`·`CI`·`GITHUB_ACTIONS` · `.env.example` 헤더(Actions/service_role 문장).~~ (2026-09-22 (5) 워크플로 — `DEFAULT_LIMIT` 근거를 세션 창으로, `apply-approved` 관측을 터미널로.
     allowlist 테스트는 옛 토큰을 입력에 남겨 두고 "넘어가지 않음" 을 단언)
   - ~~**(b) 마이그레이션** `supabase/migrations/2026092?_narrow_grants.sql`(파일을 직접 쓴다 — `migration new` 는 TTY 없으면 멈춤): anon·authenticated 의
     delete·truncate·references·trigger 회수 · anon 은 places·items **select 만** · authenticated 는 5 테이블 select/insert/update + operators select ·
     `alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated`(`postgres` 가 만드는 앞으로의 테이블도 — 마이그레이션은 postgres 로 돈다) ·
     `operators_all`(for all) → `operators_select`/`_insert`/`_update` 3정책 ×5 테이블(**upsert 는 insert `with check` 와 update `using`+`with check` 둘 다** 필요 —
     `apply-approved.mjs:134`·`seed-db.mjs:46,49`). **`operators_read_self` 는 건드리지 않는다**(invoker 함수라 없으면 조용히 false). 스크립트에 `.delete(` 는 0개(실측).~~
     (2026-09-22 (5) 워크플로 — **파일만**, `20260922120000_narrow_grants.sql`. 더한 것: `is_operator()` execute 를 anon·PUBLIC 에서 회수 + authenticated 명시 grant(PUBLIC 만 빼면 운영자 정책이 전부
     `permission denied for function` 으로 죽는다). 시퀀스 없음(키가 전부 text/uuid). libpg-query 로 27문장 파싱·AST 확인까지. **아래 검증 순서가 남았다**)
   - ~~문서: ADR-016 **v5**(보류 표 (a)(b)(c) 닫힘 — 새 ADR 만들지 않는다) · `data-pipeline.md`·`ARCHITECTURE.md`(Actions → 로컬 실행) · todo 00·02·03·04·05 ·
     CLAUDE.md 표(`collect.yml` 링크 제거, `pnpm data:*` 는 사용자 터미널) · 이 README(4 삭제, 6 을 로컬 첫 실행으로).~~ (2026-09-22 (5) 워크플로 — todo 5편·README 는 이 문서 레인, ADR/architecture/CLAUDE.md 는 별도 레인)
   - **(b) 검증 순서**(`pnpm test` 는 정책 실수를 못 잡는다): 사용자 `pnpm exec supabase login` → Claude `pnpm exec supabase db push` → 사용자 `pnpm data:login` →
     Claude `pnpm data:apply --dry-run` = `반영 0건` exit 0 · 세션으로 delete 시도 → 42501(이제 정책이 아니라 DELETE grant 부재) · anon `data:pull` 86·15 → 사용자 `supabase logout` ·
     어드바이저 새 경고 없음. 마지막 단계까지 못 가면 (b) 는 **미검증**으로 표기. push 뒤 첫 select 가 `permission denied for function is_operator`/`for table operators` 면 grant 미적용이지 정책 버그가 아니다.
   - ~~**GitHub Secret 삭제** — `gh auth switch -u hoiya-woohyun` 뒤 `gh secret list` 로 보고 `gh secret delete` 2개(`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_URL`, 이름만 다룬다).~~ 완료(2026-09-22 (5)) — `gh secret list` 빈 결과, **시크릿 0개**.
3. **배포 확인(Claude)** — ~~self-cr → push~~(2026-09-22 완료. self-cr major 1 반영: `readOnly` 는 CI 에 service 키가 남아 있어도 anon — "빌드는 anon" 이 env 정리
   순서가 아니라 코드 불변식이 됐다) → ~~Preview 빌드 로그가 `publishable(anon)` 인지~~(2026-09-22 (2) 실측: 커밋 `1b4264c` Preview 가 `publishable(anon)` 으로 86·15 행,
   Preview env 에 `SUPABASE_SERVICE_ROLE_KEY` 가 남아 있는 상태에서) → ~~1 의 Vercel 정리 → `main` 머지 → 프로덕션 확인~~ **전부 완료**(2026-09-22 (2): `main` `63abb90` 프로덕션 Ready,
   Vercel env 0개·연동 없음 상태에서 `publishable(anon)` 86·15, 유출 검사 통과). 이 항목은 닫혔다 — 남은 Claude 몫은 2 의 (b) 검증 뒤 4~7.
   ~~self-cr 미반영(minor)~~ 4건 전부 반영(2026-09-22 (2)): `readHidden` 을 `scripts/lib/loginReadHidden.mjs`(지금은 `readHidden.mjs`) 순수 리듀서로 분리(CSI·SS3·단독 ESC·Alt+키·겹친 Meta `ESC ESC [ A`) ·
   `writeSession` 은 3세그먼트 JWT 문자열만 · `sessionKeychain` 은 `run` 주입으로 테스트 · 만료 문구가 "진짜 만료" 와 "skew 창 안(만료 N분 전)" 을 나눠 말하고 로그인 완료 문구에 실효 시각.
4. **로컬 dry-run(Claude, 사용자가 `pnpm data:login` 한 상태에서)** — `pnpm data:analyze --dry-run --limit 5`. 백로그는 `--limit 30` 씩(구독 세션 한도 + 운영자 세션 창). 세션 창은 JWT expiry 에 따라 30분(3600) 또는 11.5시간(43200) — 다음 `data:login` 문구로 확인.
5. **첫 실행(사용자 터미널)** — `pnpm data:login` → `pnpm data:collect`(네이버 키 숨김 입력 — Claude 는 못 돌린다) → `blog_posts` 가 차면 Claude 가 4 의 dry-run → 사용자 세션으로 `pnpm data:analyze` → `pnpm data:apply`.
   실패해도 그 로그가 다음 할 일이다.
6. **Studio 에서 후보 20건쯤 본 뒤 결정(🙋)** — `AUTO_APPROVE`, `WEIGHT`·`THRESHOLD`(재대조 0.85 경계), `ask` 승인 절차.
7. **4b** — 승인이 실제로 생긴 뒤 DB 웹훅 → Deploy Hook. Deploy Hook URL 은 "빌드 한 번" 밖에 못 하는 값이라 원칙 안.

## 세션 로그

세션이 끝나거나 컨텍스트가 커져 나눌 때 여기에 한 항목. 체크박스가 정본이고 로그는 인수인계 메모.

- 2026-09-22 (5) — **(c) 구현 워크플로**(브랜치 `feature/local-only-pipeline`): 구현 4갈래 병렬(A `supabaseClient` 세션/anon 둘 + 트립와이어 · B `collect-blog` 숨김 입력 + `readHidden` 리네임 ·
  C `collect.yml` 삭제 + 옛 Actions 문구·allowlist 정리 · D (b) `narrow_grants` 마이그레이션 파일) → 문서 2갈래(todo 5편·README / ADR-016 v5·architecture·CLAUDE.md) → 3렌즈 리뷰 13건 → 지적마다 반박 2표 →
  확인 7건. **함정**: Fix 에이전트가 8파일 17편집을 적용하고 테스트(439)까지 돌린 뒤 구조화 보고 직전에 구독 세션 한도로 죽었다 → resume 의 재검증이 "이미 반영된 상태" 를 보고 전부 stale 판정 →
  워크플로 회계는 "확인 0·Fix 건너뜀" 이지만 실제로는 **리뷰 패스 없이 들어간 편집**이 커밋에 섞여 있다(`.cursor/rules` · `supabaseClient{,.test}.mjs` · ADR-016 · todo 00·01·05 · CLAUDE.md) —
  self-cr 에 이 목록을 넘겨 커버. 메인이 직접 넣은 것: `collect-blog` 빈 id 면 secret 안 묻기 한 줄(테스트 없음). GitHub 시크릿 2개 삭제(`gh secret list` 빈 결과, 0개). 커밋 3개(코드·마이그레이션·문서).
  **남은 것**: 사용자 `pnpm exec supabase login` → (사용자 확인 뒤) `db push` → 사용자 `pnpm data:login` → `data:apply --dry-run` 검증(delete 42501 · anon pull 86·15) → `supabase logout` → self-cr → push → 로컬 잠금 3개.
  (b) 는 push 전까지 **미검증** — 검증이 push 앞인 이유: `db push` 가 grant 실수를 드러내면 깨진 마이그레이션을 올리는 대신 같은 커밋을 고친다.

- 2026-09-22 (4) — **결정 2 = (c)**. 사용자가 (c) 선택 → advisor 지적으로 키 전달 방식을 물어 "네이버·Kakao 키는 내가 로컬로 관리" 로 확정(env 또는 TTY 숨김 입력, 저장 없음;
  Kakao REST 는 안 씀). 대시보드 몫 완료 보고 뒤 anon `data:pull` 86·15 실측(legacy 키 퇴역 뒤에도 OK), 옛 세션은 만료 상태. 구현은 컨텍스트(436k) 때문에 **새 세션**에서 —
  다음 할 일 2 에 구현·검증 목록을 항목화해 둠. 로컬 잠금 3개(`vercel logout`·`gh` hoiya 로그아웃·SSH 암호구)는 구현 push 뒤 세션 마지막에.

- 2026-09-22 (3) — 사용자가 Supabase 에서 "JWT secret" 을 못 찾음 → 공식 docs 확인: 회전 버튼이 없고 JWT 서명키 시스템(Migrate → Rotate → legacy API keys disable → Revoke)으로
  퇴역시킨다. todo 1 의 두 항목을 이 절차 하나로 정정. Vercel 의 `SUPABASE_JWT_SECRET` 은 연동이 넣은 실제 값이었다(4일 전·마켓플레이스 배치, 손으로 넣은 3개는 1일 전).

- 2026-09-22 (2) — **다음 할 일 3 의 Claude 파트**. (1) 상태 점검: 옛 `.env.local`·`.vercel/.env.production.local` 은 이미 없음 · `vercel`·`gh`(두 계정) 로그인 상태 ·
  `supabase` CLI 로그아웃 · Vercel env 는 마켓플레이스 15개 그대로(정리 전). (2) Preview(`1b4264c`) 빌드 로그 `Supabase 인증: publishable(anon — published 읽기만)` ·
  `pull 완료: places 86 · items 15` — service 키가 env 에 있어도 anon, 코드 불변식 실측. (3) self-cr minor 4건을 워크플로(구현 → 3렌즈 리뷰 → 지적마다 반박 2표 →
  반영 → 최종 검증, 에이전트 20)로 반영: 리뷰 7건 중 6건 확인·반영(그중 실질은 겹친 Meta 접두 `ESC ESC [ A` 회귀 1건 — 옛 코드는 맞았다), 1건(비문자열 토큰의
  `toString` 재호출)은 표가 갈려 메인이 `typeof` 한 줄로 닫음. 테스트 411 → 440. (4) 사용자 질문 "연동이 편의성 아닌가" → 이 프로젝트가 쓰는 연동 기능이 0(env 주입·
  Redirect URL·청구·Branching 전부 미사용)이고 넣는 값은 전부 만료 없는 우회 키라 제거로 재확인. (5) 사용자가 연동 해제 → 마켓플레이스 변수 12개 소멸, 손으로 넣은 3개는
  Claude 가 `vercel env rm`(값 노출 없음) → `No Environment`. `main` ff 머지(`541c3ae..63abb90`) → 프로덕션 Ready, anon 86·15. **다음 할 일 3 닫힘.** 남은 사용자 몫: JWT 서명키 회전 ·
  secret key 재발급+legacy 폐기 · 대시보드 3개 · `vercel`/`gh`/SSH 잠금 · 🙋 2(Actions 경로).

- 2026-09-21 (4) ~ 09-22 — **RLS 실측 완료·원칙 확정**. (1) 사용자가 publishable 키를 줌 → `PUBLISHABLE_KEY` 채움 → `data:pull` 이 anon 으로 86·15 행(PostgREST 첫 통과).
  (2) 계정 2개(`zgnn@gmail.com` 운영자 · `zgnn-test@gmail.com` 비운영자) → `operators` insert(운영자만) → `data:apply --dry-run` 3라운드: 세션 없음 exit 1 · 비운영자
  `places 가 비어 있다` exit 1 · 운영자 `반영 0건` exit 0. (3) JWT expiry 는 기본 3600 유지(사용자 결정) — skew 30분과 합치면 실효 세션 30분, 문서에 보류로.
  (4) 마켓플레이스 연동 논의 → 사용자 결론 "Claude 는 민감정보를 알아선 안 된다" → 접근 경로 = 읽기 경로(빌드 env 는 push 한 줄로 읽힘)이므로 계획을
  "우회 키를 에이전트가 트리거할 수 있는 경로 어디에도 두지 않는다" 로 다시 씀(다음 할 일 v7). 연동은 끊는다(A/B 판별 뒤 Disconnect 만). Actions 경로는 🙋 (a) 권장.
  (5) `supabase` CLI 는 로그아웃 상태 확인. 커밋 4개 로컬, **미push** — Vercel env 정리가 먼저다. 사용자가 다음에 검토 재개.

- 2026-09-21 (3) — **다음 할 일 0 구현**(ADR-016 v4): (1) 마이그레이션 `operators`+`is_operator()`+정책 7개 push → 어드바이저가 definer 함수의 RPC 노출을
  경고(0028/0029) → 두 번째 마이그레이션으로 invoker + `operators_read_self`(정책 안 서브쿼리는 호출자 역할이라 자기 행 정책이 없으면 **조용히 false**) → No issues.
  (2) `scripts/lib/sessionKeychain.mjs`(키체인, `security -i` stdin 으로 써서 argv 에 안 실림) · `supabaseClient.mjs` 재작성(env service → 세션 JWT(60초 skew) →
  anon, `readOnly` 는 pull-db 만, 출처 이름을 한 줄 로그) · `login.mjs`(TTY·CLAUDECODE 가드, refresh 폐기) · `logout.mjs` · 13 테스트. `PROJECT_REF` 상수(Vercel 엔 link 파일이 없다),
  `PUBLISHABLE_KEY` 는 **빈 문자열** — 사용자가 준다. (3) `collect.yml` 에서 `SUPABASE_URL` 제거, deny 에 `security -i`·api-keys 변형 추가(파이프 안에서도 막히는 걸 실측).
  (4) 함정: `supabase migration new` 는 stdin 이 TTY 가 아니면 SQL 을 기다리며 **멈춘다** — `</dev/null` 을 붙이거나 파일을 직접 쓴다.
  (5) **구멍 발견**: `pnpm data:pull` 로그가 `env(service key)` 를 찍어 봤더니 옛 `.env.local` 과 `.vercel/.env.production.local` 에 service_role 키가 평문으로 남아 있었다(값은 안 봄 —
  이름만). 에이전트 `rm` 은 권한 거부 → 사용자가 지운다(다음 할 일 1). 코드에 **CI 가드** 추가: `CI` 가 아니면 env 의 service 키를 거부하고 멈춘다(14 테스트).
  (6) `pnpm login`/`logout` 이 pnpm 내장 명령(npm 로그인)이라 가려짐 → `data:login`/`data:logout` 으로 개명. (7) 보안 중점 리뷰(4 렌즈 + 렌즈별 적대 검증, 8 에이전트, 50건 확인·1건 반박) 반영. **결론: `pnpm data:*` 경로는 요구 ①~⑤를 채우지만 이 머신은 아직 아니다** —
  관리자 없이 RLS 를 우회하는 무만료 자격증명이 5개(env 파일 2개·supabase CLI PAT·Vercel env 의 JWT secret 등·admin gh+SSH 키) 남아 있고, 전부 사용자 터미널 작업으로만 닫힌다
  (ADR-016 "잔존 위험" 표 = 다음 할 일 1). 코드 반영 8건: `readOnly` 는 항상 anon · 세션/anon 경로 URL 고정(`SUPABASE_URL` 로 JWT 를 밖으로 보내는 통로 차단) ·
  `--env-file-if-exists` 제거 · 세션 수명 ≤ 1일 단언(⑤) · `data:pull` 빈 결과 exit 1 · `claude -p` 자식 env 허용 목록 · `PUBLISHABLE_KEY` 형식 단언 · 키체인 오류 경로.
  보류(사용자 결정): Actions 의 service_role → 봇 운영자 로그인, GRANT(DELETE·TRUNCATE) 회수·`for all` 축소, Actions 자체를 로컬 실행으로 대체할지. 문서의 틀린 주장 2개 정정
  ("deny 가 2차 자물쇠" → 경계 아님, "`cat` 은 안 막힌다" → 이 CLI 버전은 막힌다). RLS 검증은 PostgREST 전이라 **추론** 으로 표기.

- 2026-09-21 (2) — (1) **배포 복구 확인 완료**: Preview `0d625f6` Ready(13h 전 프로덕션 Error 는 로그로 BUG-005 확인, `data:pull` 은 통과했었다)
  → `main` 에 ff 머지·push → 프로덕션 Ready. `zgnn.vercel.app` 응답에 `x-content-type-options: nosniff`·`referrer-policy`·
  `permissions-policy` 세 개 다 붙음(`sw.js` 포함. 캐시 우회 `?cb=` 로 `age: 0` 확인). (2) **시크릿 처리 방식 두 번 바뀜**(사용자 결정
  "Claude 가 값을 읽는 순간부터 문제" → "관리 스크립트 말고 로그인 방식으로 단순하게"): 1차로 macOS 키체인 + `scripts/secrets.mjs` 를 만들어
  main 에 머지했다가, 2차로 **로그인 모델**(ADR-016 v3)로 교체 — `scripts/lib/supabaseClient.mjs` 가 env(CI·Vercel) → 로그인된 `supabase` CLI
  (`projects api-keys --reveal`) 순으로 키를 실행 시점에 받는다. 로컬에 값이 어디에도 없고 `.env.local` 은 선택. `.claude/settings.json` deny 가
  **bypass 세션에서도 실제로 막히는 걸 실측**(`--help` 조차). 옛 `.env.local` 의 키는 노출로 보고 **회전**(다음 할 일 1) — 로컬은 할 게 없다.
  (3) 그 로그인 모델도 **PAT 는 만료가 없어** 사용자 요구 ⑤(토큰 1일 미만)를 못 채운다 → **Auth 사용자 로그인 + RLS + 짧은 JWT** 로 재설계 결정,
  구현은 다음 세션(다음 할 일 0). 브랜치의 2차 리뷰(12건: major 3 — spawn 실패 시 TypeError, 반쪽 env 진단 회귀, deny 누락)는 미반영 상태로 목록만 다음 할 일에 남겼다.

- 2026-09-21 — 브랜치 `feature/todo-analyze-pipeline`(작업 중엔 push·머지·Vercel 트리거 없이 로컬 커밋만 — 사용자 지시. 리포트 뒤 지시로 **push 함**, main 머지는 아직). 한 것:
  (1) Vercel 배포 실패 원인 = `vercel.json` 의 `outputDirectory: "out"` → 제거(BUG-005, 로컬 `vercel build --prod` 로 재현·확인).
  프로덕션은 3시간 전 배포가 그대로 살아 있고 push 하면 복구된다. (2) 보안 헤더 3개를 `vercel.json` 에. (3) 03 전체 코드 —
  **Claude 는 API 키 대신 구독(`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`)으로 `claude -p --json-schema` 를 돌린다**(사용자 결정,
  `@anthropic-ai/sdk` 제거). 적대적 리뷰가 22건을 냈고 21건 재현 → 반영: Kakao 정확 일치만, 읍·면 12개 목록, AI regionRaw 도 대조 신호,
  영구 실패는 `analyzed_at` 으로 닫기, Kakao 401/403·인증 실패는 실행 중단, places 빈 결과 중단, apply 의 archived 거부·신규 재대조,
  apply step `!cancelled`, HTML 상한, **자동 승인 기본 off**. (4) 05 검증: anon `[]`, env→번들 유출 e2e, 헤더. 리뷰 워크플로는 구독
  **세션 한도**("resets 2:30am")에 걸려 중단됐다 — 서브에이전트도 같은 한도를 쓴다. 다음: 시크릿 4개 등록 → `workflow_dispatch` 로
  수집·분석 실제 실행 → 후보 Studio 확인 → 4b. **사용자 확인 필요**: 자동 승인 켤지(`AUTO_APPROVE`), 임계값·가중치(재대조 0.85 경계 포함), 여분 시크릿 정리.
  **2차 리뷰**(전송부 교체 뒤, 4 렌즈): 30건 중 14건 확인·반영. 한계 — 전송부 렌즈의 검증 투표는 전부 한도로 죽어 그 지적들은 검증 없이
  내가 골라 반영했고, 수정 에이전트도 죽어 14건 수정은 독립 리뷰 없이 직접 했다(근거는 393 테스트 + 실제 `claude -p` 재스모크).
  `pnpm lint` 는 `scripts/` 를 검사하지 않는다. `CLAUDE_CODE_OAUTH_TOKEN` 만 있는 러너에서 `claude -p` 가 도는지는 첫 `workflow_dispatch` 가 시험이다.

- 2026-09-20 (2) — 5커밋 push 완료, Vercel 프로덕션이 새 커밋으로 배포됨(`sw.js` revision 이 로컬 빌드와 일치 → `package.json` 의 `build` 스크립트가 쓰이므로 유출 검사도 Vercel 에서 돈다). DB 한 필드 수정 → pull → 그 줄만 diff → 되돌림 검증 완료(01 끝). **순서 제약**: 로컬에 `vercel.json`(buildCommand `pnpm data:pull && pnpm build`) 초안이 **커밋되지 않은 채** 있다 — Vercel env(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`, Production+Preview, Sensitive)가 먼저 들어가야 한다. 먼저 커밋하면 `data:pull` 이 exit 1 로 모든 배포가 실패한다(이전 배포는 살아 있지만). 05 의 헤더 작업이 `vercel.ts` 를 말하는데 `.json` 과 둘이 공존할 수 없다 — 헤더를 붙일 때 `.json` → `.ts` 로 옮기든지 `.json` 에 headers 를 넣든지 하나만 고른다(🙋). 참고: `supabase`(CLI)가 devDependencies 라 Vercel 이 매 빌드 설치한다 — 빌드 시간이 늘면 CLI 는 `pnpm dlx` 로 빼는 걸 검토. Actions `collect.yml` 은 네이버 시크릿이 들어가기 전까지 화·금마다 빨갛게 실패한다(무해).
- 2026-09-20 — 한 것: Supabase 프로젝트 생성·link(빈 마이그레이션 함정 우회, 스키마+RLS+시드 완료, 시드↔pull 왕복 검증), 02 수집 코드 전체(테스트 포함) 작성, 03 골격(헬퍼+임계값 상수+테스트)만 작성, 05 유출 검사·`.env.example`·GitHub Secrets 일부 등록, Vercel Git 연동 확인. 다음: GitHub Secrets 나머지 4개(네이버·Anthropic·Kakao REST) 등록 → 02 실제 실행 → `matchPlace` 본체(🙋) → 4a Vercel 빌드 명령 전환. 사용자 대기: 네이버 개발자센터 키 발급, `matchPlace` 임계값 확정, Vercel 로그인/link, Kakao 지도 배포 도메인 등록. **하지 말 것**: 빈 마이그레이션을 다시 만들지 말 것(`db pull` 로 새로 뜬 빈 마이그레이션에 SQL 을 쓰면 `db push` 가 조용히 건너뛴다 → `migration repair --status reverted` 로 되돌리고 새 파일을 만든다), 시드는 이미 끝났으니 `seed-db.mjs` 를 다시 돌릴 필요 없음(멱등이라 돌려도 무해하지만 불필요).

## 🙋 사용자가 정할 것 (문서가 결정해 두지 않은 자리)

| 어디 | 무엇 | 왜 사용자 몫인가 |
|---|---|---|
| 02 | 검색 키워드 목록 | 도메인 지식. "강아지 동반" vs "애견 동반" vs "반려견" 이 다른 글을 낸다 |
| 03 | `matchPlace` 가중치·임계값(`WEIGHT`·`THRESHOLD`), **자동 승인을 켤지**(`AUTO_APPROVE`, 기본 off) | 기본안은 구현돼 있다. 틀리면 데이터가 조용히 썩는다. 86곳이라 사람 비용이 싸다 |
| 03 | AI 모델 | 구독이라 비용 차이는 없고 한도 소모뿐. 기본 `claude-opus-5`, `ANALYZE_MODEL` 로 비교 |
| ~~05~~ | ~~Vercel 마켓플레이스가 넣은 여분 시크릿(`POSTGRES_*`·`SUPABASE_JWT_SECRET` 등)을 지울지~~ | **닫힘(2026-09-22 (2))** — 연동 해제로 12개 소멸, 손으로 넣은 3개 제거, env 0개 |
| 04 | 승인마다 재빌드 vs 모아서 "반영" 한 번 | 빌드 횟수 = Vercel 무료 한도 소비 |
| 02·05 | 수집 주기(스케줄이 없다 — 사용자가 돌릴 때만) · 7일 일시정지를 무엇으로 깨울지 | (c) 의 비용. 주 1회 `pnpm data:pull` 이면 충분하지만 그건 습관이지 코드가 아니다 |

## 기존 문서와의 관계

- [.omc/plans/2026-09-17-notion-supabase-scraping.md](../../.omc/plans/2026-09-17-notion-supabase-scraping.md) — 이 폴더가 **대체**한다. 살아남은 것: Phase 1 의 "재추출 스크립트 부재", §4 의 `matchPlace`. Phase 4 의 GitHub Actions 선택 이유는 (c) 로 뒤집혔다(2026-09-22 — 관리자 없이 도는 구조가 곧 만료 없는 시크릿 저장소라서). 거기 적힌 "git 원격이 없다" 는 이제 사실이 아니다(`origin` = `hoiya-woohyun/zgnn`).
- [ADR-011](../decisions/ADR-011-app-gate-and-supabase.md) · [ADR-012](../decisions/ADR-012-personal-data-and-consent.md) — **추후 고도화로 보류**(ADR-015 §3). 회원을 받지 않으므로 개인정보도 받지 않는다. ADR-012 의 "리전은 서울, 생성 시에만" 만 **지금 0 에서 지킨다.**
- [docs/architecture/data-pipeline.md](../architecture/data-pipeline.md) — 1·4 가 끝나면 "동기화는 수동", "런타임 fetch 없음"(이건 그대로 참), "재추출 스크립트는 없다" 를 다시 쓴다.

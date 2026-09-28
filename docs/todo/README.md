# TODO — 블로그 수집 → AI 분석 → 승인 → DB → 자동 배포

> 최종 수정: 2026-09-28 (v23: **미push 커밋 6개를 검증 후 push·배포 확인**했다 — 트래커가 "선행이 없어졌다" 로 닫아 둔 사이 다시 쌓인 것이다(같은 패턴 두 번째).
> 그래서 잠금 줄에 **불변식이 아니라는 단서**를 달았다: 잠그기 직전에 `git log --oneline origin/main..HEAD` 가 비었는지 본다.
> 실측 — 566 테스트 · `pnpm build`(`sw.js` 64KB) · 유출 검사 530파일 · 프로덕션 Ready(`publishable(anon)` · `places 86 · items 15` · `/sw.js` 200).
> 변경이 `scripts/`+`docs/` 뿐이라 산출물은 동일하다. **다음 차례는 그대로 사용자의 `data:analyze --dry-run --limit 5`** 다.
> 이전 (v22: v21 + **셀프 리뷰 반영** — 되울림 검사가 **도로명 안의 숫자**에 걸려 도로 중심점을 통과시켰다(HIGH).
> 제주 도로명은 숫자가 박힌 것이 흔하고(`김녕로2길`·`상가로1길`) `addressElements` 가 안 읽히는 분기에서는 그게 유일한 방어라 **두 겹이 0 겹이 됐다** —
> 이제 **번호 토큰 자체**를 대조한다. 로그 위생 둘(200 인데 JSON 아닐 때 본문 조각 · 게이트웨이 `errorCode` 원문)과 오라클 순서도 함께 고쳤다. 상세는 [03](03-analyze-and-review.md) v9.
> 이전 (v21: **주소 → 좌표 축을 구현했다** — `scripts/analyze/naverGeocode.mjs` · 규격 `lib/naverMapsApi.mjs` · 55 테스트(전체 566).
> 이름 축이 좌표를 못 붙인 후보에만 붙고, **키가 다르다**: `NAVER_MAP_CLIENT_ID`·`NAVER_MAP_CLIENT_SECRET`(NCP **Maps** Application — 검색 키가 아니다).
> 조사에서 나온 함정을 코드·테스트에 박았다 — **`totalCount>0` 은 채택 근거가 아니다**(거친 주소가 `status OK` 로 행정구역 **중심점**을 준다).
> 방어가 세 겹: 호출 전 주소 특정성 · 돌아온 주소가 **내가 물어본 번호를 되울렸는지** · `addressElements` 의 건물번호. 가운데 것이 `type`/`types` 문서 모순을 살아서 넘는다.
> **이름 축과 달리 401/403/429 가 fatal 이 아니다** — 이 축은 더하기만 하므로 죽으면 어제까지의 동작으로 돌아갈 뿐이다(축만 내리고 실행은 계속).
> 좌표 미확보 5곳은 **손대지 않았다**: 축이 닿지 않고(후기가 수집 창 밖), 영업 확인이 좌표보다 먼저다. 응답은 우리 키로 아직 못 봤다 → ⚠️3 신설)
> 이전 (v20: **주소 → 좌표(NCP Geocoding) 갈래를 TODO 로 넣었다**(상세는 [03](03-analyze-and-review.md) 의 🆕 항목).
> 지금 보강은 이름이 축이라 지역검색이 이름을 못 맞히면 좌표가 영영 없는데, 추출 스키마엔 `address` 가 이미 있다 — 이름 실패 시 주소로 폴백하면 그 후보들이 구제된다.
> 좌표 미확보 5곳도 주소는 후기에 다 있었다(실측, 표로 박아 뒀다). 단 **엔트리가 없고 후기가 1.4~3년 전이라 영업 확인이 먼저**다 — 폐업이면 좌표가 아니라 `archived`.
> 크리티컬 패스는 아니다: 첫 `data:analyze` 의 이름 축 성적(`pickReasons`)을 보고 붙인다)
> 이전 (v19: 이전 세션이 띄워 둔 셀프 리뷰가 **`data:collect` 진행 로그의 거짓 경고**를 확인해 왔다 — `let stop = 'cap'` 이
> 초기값으로 새어 나가 *잘리지 않은 키워드에* `⚠️ 창이 잘렸다` 를 찍었다(리뷰가 재현까지 붙였다). 판정을 순수 함수 `stopReason` 으로 내보내
> `received < display`(결과 소진) · `tally.old > 0`(경계에 닿았다) 으로 갈랐고, 8 테스트를 더했다(naverBlog 46). **첫 수집 로그의 ⚠️ 는 거짓일 수 있다.**
> 02 의 "문구는 포맷터에 있고 테스트가 붙어 있다" 도 정정했다 — ⚠️ 줄과 멈춤 줄은 `collect-blog.mjs` 의 인라인 템플릿이라 테스트가 없다)
> 이전 (v18: **첫 수집이 돌았다 — `blog_posts` 3,360건**(365일 창 · 키워드 6개 · url 중복 제거 후), `candidates` 0.
> 실행 순서의 **`[Claude] data:analyze --dry-run --limit 5` 를 `[사용자]` 로 고쳤다** — 코드가 좌표 보강을 *env 에 네이버 키 둘이 있을 때만* 켜고
> 분석은 일부러 숨김 입력을 받지 않으므로(오래 도는 일), **키 없는 Claude 세션이 돌리면 ⚠️1(좌표 포맷)이 또 미검증으로 남고 구독 한도만 쓴다**.
> 3,360 은 작업 큐가 아니라 **저수지**로 읽는다 — `analyze` 가 최신 글부터 가져가니 `--limit 30` 을 반복하면 시간을 거슬러 걸으며 수율이 꺾이는 곳에서 멈추면 된다(112회를 계획하지 않는다).
> `ANALYZE_MODEL`(opus-5 vs haiku) 결정은 **첫 5건 품질을 보고** — 지금 정하지 않는다)
> 이전 (v17: 사용자 결정 둘을 닫는다 — **검색 키워드는 `keywords.json` 의 6개로 확정**(🙋 02 닫힘, 코드 변경 없음)이고,
> **실기기 비행기 모드 확인은 하지 않는다**("비행기 모드는 지원하지 않을게") → ⚠️2 를 *미검증인 채로 확정*으로 닫았다. 코드·문서는 그대로 둔다 —
> **안 한 검증은 실패한 검증이 아니라서**, "안 뜨면 `sw.ts` 규칙을 지운다" 는 분기는 조건이 영영 안 와 발화하지 않는다.
> 09-23 이후 쌓인 지도 폴리시 커밋 4개(마커 표준 핀 · 컨트롤 여백 · ADR-008 v7 · 헤더 흰색)를 **검증 후 push** 했다 — 455 테스트 · `sw.js` 생성 · 유출 검사 530파일)
> 이전 (v16: **push · `main` 머지 · 프로덕션 배포까지 끝났다.** `main` = `66b15e1`(fast-forward), Vercel 프로덕션 Ready —
> 빌드 로그 `publishable(anon)` · `places 86 · items 15` · 유출 검사 530파일. **프로덕션 `/map` 을 브라우저로 실측**했다:
> SDK 200 · `/v3/auth` **200**(= `zgnn.vercel.app` 의 NCP 등록이 살아 있다) · 마커 렌더 · 콘솔 에러 0.
> 이로써 ⚠️2(오프라인 지도)가 **이제 확인 가능**해졌다 — 사용자 실기기 비행기 모드만 남았다. 로컬 테스트 455(451 아님).
> 실행 순서도 정정: 4b 는 대시보드 둘이라 **사용자 몫**(Deploy Hook URL 이 시크릿이라서)이고, 로컬 잠금이 막는 것은
> 사용자의 대시보드가 아니라 **Claude 의 push·배포 확인**이다 — 그래서 [Claude] 줄이 끝난 뒤로 미룬다)
> 이전 (v15: **self-cr 완료 — 커밋 5개 추가.** blocker 1(폴백 경로 무방비) + major 6 + minor 다수 반영,
> 수정분도 검증 패스를 거쳤다. 로고 우상단 이동은 **브라우저 실측**으로 닫았고, 좌표 판정의 **datum 한계**와
> "영구 고장이 오프라인 문제로 보고된다" 를 ⚠️ 절에 더했다. 남은 것은 push → 로컬 잠금 → 키워드)
> 이전 (v14: **좌표 보강도 네이버로** — `kakaoLocal.mjs` → `naverLocal.mjs`(02 수집과 같은 키). 검색 API 시한은 사용자가 2026-07-25 전에 발급해 둬 **2027-06-30 까지 산다**(확인 완료).
> 「다음 할 일」 을 `feature/naver-map` 기준으로 다시 썼다 — 끝난 것 / 남은 실행 순서 / **미검증 둘**(좌표 포맷 · 오프라인 지도)로 나눴다)
> 이전 (v13: 🚨 **네이버 검색 API 전제가 흔들린다** — 개발자센터 신규 발급이 2026-07-31 종료됐고, 2026-09-07 개정 약관이 검색 결과를
> **외부 AI 에 입력하는 것 자체를 금지**한다. 2·3 단계가 여기 걸린다(아래 「막힌 것」 절). 지도는 네이버로 교체 완료(ADR-008 v4). 조사 원문은 [naver-migration-research.md](naver-migration-research.md).
> 실행 순서의 `[Claude] self-cr → push` 는 이미 끝났다 — `main` = `origin/main` = `dabb092`)
> 이전 (v12: "다음 할 일" 을 **실행 순서 블록**(누가 무엇을 치는가)으로 다시 쓰고 끝난 항목은 접었다. 상태 줄·단계 표에 남아 있던
> "(b) 는 파일만 · GitHub 시크릿 2개 · 미커밋" 을 현재 사실로 — (b) 는 원격 적용·실측 완료이고 열린 것은 어드바이저 대시보드 확인 하나. JWT expiry 3600 → **43200**(실효 11.5시간). 세션 로그 (6) 을 (5) 위로)
> 이전 (v11: **(b) 원격 적용·실측 완료** — `db push` 뒤 anon/세션 경로를 테이블·동작별로 실측(진행 상태 0 의 (b) 줄). JWT expiry 3600 실측. 남은 것은 self-cr → push → 로컬 잠금)
> 이전 (v10: **(c) 구현** — `collect.yml` 삭제 · `supabaseClient` 세션/anon 둘(service 키는 CI 든 아니든 트립와이어) · `collect-blog` 네이버 키 숨김 입력 ·
> `loginReadHidden` → `readHidden` 리네임 · 옛 Actions 문구 정리 · (b) `narrow_grants` 마이그레이션 **파일** · 문서(todo 00·02·03·04·05·이 README). GitHub 시크릿 2개 삭제 완료(`gh secret list` 빈 결과 — **0개**). (b) 는 파일만 — 원격 적용은 v11.
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
> 상태: **진행 중**. 0·1·2·3·5 는 코드가 있고 4a 도 끝났다. 시크릿 모델(ADR-016)은 구현·실측 완료로 `main` 에 있다. **지도와 좌표 보강은 네이버로 옮겨 `feature/naver-map` 에 있다(미push).** 남은 것은 **self-cr → push → 로컬 잠금 → 키워드 확정 → 첫 수집·분석 실행(사용자 터미널)** 과 4b(웹훅 재빌드), 그리고 미검증 둘(좌표 포맷 · 오프라인 지도)이다. 각 항목의 `[ ]` 를 채워 가며 진행하고, 결정이 확정되면 ADR 로 옮기고 여기서는 링크만 남긴다.

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
| 0 | [00-setup-supabase-vercel.md](00-setup-supabase-vercel.md) | 끝남 — GitHub 0개·Vercel 0개(실측), 로컬은 세션만. 남은 건 Deploy Hook(4b) | 프로젝트 둘 다 생성, **시크릿은 GitHub 0개·Vercel 0개**(로컬은 세션만) |
| 1 | [01-schema-and-seed.md](01-schema-and-seed.md) | 데이터는 `src/data/*.json` 뿐 | Supabase 가 원본. 86곳·15개 시드, `data:pull` 로 JSON 생성 |
| 2 | [02-collect-naver-blog.md](02-collect-naver-blog.md) | 코드 완료(실행 전) | 키워드로 최근 1년 블로그 글을 **사용자 터미널에서 수집**(`pnpm data:collect`, 스케줄 없음) |
| 3 | [03-analyze-and-review.md](03-analyze-and-review.md) | 코드 완료(실행 전) | Claude(구독, 로컬 `claude -p`)가 장소·조건을 뽑고, 사람이 링크 보고 승인 — 사용자 터미널의 운영자 세션에서 |
| 4 | [04-deploy-and-propagate.md](04-deploy-and-propagate.md) | 4a 완료(빌드가 DB 를 anon 으로 읽음) · 4b 없음 | 승인 → 자동 재빌드 → 사이트 반영(수동 경로는 `data:apply` 뒤 Redeploy) |
| 5 | [05-security.md](05-security.md) | 두 출처(세션·anon) · (b) GRANT 축소 원격 적용·실측 완료(어드바이저 확인만 남음) | 키 분리·RLS·GRANT 상한·웹훅 서명·프리뷰 보호 |

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
    - [x] **(b) `20260922120000_narrow_grants.sql`** — 파일 작성(2026-09-22 (5)), `db push` 적용(2026-09-22 (6)): 여섯 테이블 ALL 회수 · anon 은 places·items select · authenticated 는 5 테이블 select/insert/update + operators select ·
          default privileges 차단 · `operators_all` → select/insert/update 15 정책 · `is_operator()` execute 는 authenticated 만. **원격 적용·실측 완료(2026-09-22 (6))**: anon = places 86·items 15 select 만(blog_posts·candidates·operators select, delete·insert, `rpc is_operator` 전부 42501) · 운영자 세션 = 5 테이블 select(operators 는 자기 행 1) · delete → 42501 · insert 는 grant·정책을 지나 not-null(23502)에서 멈춤 · `data:apply --dry-run` 반영 0건 exit 0 · `CLAUDECODE=1 data:collect` 거부 문구 실측. JWT expiry 는 (6) 시점 **3600 실측**(로그인 문구의 만료가 +1h, 실효 30분) → 같은 날 사용자가 **43200** 으로 올렸다(실효 11.5시간)
    - [x] `pnpm data:login`/`logout`(`scripts/login.mjs`·`logout.mjs`·`lib/sessionKeychain.mjs`) · `lib/supabaseClient.mjs` ~~출처 3단계 + 13 테스트~~ → **출처 둘(세션/anon) + 18 테스트**(2026-09-22 (5):
          service 경로·`SUPABASE_URL` override·`inCi` 삭제, env 에 service 키가 있으면 CI 든 아니든 throw, `readOnly` 는 anon + 이름만 경고) · `pull-db` readOnly · deny 확장
    - [x] `PUBLISHABLE_KEY` 상수 채움(2026-09-21 (4)) → `pnpm data:pull` 이 **PostgREST 의 anon 경로**로 86·15 행, diff 없음 — anon 정책은 실측됐다
    - [x] `operators` insert(`zgnn@gmail.com` 만 — `zgnn-test@gmail.com` 은 비운영자 역할로 밖에 둔다) · **RLS 를 PostgREST 로 실측**(2026-09-21 (4), `data:apply --dry-run`):
      세션 없음 → 로그인 안내 exit 1 · 비운영자 → `places 가 비어 있다` exit 1 · 운영자 → `반영 0건` exit 0. 세 결과가 갈렸으므로 이제 추론이 아니다
    - [x] 대시보드(2026-09-22 (3) 사용자 완료 보고): 회원가입 off · Secure password change on · legacy JWT secret 퇴역(Migrate → Rotate → legacy API keys disable → Revoke).
      퇴역 뒤 anon `data:pull` 86·15 diff 없음 실측. **JWT expiry 는 2026-09-22 사용자가 3600 → `43200` 으로 올렸다** — 코드의 30분 skew 를 빼면 실효 창 **11.5시간**이라
      ADR-016 의 "≥ 8시간" 전제를 채운다(코드는 손댈 것 없음 — `SESSION_MAX_TTL_S` 24시간 안). 남은 확인은 다음 `pnpm data:login` 의 만료 문구가 **+12시간**인지 하나뿐 · ~~Vercel env 삭제~~(완료)
  - [ ] Vercel Deploy Hook(4b)
- [x] 1 스키마 + RLS + 시드 + `scripts/pull-db.mjs` (시드→pull 왕복, `git diff src/data` 빈 결과로 확인)
- **2** 수집
  - [x] 코드 — `scripts/collect/keywords.json` · `scripts/collect/naverBlog.mjs`(46 테스트 — `stopReason` 포함) · `scripts/collect-blog.mjs`(네이버 키: env 또는 TTY 숨김 입력, `CLAUDECODE` 거부 — 2026-09-22 (5)) ·
        `scripts/lib/readHidden.mjs`(← `loginReadHidden`, 두 소유자라 리네임, 17 테스트). ~~`.github/workflows/collect.yml`~~ 삭제
  - [x] 실행 — **2026-09-28 첫 수집 성공**(API HUB 로 옮긴 뒤 → BUG-006). `blog_posts` **3,360건**(365일 창 · 키워드 6개 · url 중복 제거 후, `analyzed_at` 전부 null).
        수집은 증분(`ignoreDuplicates`)이라 다음 실행은 새 글만 담는다. ⚠️ **이 실행의 로그에 있는 `⚠️ …창이 잘렸다` 는 믿지 않는다** —
        그 판정에 거짓 양성 버그가 있었고 이 세션에서 고쳤다(`stopReason`, 아래 세션 로그 (3)). 첫 수집은 고치기 전 코드로 돌았으므로
        "잘린 키워드" 의 근거는 **다음 수집 실행의 로그**다
- **3** 분석·승인
  - [x] 코드 — `scripts/analyze/{naverPostBody,extractPlaces,naverLocal,matchPlace,analyzeCandidates,applyApproved}.mjs`(테스트 포함) ·
        `scripts/analyze-candidates.mjs` · `scripts/apply-approved.mjs`. ~~`collect.yml` 에 analyze→apply step~~ → 사용자가 따로 부른다. Claude 인증은 로컬 `claude` 로그인뿐(자식 env 허용 목록에서 토큰·CI 제거, 2026-09-22 (5))
  - [x] `matchPlace` 본체 — 기본안 구현(🙋 였던 자리. `THRESHOLD`·`WEIGHT` 로 조정). 자동 승인은 `AUTO_APPROVE=false` 로 시작
  - [x] 엔드투엔드 1건 — 실제 후기 링크로 본문 → `claude -p` → 대조까지(DB 쓰기 없이)
  - [x] **주소 → 좌표 갈래(NCP Geocoding) — 구현**(`6cacd89`, 2026-09-28). `scripts/analyze/naverGeocode.mjs`(406줄) · 규격 `lib/naverMapsApi.mjs` · 테스트 55(전체 566).
        이름 축이 좌표를 못 붙인 후보에만 붙고 **키가 다르다**(`NAVER_MAP_CLIENT_ID`/`_SECRET` — Maps Application, Geocoding 체크 필요). [03 의 항목](03-analyze-and-review.md)이 정본.
        ~~크리티컬 패스가 아니다 — 첫 실행의 `pickReasons` 를 보고 우선순위를 정한다~~ → **더 기다릴 게 없다. 이미 만들어져 실행 순서에 들어가 있다**(아래 `--dry-run --limit 5` 의 뒤 두 키가 이 축이다).
        남은 것은 구현이 아니라 **실측**이고, 그건 ⚠️3 이다 — 같은 실행에서 ⚠️1 과 함께 닫힌다
  - [ ] 실행 — `blog_posts` 3,360건이 대기 중이고 `candidates` 는 **0건**(2026-09-28 실측). 첫 실행은 **네이버 키를 env 로 넘긴 사용자 터미널**에서
        `--dry-run --limit 5`(아래 **실행 순서**). 키 없는 Claude 가 돌리면 좌표 보강이 건너뛰어져 ⚠️1 이 또 미검증으로 남는다
- [x] 4a Vercel 빌드 명령 `pnpm data:pull && pnpm build`(`vercel.json`) — 첫 배포는 `outputDirectory: "out"` 때문에 실패했고(BUG-005) 고쳐 커밋했다.
      **`main` `66b15e1` 프로덕션 Ready 로 확인 완료**(2026-09-23 (3)): 빌드 로그 `publishable(anon)` · 86·15 · 유출 검사 530파일, 프로덕션 `/map` 브라우저 실측 정상
- [ ] 4b DB 웹훅 → Deploy Hook 자동 재빌드
- **5** 보안
  - [x] `scripts/check-bundle.mjs` 유출 검사(빌드 뒤 자동 실행) · `.env.example` 커밋
  - [x] anon select 빈 결과(5 테이블 `[]`) · env→번들 유출 경로(참조가 있을 때만 잡힘 — 그게 맞는 자리) · 보안 헤더 3개(`vercel.json`)
  - [x] ~~🙋 마켓플레이스가 넣은 여분 시크릿 정리~~ → 연동 해제 + env 0개(2026-09-22 (2)) · service_role 은 회전 대신 퇴역(2026-09-22 (3))
  - [ ] 프리뷰 보호 · 키 회전 절차(남은 대상은 네이버 키·Deploy Hook 뿐) · ~~(b) GRANT 축소 원격 적용·검증~~(완료 (6)) · 7일 일시정지를 깨우는 잡이 없어졌다(05 에 비용으로 기록)
- [x] `docs/architecture/data-pipeline.md` v2 (이번에 반영)

체크박스가 정본이다. 진행 상황을 다음 세션에 넘길 때는 아래 세션 로그에 한 줄 남긴다.

## 다음 할 일 (2026-09-28 기준 — 새 세션은 여기서 시작)

브랜치 **`feature/naver-map`** 은 push 되고 **`main` 에 fast-forward 머지됐다**(`main` = `origin/main` = `66b15e1`, 2026-09-23 (3)).
지도 교체 · 좌표 보강 네이버 전환 · self-cr 반영까지 전부 `main` 에 있고, **프로덕션에도 배포됐다**(아래 「끝난 것」).
그 앞의 `feature/local-only-pipeline` 도 `main` 에 머지돼 있다(= ADR-016 구현·실측, (b) GRANT 축소, Actions 폐지).

### 이 브랜치에서 끝난 것 (새 세션이 다시 하지 말 것)

- **지도 = 네이버 NCP Maps v3.** `src/lib/naverMap.ts` · `src/naverMaps.d.ts` · `mapPageCanvas` · `sw.ts` · `places.ts`. Kakao 파일 2개 삭제.
  **브라우저 실측 완료** — `/map` 렌더·마커·로고·저작권 표시 정상, 서비스워커 캐시 항목 수(타일 23 · 자원 6 · SDK 2)까지 셌다.
- **좌표 보강 = 네이버 지역 검색.** `scripts/analyze/naverLocal.mjs`(29 테스트). **02 수집과 같은 키**를 쓴다 — 키를 더 발급하지 않아도 된다.
- 결정은 [ADR-008 v4](../decisions/ADR-008-map-provider.md)(파일명이 `ADR-008-kakao-map.md` → `ADR-008-map-provider.md` 로 바뀌었다). 조사 원문은 [naver-migration-research.md](naver-migration-research.md).
- **455** 테스트 통과 · `pnpm build` 통과(`sw.js` 생성 확인) · 번들 유출 검사 530파일 통과 (2026-09-23 (3) 재실행).
- **`main` 머지 · 프로덕션 배포 실측**(2026-09-23 (3)). 빌드 로그: `publishable(anon — published 읽기만)` · `pull 완료: places 86 (published) · items 15` · `번들 유출 검사 통과: 530 파일`.
  프로덕션 `https://zgnn.vercel.app/map` 을 브라우저로 열어 **네트워크까지 확인**: `maps.js` 200 · **`/v3/auth` 200**(= NCP 콘솔의 Web 서비스 URL 에
  `zgnn.vercel.app` 이 살아 있다는 뜻 — 이게 401 이면 지도가 통째로 안 뜬다) · `styles/{basic,terrain,satellite}.json` 200 · 네이버 로고 이미지 200 ·
  마커 렌더(「81곳 표시 중」 — 86 이 아닌 건 **정상**이다. `geo` 가 없는 5곳(요호르기 스테이 · 미트타운 · 개떼목장 · 브릭스제주 · 롯지먼트)이 지도에서 빠진다,
  → [ARCHITECTURE](../ARCHITECTURE.md) 「좌표는 81곳」) · **콘솔 에러 0**. 지도 청크는 동적 import 라 HTML `<script>` 에 안 잡힌다 — `curl` 로는 검증되지 않는 자리다.
- `pnpm data:pull` 재실행 → 86·15, `git diff src/data` 빈 결과(커밋된 스냅샷이 DB 와 같다).

### 남은 것 — 실행 순서 (이 블록이 정본)

```
[Claude]  ✅ self-cr → ✅ push → ✅ main 머지 → ✅ 프로덕션 배포·실측  (2026-09-23 (3), 이 줄은 끝났다)
[사용자]  로컬 잠금 3개: vercel logout · gh auth logout -u hoiya-woohyun · ssh-keygen -p -f ~/.ssh/id_ed25519_hoiya
          ⚠️ 잠그면 **Claude 가 push·배포 확인을 못 한다**(사용자 대시보드 작업은 영향 없다 — CLI 만 끊긴다).
          ✅ **선행이 없어졌다 — 지금부터 언제든 잠가도 된다**(2026-09-28, (4) 에서 재확인). 이 셋이 끊는 것은 Vercel CLI · GitHub CLI · git push 이고,
          아래 [Claude] 줄(analyze/apply dry-run)은 **셋 중 무엇도 쓰지 않는다** — 필요한 건 `data:login` 의 Supabase 세션(키체인)과 로컬 `claude` 인증뿐이라 잠금 뒤에도 그대로 돈다.
          ⚠️ **다만 "선행이 없다" 는 이 줄을 쓴 시점의 사실이지 불변식이 아니다.** 커밋이 쌓이면 다시 생긴다 —
          **잠그기 직전에 `git log --oneline origin/main..HEAD` 가 비었는지 한 번 본다**(09-28 (2)·(4) 에서 두 번 재발했다)
[Claude]  ✅ 미push 커밋 4개 push → 프로덕션 배포 확인  (2026-09-28, 지도 폴리시 3 + 헤더 흰색 1)
[Claude]  ✅ 미push 커밋 **6개** push → 프로덕션 배포 확인  (2026-09-28 (4) — 수집 진행 로그 · `stopReason` · 좌표 미확보 5곳 · Geocoding 축 `6cacd89` + 문서 3).
          트래커가 "선행이 없어졌다" 로 닫아 둔 사이 다시 쌓인 것이다(같은 패턴 두 번째). 검증: **566 테스트** · `pnpm build`(`sw.js` 64KB) · 유출 검사 530파일 ·
          프로덕션 Ready(`publishable(anon)` · `places 86 · items 15` · 530파일, `/sw.js` 200). 변경이 `scripts/`+`docs/` 뿐이라 산출물은 동일하다
[사용자]  ✅ 검색 키워드 확정 — `keywords.json` 의 6개를 그대로 쓴다(2026-09-28). 코드 변경 없음, 🙋 02 닫힘
[사용자]  pnpm data:login   → 만료 +12시간 확인
[사용자]  ✅ pnpm data:collect → blog_posts **3,360건**(2026-09-28, 365일 창 · 키워드 6개 · 중복 제거 후)
[사용자]  NAVER_CLIENT_ID=… NAVER_CLIENT_SECRET=… NAVER_MAP_CLIENT_ID=… NAVER_MAP_CLIENT_SECRET=… pnpm data:analyze --dry-run --limit 5   ← **다음 차례. Claude 몫이 아니다**
          ⚠️ **키가 두 쌍이다**(2026-09-28): 앞의 둘은 **검색**(API HUB · 이름 축), 뒤의 둘은 **Maps**(Geocoding · 주소 축)다. 값이 서로 다르고 헤더 이름은 같아
          섞으면 그냥 401 이다. Maps Application 에 **Geocoding 체크**가 필요하다. 뒤 둘이 없으면 주소 축만 꺼지고 실행은 정상이다(⚠️3 이 미검증으로 남는다).
          왜 Claude 가 아닌가: 좌표 보강은 **env 에 키 둘이 다 있을 때만** 켜지고, 분석은 일부러 숨김 입력을 받지 않는다(글마다 몇 분씩 도는 일이라
          중간에 프롬프트가 뜨면 안 된다 — `analyze-candidates.mjs` 주석). 키 없는 Claude 세션이 돌리면 "좌표·주소 보강을 건너뛴다" 가 찍히고
          **⚠️1 이 또 미검증으로 남은 채 구독 한도만 쓴다**(2026-09-28 정정 — v16 까지 이 줄은 [Claude] 였다).
          읽을 것 셋: (1) 요약의 좌표 보강 줄 → ⚠️1 판정(아래) (2) 전 건이 "분석 불가" 면 글이 아니라 **본문 스크레이퍼**다(그 경우 스크립트가 스스로 exit 1)
          (3) 글당 후보 수 = 아래 `ANALYZE_MODEL` 결정의 입력
[사용자]  pnpm data:analyze --limit 30 (키를 env 로 — 좌표 보강이 꺼진 실행은 이름·종류로만 대조된다)
          **3,360 은 작업 큐가 아니라 저수지다.** 분석은 `posted_at` 내림차순으로 가져가므로 `--limit 30` 을 반복하면 최신 글부터 시간을 거슬러 걷는다 —
          112번을 계획하지 말고 **30건 배치가 신규 장소를 더 못 만들기 시작하는 곳에서 멈춘다**(86곳 + 제주의 유한한 동반 가능 가게 = 포화가 먼저 온다).
          쪼개는 이유는 세션 창(11.5시간)이 아니라 **구독 5시간 한도**이고, 그 한도는 이 대화와 공유된다.
          🙋 `ANALYZE_MODEL`(기본 `claude-opus-5` vs `claude-haiku-4-5`)은 **첫 5건 출력 품질을 보고** 정한다 — 지금 추측하지 않는다(03 의 🙋 모델)
[Claude]  pnpm data:apply --dry-run → [사용자] pnpm data:apply
[사용자]  Studio 에서 후보 20건쯤 → AUTO_APPROVE·THRESHOLD·WEIGHT 결정(🙋 03)
[사용자]  Supabase 대시보드 어드바이저 한 번 확인((b) 검증의 마지막 항목)
[사용자]  4b: Vercel Deploy Hook 발급 → Supabase Studio 의 Database Webhook 에 그 URL.
          **대시보드 둘 다 브라우저 작업이라 CLI 로그인이 필요 없다.** Claude 몫이 아닌 이유는 권한이 아니라
          **Deploy Hook URL 이 시크릿**이어서다(ADR-016: 값은 읽지도 찍지도 않는다). 기본 경로는 이미 정해져 있다 —
          `places` 에 INSERT·UPDATE·DELETE, 그냥 둔다(🙋 04 는 "첫 달 빌드 횟수를 보고" 로 미뤄진 관찰 항목이지 지금 막는 결정이 아니다)
```

~~위 블록에 **없는** 열린 항목 하나: 주소 → 좌표 갈래~~ → **없다. 블록 안에 들어왔다**(2026-09-28 (4) 정정).
이 문단은 v20 에 그 갈래가 *제안* 이던 때 쓴 것인데 `6cacd89` 로 구현이 끝났고, 위 `--dry-run --limit 5` 줄의 **뒤 두 키(`NAVER_MAP_*`)가 바로 이 축**이다.
"첫 실행의 `pickReasons` 를 보고 붙인다" 는 순서는 이미 지나갔다 — 남은 것은 붙일지 말지가 아니라 **우리 키로 부른 적이 없다**(⚠️3)는 실측 하나뿐이다.

굳어 있는 순서는 셋뿐이다. **[Claude] 줄이 다 끝난 뒤 → 로컬 잠금**(먼저 잠그면 Claude 의 push·배포 확인이 막힌다 — 로그아웃은 늘 심부름의 끝에),
**네이버 키 → `data:collect`**(키 없이는 `blog_posts` 가 안 찬다), **`collect` → `analyze` → `apply`**.
어드바이저 확인과 4b 는 그 사이 어디서 해도 된다 — 둘 다 대시보드 작업이라 위 잠금과 무관하다(실기기 오프라인 확인은 **안 하기로 했다** — 아래 ⚠️2). `data:collect` 는 에이전트 세션에서 거부되므로(`CLAUDECODE`) **사용자 터미널 몫**이고,
`data:apply` 는 사용자가 `pnpm data:login` 해 둔 동안 Claude 도 돌릴 수 있다 — 하지만 **`data:analyze` 는 실질적으로 사용자 몫이다**:
돌기는 돌아도 Claude 의 env 에는 네이버 키가 없어 **좌표 보강이 꺼진 채** 한도만 쓴다(위 정정).

### ⚠️ 미검증 셋 — 둘은 실행 때 확인, 하나는 **확인하지 않기로 했다**

1. **이름 축(지역검색) 좌표 보강의 실제 응답을 아직 한 번도 못 봤다.** `blog_posts` 는 3,360건으로 찼지만(2026-09-28) `data:analyze` 를 돌린 적이 없다.
   (주소 축은 ⚠️3 — 같은 실행에서 함께 닫힌다.)
   **이 실측은 사용자 몫이다** — 코드가 보강을 env 의 키 둘로만 켜므로 키 없는 Claude 세션에서는 구조적으로 측정되지 않는다(위 실행 순서).
   코드는 `mapx`/`mapy` 를 **WGS84 × 10^7 정수**로 읽는데, **공식 문서가 스스로 모순된다** — 본문은 "WGS84 좌표계 기준" 이라 하고
   응답 예제는 옛 KATECH 6자리(`<mapx>311277</mapx>`)를 그대로 두고 있다. 그래서 나눈 값이 제주 범위 밖이면 **버리도록** 해 뒀다.
   → 첫 실행에서 **"좌표 보강이 전부 null"** 이면 포맷이 우리가 아는 것과 다른 것이다. 그때 실제 응답 한 건의 `mapx`/`mapy` 자릿수를 보고
   `parseNaverCoord` 를 고치고 `naverLocal.test.mjs` 에 그 값을 못 박는다. 지금 통과하는 테스트는 **가정을 못 박은 것이지 실측이 아니다.**
   또 하나 — **자릿수는 맞는데 datum 이 다른 경우는 범위 검사가 못 거른다**(구 베셀 좌표가 도 단위로 오면 제주에서 WGS84 와 수백 m 차이).
   `matchPlace` 의 `GEO_NEAR_M` 이 100m 라 판정이 갈린다. 증상은 **"채택은 0이 아닌데 기존 장소와의 거리가 일관되게 300~400m"** 다 →
   첫 실행 때 Studio 에서 몇 건을 눈으로 대조한다(→ [03](03-analyze-and-review.md)).

   **판정표**(요약의 좌표 보강 줄 · `pickReasons`):
   - `searched>0` · `picked>0` → **⚠️1 닫힘**(포맷이 우리가 아는 10^7 정수다).
   - `searched>0` · `coordUnparsable`/`coordOutOfJeju` 가 대부분 + `sample` 에 6자리 `mapx` → **포맷이 틀렸다.** `parseNaverCoord` 를 고치고
     그 값을 `naverLocal.test.mjs` 에 못 박는다.
   - ⚠️ **판정 불가에 속지 말 것**: 전부 `notJejuAddress`·`nameMismatch` 로 떨어지면 `sample` 이 null 로 남는다 — 그건 "포맷이 맞다" 가 아니라
     **5건이 아무것도 측정하지 못했다**는 뜻이다. 그때는 판정을 기록하지 말고 `--limit 20` 으로 한 번 더 돌린다.

2. **오프라인 지도가 뜨는지 모른다 — 그리고 알아보지 않기로 했다**(2026-09-28 사용자: "비행기 모드는 지원하지 않을게").
   **미검증인 채로 확정한다.** 확인할 길이 없어서가 아니다 — 배포가 끝나 폰에 설치하고 비행기 모드로 켜면 지금도 확인할 수 있다.
   확인하지 않기로 했으므로 **코드도 문서도 그대로 둔다**: `sw.ts` 의 타일·자원 캐시 규칙은 남긴다(온라인 재방문에서도 값이 있다),
   ADR-008 §「오프라인」 과 `pwa-offline.md` 의 "검증 전까지 '오프라인에서 지도가 뜬다' 고 쓰지 않는다" 도 **지금 상태 그대로가 맞는 서술**이다.
   ⚠️ **한 가지만 헷갈리지 말 것: 안 한 검증은 실패한 검증이 아니다.** 트래커가 예전에 적어 둔
   "안 뜨면 `sw.ts` 의 규칙을 지우고 '지도는 온라인 전용' 으로 확정한다" 는 **"안 뜬다" 는 실측을 조건으로 한 분기**였다.
   그 실측이 영영 없으므로 분기도 영영 발화하지 않는다 — 규칙을 지우려면 그때는 실측이 아니라 **새 결정**이 필요하다.
   네이버 SDK 는 지도를 만들 때 `/v3/auth?…&time=<매번 다름>` 을 런타임에 부르고,
   `time` 때문에 서비스워커 캐시가 그 요청을 절대 맞출 수 없다. Playwright 의 offline 에뮬레이션은 서비스워커보다 앞단을 막아 검증에 실패했다.
   정황은 나쁘다 — `/v3/auth` 가 401 일 때 SDK 는 타일을 안 그리고 예외를 던졌다. → **실기기 비행기 모드로 확인**하고,
   안 뜨면 `sw.ts` 의 타일·자원 규칙을 지우고 `pwa-offline.md`·ADR-008 의 오프라인 절을 "지도는 온라인 전용" 으로 확정한다.

3. **주소 → 좌표(Geocoding)의 실제 응답도 아직 못 봤다** — ⚠️1 과 같은 구조의 미검증이고, **같은 실행에서 함께 닫힌다.**
   조사는 깊이 했다(공식 문서 + 제3자 실응답 캡처 2건 + 자격증명 없는 라이브 프로브). 그래서 **모양은 거의 확실하고, 우리 키로 부른 적이 없다**는 것만 남았다.
   `--dry-run --limit 5` 를 **Maps 키까지 넣고** 돌리면 요약의 `주소→좌표(Geocoding):` 줄이 그 실측 보고다.

   **판정표**(`geocodeReasons`):
   - `호출>0` · `채택>0` → **⚠️3 닫힘**. 모양이 우리가 아는 것(x=경도 소수 문자열 · 9칸 `addressElements`)이다.
   - `addresses 필드없음` 이 대부분 → **응답 봉투가 다르다.** 표본의 키 이름을 보고 `pickGeocoded` 를 고친다(SDK 의 `v2` 래퍼는 이미 풀어 준다).
   - `좌표파싱실패`·`좌표제주밖` 이 대부분 → **좌표 포맷·축이 다르다.** 표본의 `x=…(타입)` 자릿수를 본다.
   - `번호안되울림` 이 대부분 → 포맷은 맞고 **지오코더가 내가 물어본 주소를 못 찾은 것**이다(중심점을 되울렸거나 다른 건물). 가드가 제 일을 한 것이다.
   - `addressElements 를 못 읽어…` 경고가 뜨면 표본의 `elementKeys` 를 본다 — 문서 표(`type`)와 예제(`types`)가 어긋나 있어 **어느 쪽이 와이어인지** 그 한 줄로 닫힌다.
   - `요청실패` 만 크면 **키·콘솔 설정**이다. `첫 요청실패:` 줄의 게이트웨이 번호로 갈린다 — **400=Geocoding 미체크 · 210=권한 없음 · 200=인증 거부**.
   - ⚠️ **판정 불가에 속지 말 것**(⚠️1 과 같다): `호출 0` 이면 아무것도 측정하지 못한 것이다. 5건 중 주소가 있는 건이 없었다는 뜻이니
     `--limit 20` 으로 한 번 더 돌린다. 요약의 `호출 전 탈락 — 주소 없음 N` 이 그 진단이다.

   **끝까지 미검증으로 남는 것**(첫 실행으로도 안 닫힌다 — 코드·문서에 그렇게 적어 뒀다):
   - **datum.** Geocoding 문서는 좌표계를 **한 줄도 말하지 않는다**(WGS84 는 형제 API 의 기본값에서 온 추론이다). 제주 범위 박스는 자릿수 오류만 잡고
     수백 m 의 datum 차이는 그냥 통과한다 — ⚠️1 의 그 함정과 같은 자리이고, **두 축을 서로 대조해도 반증이 안 된다**(같은 벤더라 함께 밀린다).
     반쯤 독립적인 기준은 기존 86곳의 좌표뿐이다: 증상은 "채택은 0이 아닌데 기존 장소와의 거리가 일관되게 300~400m" 다. 첫 실행 때 Studio 에서 몇 건을 눈으로 대조한다.
   - **0건 응답의 실제 본문**(실캡처 없음). 그래서 코드는 `status` 문자열이 아니라 **`addresses.length === 0`** 으로 분기한다 — 무엇이 와도 옳다.
     ⚠️ 떠도는 `"ZERO_RESULTS"` 는 **AI 가 쓴 스펙 문서에만** 있는 Google 어휘다. 코드에 넣지 않는다.
   - **403·429·500 의 본문**(유효한 키 없이는 도달 불가). 게이트웨이 번호는 공용 문서 표에서 왔다.


   ⚠️ **같이 볼 것: 지도가 "항상" 안 뜨는 경우.** 폴백 문구가 "지도는 인터넷이 필요해요" 라서, 옵션 이름 오류 같은 **영구 고장이
   오프라인 문제처럼 보고된다**(`maps.Position` 같은 속성 접근이 `TypeError` → `.catch` → 폴백). 비행기 모드가 아닌데 계속 안 뜨면
   네트워크가 아니라 코드를 본다. 2026-09-23 실측 시점엔 정상이었다(→ [ADR-008](../decisions/ADR-008-map-provider.md) 「로고·저작권 표시」).
   **2026-09-23 (3) 프로덕션에서도 정상**(`/v3/auth` 200 · 마커 렌더 · 콘솔 에러 0) — 그러니 지금 시점의 "영구 고장" 가설은 배제돼 있다.

### 🚩 결정은 됐지만 해소되지 않은 것 — 검색 결과 저장

네이버 검색 API 약관도, Kakao 로컬 API FAQ 도 **결과 데이터의 별도 저장·DB화를 금지**한다(NCP Maps 약관 제7조 ⑪ 은 "지도 좌표 데이터" 를 예시로 콕 집는다).
우리는 지역 검색이 준 좌표·주소를 `places` 에 굽는다. **벤더를 옮겨도 이 자리는 그대로**이고, 2026-09-23 사용자 판단으로 **네이버 기준으로 진행**하기로 했다.
기록만 남긴다 — 나중에 문제가 되면 선택지는 "사람이 Studio 에서 좌표를 넣는다" 뿐이다.

### ~~네이버 검색 API 의 시한 — 2027-06-30~~ → **해당 없음** (2026-09-28)

**이 절의 전제가 틀렸다.** 사용자 키는 개발자센터가 아니라 **NAVER API HUB(NCP)** 것이었고, 코드는 개발자센터 규격이었다 —
그래서 첫 `data:collect` 가 401 로 계속 막혔다(→ [BUG-006](../bugs/BUG-006-naver-key-401-undiagnosable.md)). 2026-09-28 에 호스트·경로·헤더를 API HUB 로 옮겼다.

- **2027-06-30 시한은 이 프로젝트에 적용되지 않는다.** 그건 개발자센터 기존 발급자의 유예 기간이고, 우리는 그 경로를 쓰지 않는다.
- ~~신규는 유료 종량제~~ → **한시적 무료**(유료 전환 시 별도 공지). 요금 압박도 없다.
- 남은 기록: 2026-07-31 개발자센터 **신규 발급 종료** — 그래서 API HUB 말고는 선택지가 없었다.
- **두 시스템이 자격증명을 똑같이 "Client ID / Client Secret" 이라고 부른다**(API HUB 콘솔도 그렇게 표시한다).
  값만 보고는 출처를 알 수 없다 — 다음에 키를 다룰 때 이것부터 확인한다.
- 2026-09-07 개정 약관이 검색 결과를 "입력하거나 학습·개선·평가·노출에 활용하는 행위" 를 금지한다. 3단계(`claude -p` 본문 분석)가 여기 걸리는지는
  **사용자가 알고 진행하는 것으로 정리됐다**(본문은 블로그 HTML 에서 읽고 검색 API 결과가 아니지만, 링크는 검색 API 가 준다).

### 접힌 것 — 끝난 항목의 근거만

0. ~~Auth 로그인 모델 구현 · publishable 키 · `operators` · RLS 실측~~ **완료**(2026-09-21 (4)).
1. ~~경로 닫기(사용자 터미널·대시보드)~~ — **로컬 잠금 3개만 남았다**(위 블록). 닫힌 것: 옛 `.env.local`·`.vercel/.env.production.local` 둘 다 없는 것 확인(2026-09-22 (2)) ·
   Vercel 마켓플레이스 **연동 해제** + env 0개(2026-09-22 (2) `No Environment`) · `supabase` CLI 는 휴지 = 로그아웃(스키마 작업 때만 열고 끝나면 닫는다) ·
   대시보드 회원가입 off · Secure password change on · **JWT expiry 43200**(2026-09-22, 실효 11.5시간).
   기록해 둘 절차 하나 — Supabase 의 legacy JWT secret 은 **회전 버튼이 없다**. 서명키 시스템이라 *퇴역*시킨다: JWT Keys 에서 ① Migrate JWT secret → ② standby 키(ECC P-256) 만들고 Rotate keys →
   ③ API Keys 에서 legacy `anon`·`service_role` disable → ④ "previously used" legacy 키 Revoke(공식 docs `guides/auth/signing-keys`). 2026-09-22 (3) 완료.
   `gh` 잠금의 함정: 레포 소유 계정(`hoiya-woohyun`)이 `gh` 의 기본 활성 계정이 아니다. Free private 레포는 브랜치 보호가 안 되므로 **이 로그아웃이 "에이전트가 빌드를 트리거할 수 없다" 를 만드는 유일한 문**이다
   (Actions 는 (c) 로 없어졌으니 남은 트리거는 Vercel 빌드뿐이고, 그 빌드는 anon 이라 읽을 시크릿이 없다).
2. ~~(c) Actions 폐지 구현 · (b) `narrow_grants` · GitHub 시크릿 삭제~~ **완료**(2026-09-22 (5)·(6)). 구현·실측 목록은 진행 상태 0 과 세션 로그 (5)·(6) 이 정본이고,
   (b) 에서 **열린 것은 어드바이저 대시보드 확인 하나**(위 블록). 결정 근거만 남긴다: 네이버·Kakao 키는 **사용자가 로컬에서 직접 관리**한다 — 스크립트는 env 로 받고 없으면 TTY 숨김 입력,
   레포·키체인·파일 어디에도 저장하지 않으며 에이전트 세션이면 exit 1. Kakao REST 키는 사용자가 안 쓴다(지도 JS 키와 다른 키) — 없으면 좌표 보강을 건너뛴다.
   (a) 봇 운영자 로그인은 **기각**(봇의 이메일·비밀번호가 GitHub 에 남아 service 키와 구조가 같다). **비용**: 화·금 자동 수집이 없어 `blog_posts` 는 사용자가 돌릴 때만 차고,
   7일 비활성 일시정지를 깨우던 잡도 사라졌다(05).
3. ~~배포 확인 — self-cr → push → Preview 가 `publishable(anon)` 인지 → Vercel 정리 → `main` 머지 → 프로덕션~~ **완료**(2026-09-22 (2)):
   `main` `63abb90` 프로덕션 Ready, Vercel env 0개·연동 없음 상태에서 `publishable(anon)` 86·15, 유출 검사 통과. self-cr 지적(major 1 + minor 4)도 전부 반영됐다 —
   그중 남는 불변식 하나: `readOnly` 는 env 에 service 키가 남아 있어도 anon 이다("빌드는 anon" 이 env 정리 순서가 아니라 **코드 불변식**).

## 세션 로그

세션이 끝나거나 컨텍스트가 커져 나눌 때 여기에 한 항목. 체크박스가 정본이고 로그는 인수인계 메모.

- 2026-09-28 (4) — **"다음 작업이 뭐냐" 에 답하려다 트래커가 stale 한 것을 찾았다.**
  사용자가 트래커만 물었고, 정본 블록의 답은 명확했다 — 다음은 사용자의 `data:analyze --dry-run --limit 5`(⚠️1·⚠️3 을 한 번에 닫는 실행).
  그런데 **문서가 말하는 상태와 `git log origin/main..HEAD` 가 말하는 상태가 달랐다**: 트래커는 `[Claude]` 줄을 `✅ … 이 줄은 끝났다` 로 닫아 뒀는데
  미push 커밋이 **6개** 있었다(수집 진행 로그 · `stopReason` · 좌표 미확보 5곳 실측 · Geocoding 축 `6cacd89` + 문서 3).
  **09-28 (2) 와 같은 패턴의 두 번째 재발**이다 — "미push 커밋 하나가 잠금 단계를 인질로 잡는다".
  push 전 검증(09-28 선례와 같은 3종): **566 테스트** · `pnpm build` exit 0(`sw.js` 64,667B) · 번들 유출 검사 530파일.
  push 후 프로덕션 Ready 실측: 빌드 로그 `publishable(anon — published 읽기만)` · `pull 완료: places 86 (published) · items 15` · `번들 유출 검사 통과: 530 파일`,
  `https://zgnn.vercel.app/sw.js` 200. 변경이 `scripts/`+`docs/` 뿐이라(`src/`·빌드 설정 0) 산출물은 09-23 배포와 동일하다 —
  `9f343f5`(지도 렌더 경로) 때보다 검증 부담이 가벼운 게 그래서다.
  **문서에 남긴 교훈 하나**: 잠금 줄의 `✅ 선행이 없어졌다` 는 *그 줄을 쓴 시점의 사실*이지 불변식이 아니다. 커밋이 쌓이면 다시 생긴다 —
  그래서 잠그기 직전에 `git log --oneline origin/main..HEAD` 가 비었는지 보는 절차를 그 자리에 박았다. 세 번째 재발을 막는 건 기억이 아니라 이 한 줄이다.
  **다음 차례는 바뀌지 않았다** — 사용자의 `data:analyze --dry-run --limit 5`(키 두 쌍 · Maps Application 의 Geocoding 체크 · 살아있는 `data:login` 세션).

- 2026-09-28 (3) — **띄워 둔 셀프 리뷰가 진행 로그의 거짓 경고를 물어 왔다**(이전 세션이 `9f59d0e` 를 대상으로 돌린 워크플로, 9 에이전트).
  확인 4건 중 셋이 **같은 뿌리**다: `collect-blog.mjs` 의 `let stop = 'cap'`(초기값) 이 `break` 로만 덮이는 구조라,
  **마지막 페이지에서 for 조건으로 끝나는 경우가 전부 '페이지 상한에서 잘렸다' 로 새어 나갔다.** 두 모양이 걸렸다 —
  (a) 1년 안 결과가 **901~1,000건**이면 p10 이 덜 차는데 `items.length === 0` 은 11번째 요청이 없어 못 잡는다.
  (b) p10 이 꽉 찼지만 **그 안에서 365일 경계를 넘은** 경우 — `allOld`(전부 1년 밖)가 false 라 안 보인다. 리뷰가 (b) 를 스텁으로 재현해 왔다.
  피해는 계기판 한정(담기는 행·요청 수는 같다)이지만, ⚠️ 가 권하는 조치가 "키워드를 좁혀라" 라서 **멀쩡한 창을 더 줄이게** 만든다.
  고친 방법: 멈출 이유를 순수 함수 **`stopReason`** 으로 내보냈다(`received < display` → 결과 소진 · `tally.old > 0` → 경계에 닿음 ·
  마지막 페이지가 꽉 찼고 전부 1년 안일 때만 `cap`). 테스트 8개 추가(naverBlog 38 → **46**), 리뷰가 보고한 시나리오 8개를
  고친 루프로 **재생해 확인**(901·950·999 → 거짓 ⚠️ 사라짐 · 1년밖 섞인 p10 → `365일 경계` · 1,000·5,000 → ⚠️ 유지).
  **못 가른 한 자리는 남겼다**: 1년 안이 정확히 1,000건이면 소진과 잘림이 구별되지 않는다 — 응답의 `total` 을 읽으면 갈리지만
  그 필드의 의미를 실측한 적이 없어 **보수적으로 ⚠️ 를 붙여 둔다**(검증 안 된 필드 위에 판정을 올리지 않는다).
  넷째 확인은 문서였다 — 02 의 "문구는 포맷터에 있고 테스트가 붙어 있다" 가 사실이 아니다(멈춤 줄·⚠️ 줄·덩어리 진행은
  `collect-blog.mjs` 의 인라인 템플릿이고, 그 파일은 최상위 `await` 라 import 만으로도 돌아 테스트를 붙일 수 없다). 있는 것과 없는 것을 갈라 적었다.
  **이 세션의 첫 수집(3,360건)은 고치기 전 코드로 돌았다** — 그 로그의 ⚠️ 는 거짓일 수 있고, "잘린 키워드" 의 근거는 다음 수집 로그다.

- 2026-09-28 (2) — **첫 수집이 돌았다(3,360건), 그리고 실행 순서의 한 줄이 틀렸다는 게 드러났다.**
  사용자가 `pnpm data:collect` 를 끝내고 "다음은?" 을 물었다. 상태를 **추측하지 않고 읽었다**(읽기 전용 probe, 값은 찍지 않음):
  `blog_posts` **3,360** · 전부 `analyzed_at` null · `candidates` **0** · 세션 실효 만료 **오늘 22:55** · 최신 글 2026-09-28, 최근 200건이 09-19 까지.
  키워드 분포는 「제주 애견 펜션」 이 최다(최근 200 중 94).
  **정정 하나**: 실행 순서의 `[Claude] pnpm data:analyze --dry-run --limit 5 ← 좌표 보강의 첫 실측` 은 **성립하지 않는다.**
  `analyze-candidates.mjs` 는 보강을 **env 에 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 둘이 다 있을 때만** 켜고, 분석은 일부러 숨김 입력을
  받지 않는다(글마다 몇 분씩 도니 중간에 프롬프트가 뜨면 안 된다). Claude 세션 env 에는 그 키가 없다(`node -e` 로 확인: 둘 다 false).
  그대로 Claude 가 돌리면 **"좌표·주소 보강을 건너뛴다" 가 찍히고 ⚠️1 은 또 미검증으로 남은 채 구독 한도만 탄다** — 그래서 그 줄을 `[사용자]` 로 옮겼다.
  ⚠️1 에는 **판정표**(닫힘 / 포맷 틀림 / **판정 불가**)를 더했다 — 전 건이 `notJejuAddress`·`nameMismatch` 로 떨어지면 `sample` 이 null 이라
  "포맷이 맞다" 로 오독되기 쉽다. 그건 측정이 안 된 것이고, 그때는 `--limit 20` 으로 다시 돌린다.
  **3,360 의 읽기도 바꿨다**: 작업 큐가 아니라 **저수지**다. `analyze` 가 `posted_at` 내림차순으로 가져가므로 `--limit 30` 반복은 최신부터
  시간을 거스르는 걸음이고, 멈출 자리는 회차 수가 아니라 **수율이 꺾이는 지점**이다(30건이 신규 장소를 못 만들기 시작하는 곳). 112회를 계획하지 않는다.
  `ANALYZE_MODEL`(opus-5 vs haiku) 결정은 **첫 5건 품질을 본 뒤**로 미뤘다 — 지금 정하면 추측이다.
  코드 변경은 없다(문서만). 미해결 관찰 하나: 수집 로그에 `⚠️ 키워드 N개가 10페이지 상한에서 잘렸다` 가 있었는지 — 3,360 이 6×1,000 천장에
  가깝지 않으니 전부 잘린 건 아니지만, 잘린 키워드가 있으면 그 365일 창은 거기서 끊겼다(다음 수집을 좁혀 돌릴 근거).

- 2026-09-28 — **사용자 결정 둘로 열린 칸 둘을 닫고, 09-23 이후 쌓인 커밋 4개를 검증 후 push.**
  트래커가 09-23 v16 에 멈춰 있는 동안 `main` 에 지도 폴리시 커밋이 4개 쌓여 있었다(마커 표준 핀 · 컨트롤 여백 · ADR-008 v7 · 헤더 흰색).
  그중 `9f343f5` 가 지도 렌더 경로를 건드렸는데 마지막 검증 근거가 09-23 것이어서 **push 전에 다시 돌렸다** — 455 테스트 · `pnpm build`(`sw.js` 64KB 생성) · 유출 검사 530파일.
  **이게 급했던 이유는 품질이 아니라 순서다**: 실행 순서의 로컬 잠금(`vercel logout` · `gh auth logout`)이 지나가면 Claude 가 push 도 배포 확인도 못 한다 —
  미push 커밋 하나가 잠금 단계를 인질로 잡고 있었다. 로그아웃은 늘 심부름의 끝에.
  **닫은 것 둘**: (1) 🙋 02 검색 키워드 — `keywords.json` 의 6개 그대로 확정(코드 변경 0). (2) ⚠️2 오프라인 지도 — 실기기 비행기 모드 확인을 **안 하기로** 했다.
  **여기서 갈렸던 해석 하나**를 남긴다: "비행기 모드는 지원하지 않을게" 를 *기능을 빼라* 로 읽으면 `sw.ts` 의 타일·자원 캐시 규칙을 지우게 되는데,
  그 지시는 실행 순서 표의 **사용자 몫 검증 줄**에 대한 답이었으므로 *그 확인을 안 하겠다* 가 맞는 읽기였다. 트래커의 "안 뜨면 규칙을 지운다" 는
  **"안 뜬다" 는 실측을 조건으로 건 분기**라, 실측이 영영 없으면 분기도 발화하지 않는다 — 규칙을 지우려면 새 결정이 필요하다.
  **네이버 키 모호함도 정리**: `blog_posts` 를 막고 있는 것은 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(개발자센터 **검색** API)이고,
  이 한 키가 02 블로그 검색과 03 좌표 보강(지역 검색) **둘 다**를 연다. 지도의 `NEXT_PUBLIC_NAVER_MAP_KEY_ID`(NCP, 공개)와는 다른 값이다.
  다음: 사용자 몫 — `data:login` → `data:collect`(키) → 4b Deploy Hook. Claude 몫 — `blog_posts` 가 차면 `data:analyze --dry-run`(⚠️1 좌표 포맷 첫 실측).

- 2026-09-23 (3) — **push · `main` 머지 · 프로덕션 배포·실측.** 순서: `data:pull`(86·15, diff 없음) → `pnpm test` **455** · `pnpm build`(`sw.js` 생성 · 유출 검사 530파일) →
  `git merge --ff-only` 로 `main` = `66b15e1` → push → Vercel 프로덕션 자동 빌드 Ready(≈40초). 빌드 로그에서 `publishable(anon — published 읽기만)` 재확인 —
  **"빌드는 anon" 이 코드 불변식**이라는 주장이 프로덕션에서 한 번 더 섰다.
  **배운 것(검증 방법론)**: 배포 확인을 `curl` 로 하려다 세 번 헛짚었다 — (1) `/map` 은 `/map/` 로 **리다이렉트**해서 `curl` 이 "Redirecting..." 21바이트만 받는다(`-L` 필요),
  (2) 지도 SDK URL 은 **동적 import 청크**에 있어 HTML `<script>` 목록을 다 뒤져도 안 나온다(24개 청크 전수 확인 → 0건),
  (3) 로컬 `out/` 의 청크 해시는 배포본과 달라 그 이름으로 받으면 404 다. → **브라우저(Playwright)로 네트워크를 보는 게 유일하게 맞는 검증**이었다:
  `maps.js` 200 · **`/v3/auth` 200**(도메인 등록 유효) · 스타일 JSON 3개 · 로고 이미지 · 마커 렌더 · 콘솔 에러 0.
  트래커 정정 둘: v15 의 "커밋 5개, 아직 push 안 했다" 는 이미 낡아 있었고(브랜치는 `origin` 과 동기), 테스트 수는 451 이 아니라 455 다.
  **실행 순서에 빠져 있던 단계**: `main` 머지가 정본 블록에 없었다 — `main` 이 Vercel 프로덕션이라 머지 없이는 4b 도 ⚠️2 도 구조적으로 막혀 있었다. 이번에 넣었다.
  다음: 로컬 잠금은 **4b 뒤로 미룬다**(`vercel logout` 하면 Deploy Hook 을 못 만든다). 사용자 몫 둘 — 키워드 확정(🙋 02) · 4b 대시보드 2단계.

- 2026-09-23 (2) — **self-cr → 커밋 5개 추가.** 리뷰(독립 `code-reviewer`, opus)가 🔴 1 · 🟠 6 · 🟡 다수를 냈고 **전부 반영**,
  수정분을 같은 리뷰어에게 **검증 패스**로 되돌려 🟠 1 · 🟡 3 을 더 받아 그것도 닫았다. 455 테스트.
  **가장 값진 지적 둘**: (1) 마커를 *올릴* 때만 try 로 감쌌고 **정리하는 쪽**(`clearMarkers`·`destroy`)과 250ms 타이머가
  열려 있어 **폴백으로 가는 경로 자체가 무방비**였다 — 재진입까지 있어 "한 번의 실패가 영구 고장" 이었다.
  (2) `sw.ts` 주석이 스스로를 반박했다 — "`/v3/auth` 는 무해, 넘치면 오래된 것부터 밀려난다" 인데 **LRU 에서 가장 오래된 것이 `maps.js`** 다.
  **방법론 교훈**: 리뷰어가 "이 브랜치가 세운 증거 기준을 이 수정에만 안 지켰다" 고 짚어(오프라인은 미검증으로 내리고 zoom 은 화면으로 확인해 놓고
  로고 이동만 코드로 단정) **브라우저 실측으로 닫았다** — `naver.maps.Position` 실재(13 멤버 · `TOP_RIGHT === 3`), 로고·저작권 둘 다 우상단,
  모바일에서 저작권만 세로 4px 겹침. 덤으로 칩 띠가 `pointer-events-auto` 전폭이라 **로고 탭을 먹고 있던 것**도 나왔다(`w-fit max-w-full`).
  **함정 하나**: `.d.ts` 의 `Position` 선언이 9개(실제 13개)라 `TOP_RIGHT` 가 2 였는데 런타임은 멀쩡했다 —
  **ambient enum 의 초기화자 없는 멤버는 인라인되지 않기** 때문. `const enum` 이나 숫자 직접 지정이면 조용히 깨졌을 자리라 주석에 경고를 남겼다.
  **사고 하나**: `pnpm preview 2>&1 | head -20` 이 SIGPIPE 로 서버를 죽였다 — 백그라운드 서버를 파이프로 자르지 말 것.
  의도적으로 남긴 🟡: `naverMap` 의 거부된 promise 캐시 · `naverLocal` 필드 우선순위·좌표 불량 시 주소 폐기(실제 응답을 봐야 판단) · 타일 호스트 샤딩(확신도 낮음).
  다음: push → 로컬 잠금 → 키워드 확정 → 첫 수집·분석.

- 2026-09-23 — **지도·좌표 보강을 네이버로.** 브랜치 `feature/naver-map`, 커밋 5개(미push).
  한 것: NCP Maps v3 교체(로더·타입·캔버스·sw·zoom) → **브라우저 실측**(렌더·캐시 항목 수) → `naverLocal.mjs`(29 테스트) → 문서 8개.
  실측이 문서 조사를 **세 번 뒤집었다**: (1) 타일·자원 호스트가 **페이지 프로토콜에 따라 갈린다**(HTTPS `*.pstatic.net` / HTTP `*.naver.net`) — 한쪽만 적으면 캐시가 조용히 빈다,
  (2) `navermap_authFailure` 는 401 에서 **안 불리고** SDK 가 `Marker.setMap` 에서 던진다 → try/catch 필수,
  (3) **포트를 본다**(등록 안 된 포트 → 401) — 7727 고정 유지. 2차 출처들의 "호스트만 본다" 는 틀렸다.
  약관 1차 출처 확보(Maps 제7조 ⑪): 금지 대상은 "지도 **좌표** 데이터" 이지 타일이 아니다 — 2차 요약들이 타일로 잘못 인용하고 있었다.
  **하지 말 것**: 워크플로로 웹 조사를 팬아웃하지 말 것(이 세션에서 5 에이전트가 전부 stall, 2.2M 토큰·2.8시간 낭비. 다만 트랜스크립트에서 결과를 건질 수는 있었다).
  사고 하나: 2일 된 `next dev` 가 7727 을 잡고 있어 한참 dev 서버를 정적 빌드로 착각했다 — 포트 점유를 먼저 볼 것.
  다음: self-cr → push → 로컬 잠금 → 키워드 확정 → 첫 수집·분석. 미검증 둘은 「다음 할 일」 의 ⚠️ 절.

- 2026-09-22 (6) — **(b) 원격 적용·실측**. 사용자 `supabase login` → dry-run 에 `narrow_grants` 하나 → 사용자 확인 뒤 `db push` 적용 → **원격 적용·실측 완료(2026-09-22 (6))**: anon = places 86·items 15 select 만(blog_posts·candidates·operators select, delete·insert, `rpc is_operator` 전부 42501) · 운영자 세션 = 5 테이블 select(operators 는 자기 행 1) · delete → 42501 · insert 는 grant·정책을 지나 not-null(23502)에서 멈춤 · `data:apply --dry-run` 반영 0건 exit 0 · `CLAUDECODE=1 data:collect` 거부 문구 실측. JWT expiry 3600 실측(로그인 문구의 만료가 +1h) — 실효 30분이라 `data:analyze` 는 `--limit 30` 씩이거나 43200 으로 올린다(→ 같은 날 사용자가 **43200** 으로 올려 닫혔다). 검증용 임시 스크립트는 지웠다(값 없이 코드·행 수만 찍는 것).

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
  `places 가 비어 있다` exit 1 · 운영자 `반영 0건` exit 0. (3) JWT expiry 는 기본 3600 유지(사용자 결정) — skew 30분과 합치면 실효 세션 30분, 문서에 보류로. (2026-09-22 `43200` 으로 변경돼 이 보류는 닫혔다.)
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
| ~~02~~ | ~~검색 키워드 목록~~ **닫힘**(2026-09-28) — `scripts/collect/keywords.json` 의 6개로 확정 | 도메인 지식. "강아지 동반" vs "애견 동반" vs "반려견" 이 다른 글을 낸다 |
| 03 | `matchPlace` 가중치·임계값(`WEIGHT`·`THRESHOLD`), **자동 승인을 켤지**(`AUTO_APPROVE`, 기본 off) | 기본안은 구현돼 있다. 틀리면 데이터가 조용히 썩는다. 86곳이라 사람 비용이 싸다 |
| 03 | AI 모델 | 구독이라 비용 차이는 없고 한도 소모뿐. 기본 `claude-opus-5`, `ANALYZE_MODEL` 로 비교 |
| 04 | 승인마다 재빌드 vs 모아서 "반영" 한 번 | 빌드 횟수 = Vercel 무료 한도 소비 |
| 02·05 | 수집 주기(스케줄이 없다 — 사용자가 돌릴 때만) · 7일 일시정지를 무엇으로 깨울지 | (c) 의 비용. 주 1회 `pnpm data:pull` 이면 충분하지만 그건 습관이지 코드가 아니다 |

## 기존 문서와의 관계

- [.omc/plans/2026-09-17-notion-supabase-scraping.md](../../.omc/plans/2026-09-17-notion-supabase-scraping.md) — 이 폴더가 **대체**한다. 살아남은 것: Phase 1 의 "재추출 스크립트 부재", §4 의 `matchPlace`. Phase 4 의 GitHub Actions 선택 이유는 (c) 로 뒤집혔다(2026-09-22 — 관리자 없이 도는 구조가 곧 만료 없는 시크릿 저장소라서). 거기 적힌 "git 원격이 없다" 는 이제 사실이 아니다(`origin` = `hoiya-woohyun/zgnn`).
- [ADR-011](../decisions/ADR-011-app-gate-and-supabase.md) · [ADR-012](../decisions/ADR-012-personal-data-and-consent.md) — **추후 고도화로 보류**(ADR-015 §3). 회원을 받지 않으므로 개인정보도 받지 않는다. ADR-012 의 "리전은 서울, 생성 시에만" 만 **지금 0 에서 지킨다.**
- [docs/architecture/data-pipeline.md](../architecture/data-pipeline.md) — 1·4 가 끝나면 "동기화는 수동", "런타임 fetch 없음"(이건 그대로 참), "재추출 스크립트는 없다" 를 다시 쓴다.

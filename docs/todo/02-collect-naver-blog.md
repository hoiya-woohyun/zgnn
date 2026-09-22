# 2. 수집 — 네이버 블로그, 키워드, 최근 1년

> 최종 수정: 2026-09-22 (v3: **(c) Actions 폐지** — 스케줄이 없다. 수집은 사용자 터미널에서 `pnpm data:collect`(운영자 세션 + 네이버 키는 env 또는 숨김 입력, 저장 없음).
> `collect.yml` 삭제. 비용: 7일 비활성 일시정지를 깨우던 잡이 사라졌다)
> 이전 (v2: 코드 완료(수집기+워크플로), 실행은 아직 — 네이버 키 미발급)
> 이전 (v1: 신설)
> 상태: 코드는 끝났다(키 입력 경로까지). 실행은 아직 — 네이버 키 발급 전. 선행: [01](01-schema-and-seed.md) 의 `blog_posts` 테이블. 산출물은 `blog_posts` 행이고 **장소를 만들지 않는다**(그건 03).

## HTML 스크래핑이 아니라 검색 오픈 API

"사이트를 전반적으로 스크래핑" 을 그대로 하면 두 가지에 걸린다 — 네이버 약관(HTML 크롤링 금지)과 저작권(블로그 본문).
이 레포는 이미 저작권 때문에 사진을 전량 뺐다([ADR-002](../decisions/ADR-002-no-place-photos.md)). 같은 기준으로:

| | 검색 오픈 API (`/v1/search/blog.json`) | HTML 크롤링 |
|---|---|---|
| 허용 | 공식 · 하루 25,000회 | 약관 위반 |
| 주는 것 | `title` · `link` · `description`(요약) · `bloggername` · `postdate`(YYYYMMDD) | 본문 전체 |
| 1년 필터 | **`postdate` 로 바로** | 본문에서 날짜를 찾아야 함 |
| 한도 | `display` ≤ 100, `start` ≤ 1000 → 키워드당 최대 1,100건 | — |

- **목록은 API 로만 받는다.** 키워드 × `sort=date` 로 페이지를 넘기다 `postdate` 가 1년 전을 지나면 멈춘다.
- **본문**은 AI 분석에 필요하다(요약 200자로는 이용 조건이 안 나온다). 본문은 `blog.naver.com/PostView.naver?blogId=&logNo=`
  를 받아 파싱하는데 이건 HTML 이다(`scripts/analyze/naverPostBody.mjs` — 에디터 세대 셋을 다룬다, 03). 그래서 **본문은 저장하지 않는다** — 03 이 분석하는 순간에만 받아 쓰고 버린다.
  DB 에 남는 건 링크·제목·날짜·AI 가 뽑은 **사실**(장소명·주소·조건)과 근거 문장 한두 줄뿐이다. 사람이 확인할 때는
  링크를 연다(요구사항 3번이 정확히 그 그림이다).

## 🙋 키워드 — 사용자가 정한다

`scripts/collect/keywords.json` 한 파일. 초안:

```json
["제주 강아지 동반 카페", "제주 애견 동반 카페", "제주 반려견 동반 식당", "제주 강아지 동반 숙소", "제주 애견 펜션", "제주 반려견 동반 여행"]
```

- "강아지 / 애견 / 반려견" 은 서로 다른 글을 낸다. 셋 다 넣되, 결과가 겹치는 정도를 첫 실행 뒤에 보고 줄인다.
- 종류(카페·식당·숙소)를 키워드에 넣지 않으면 AI 가 종류를 맞혀야 한다. 넣으면 `blog_posts.keyword` 가 힌트가 된다.
- 예산: 키워드 6 × 최대 11페이지 = 66회/실행. 하루 한도의 0.3%. 여유가 아주 많다.
  실제 구현은 `start` 를 1..901(10페이지)로 잡았다 — 위 "11페이지" 는 근사치였고, `display=100` 기준
  `start` 상한 1000 에 맞춰 10페이지가 정확한 값이다.

## `scripts/collect-blog.mjs` (`pnpm data:collect`)

- [x] 순수 함수 + 얇은 I/O. 검색·필터·중복 제거는 `scripts/collect/*.mjs` 에 두고 vitest 로 테스트한다
      (`vitest.config.mts` 의 include 에 `scripts/**/*.test.mjs` 추가). → `naverBlog.mjs` + 23 테스트.
- [x] `blog_posts` 에 **upsert, url 이 키**. 이미 있는 글은 건너뛴다 → 매 실행이 멱등이고, 첫 실행만 1년치, 이후는 증분.
- [x] `link` 는 `blog.naver.com/{blogId}/{logNo}` 로 **정규화**한다(같은 글이 `m.blog.naver.com`·`PostView.naver?...` 로도 온다).
      `blog_id`·`log_no` 를 따로 두는 이유다.
- [x] `title`·`description` 의 `<b>` 태그를 벗긴다(검색어 강조).
- [x] **제외 규칙**은 여기서 최소로 — "제주" 가 제목·요약 어디에도 없으면 버리는 정도. 판단은 03 의 AI 몫이다.
- [x] rate limit: 요청 사이 200ms. 25,000/일이지만 초당 제한도 있다.
- [x] 실행 결과를 한 줄로 남긴다: `수집 N건 (신규 M · 기존 K · 1년 밖 제외 J)`. 터미널 출력이 곧 관측이다.
- [x] **네이버 키는 사용자가 로컬에서 직접 관리한다**(2026-09-22 (c)) — 스크립트는 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` env 를 그대로 쓰고, 없으면
      터미널 숨김 입력(`scripts/lib/readHidden.mjs`, `data:login` 의 비밀번호 입력과 같은 것)으로 없는 쪽만 묻는다. 값은 프로세스 메모리에만 있고
      레포·키체인·파일·로그 어디에도 남기지 않는다 — 저장하면 그 자리가 곧 유출 경로라서, 매번 치는 비용을 감수한다. **비직관적인 것 둘**:
      (1) 세션 검사(`createSupabase`)가 키 입력보다 **먼저**다 — 키 두 개를 치고 나서 "pnpm data:login" 으로 멈추면 헛수고. (2) 에이전트 세션(`CLAUDECODE`)이면
      입력을 받지 않고 exit 1 — 값이 대화 기록에 실릴 수 있어서. env 로 넘긴 값은 막지 않는다(사용자가 셸에서 준 것). TTY 도 아니면 exit 1.
- [ ] **실행은 아직 안 했다** — 네이버 개발자센터 Client ID/Secret 이 없다(00 의 외부 계정 절). 첫 실행은 README 다음 할 일 5.

## 실행 — 사용자 터미널, 스케줄 없음 (2026-09-22 (c))

Vercel Cron 은 배포된 **서버 함수**를 호출하는 방식이라 `output: 'export'` 에서는 부를 게 없다. 그래서 처음엔 GitHub Actions(화·금 cron)였는데,
Actions 는 "관리자 없이 도는 구조" 라 만료 없는 시크릿(service_role·네이버 키·구독 OAuth 토큰)을 GitHub 에 두어야만 돌고, 그 자리는 에이전트가 push 한 줄로
읽을 수 있다(README 다음 할 일 2 의 원칙). **폐지했다** — 수집은 운영자가 `pnpm data:login` 한 터미널에서 `pnpm data:collect` 로만 돈다.

- **비용**: 자동 수집이 없다. `blog_posts` 는 사용자가 돌릴 때만 찬다 — 주기는 사용자가 정한다(주 1회쯤이면 키워드당 신규 수 건).
- **비직관적 비용**: 옛 잡이 **Supabase 무료 티어의 7일 비활성 일시정지**를 매번 깨웠다. 이제 DB 를 건드리는 것은 사용자의 `pnpm data:*` 와 Vercel 빌드의
  `data:pull`(push 가 있을 때만)뿐이다 — 둘 다 7일 없으면 프로젝트가 잠들고, 그러면 다음 배포의 `data:pull` 이 실패한다(이전 배포는 산다). 복구는 대시보드 Restore. 05 에 적어 뒀다.
- ~~`.github/workflows/collect.yml`: cron 화·금 + `workflow_dispatch`~~ — 삭제(2026-09-22 (5)). `.github/` 자체가 없다.
- ~~`permissions: contents: read` · 서드파티 액션 SHA 고정 · `--frozen-lockfile` · 5분 안에(무료 2,000분/월)~~ — 워크플로와 함께 소멸.
- ~~실패 알림(저장소 Watch)~~ — 터미널에서 바로 본다.
- ~~한 번은 Actions 에서 실제로 돌려 본다(데이터센터 IP)~~ — 로컬 IP 라 이 걱정 자체가 사라졌다. 본문 HTML(03) 이 데이터센터에서 막힐 수 있다는 우려도 같이.

## 끝났다고 볼 조건

- [ ] 사용자 터미널에서 `pnpm data:collect` 한 번에 `blog_posts` 에 최근 1년치가 들어오고, 두 번째 실행은 신규 0~수 건. **아직 (키 없음)**.
- [x] `docs/architecture/data-pipeline.md` 에 "수집" 절 추가(어디서·얼마나·무엇을 저장하지 않는가) — todo 링크만 걸어 뒀다(코드는 여기, 실행 전이라 결과 수치는 없다).

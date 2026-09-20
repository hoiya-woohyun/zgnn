# 2. 수집 — 네이버 블로그, 키워드, 최근 1년

> 최종 수정: 2026-09-20 (v2: 코드 완료(수집기+워크플로), 실행은 아직 — 네이버 키 미발급)
> 이전 (v1: 신설)
> 상태: 코드는 끝났다. 선행: [01](01-schema-and-seed.md) 의 `blog_posts` 테이블. 산출물은 `blog_posts` 행이고 **장소를 만들지 않는다**(그건 03).

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
  를 받아 파싱하는데 이건 HTML 이다. 그래서 **본문은 저장하지 않는다** — 03 이 분석하는 순간에만 받아 쓰고 버린다.
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
- [x] 실행 결과를 한 줄로 남긴다: `수집 N건 (신규 M · 기존 K · 1년 밖 제외 J)`. Actions 로그가 곧 관측이다.
- [ ] **실행은 아직 안 했다** — 네이버 개발자센터 Client ID/Secret 이 없다(00 의 외부 계정 절).

## 스케줄 — GitHub Actions (Vercel Cron 아님)

Vercel Cron 은 배포된 **서버 함수**를 호출하는 방식이라 `output: 'export'` 에서는 부를 게 없다. GitHub Actions 로 간다.
부수 효과로 이 잡이 **Supabase 무료 티어의 7일 비활성 일시정지**를 매번 깨운다 — 주 1회면 정확히 경계선이라 위험하다.

- [x] `.github/workflows/collect.yml`: `schedule: cron: '0 21 * * 1,4'` (KST 화·금 06:00, 주 2회) + `workflow_dispatch`.
- [x] `permissions: contents: read`. 서드파티 액션은 커밋 SHA 고정(`actions/checkout` v7.0.1 · `pnpm/action-setup` v6.1.0 ·
      `actions/setup-node` v7.0.0, Node 24 · pnpm 10).
- [x] `pnpm install --frozen-lockfile` → `pnpm data:collect`. 5분 안에 끝나야 한다(무료 2,000분/월).
- [ ] 실패하면 잡이 빨갛게 되는 것 외에 알림이 없다 → 저장소 Watch 로 이메일. 그 이상은 지금 안 만든다.
- [ ] **한 번은 Actions 에서 실제로 돌려 본다.** 로컬에서 되는 것이 데이터센터 IP 에서도 된다는 보장이 없다
      (기존 계획 §3-4). 검색 API 는 문제 없을 것이고, 본문 HTML(03) 이 걸릴 수 있다 — 그러면 03 을 로컬 실행으로 바꾼다.
      → 네이버 키가 아직 없어 워크플로 자체가 아직 한 번도 안 돌았다.

## 끝났다고 볼 조건

- [ ] Actions 수동 실행 한 번에 `blog_posts` 에 최근 1년치가 들어오고, 두 번째 실행은 신규 0~수 건. **아직 (키 없음)**.
- [x] `docs/architecture/data-pipeline.md` 에 "수집" 절 추가(어디서·얼마나·무엇을 저장하지 않는가) — todo 링크만 걸어 뒀다(코드는 여기, 실행 전이라 결과 수치는 없다).

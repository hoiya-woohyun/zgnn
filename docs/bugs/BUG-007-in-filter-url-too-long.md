# BUG-007 — `in()` 목록을 개수로 잘라 URL 이 33KB 가 되고, 실패가 `{ message: 'Bad Request' }` 로만 온다

> 최종 수정: 2026-09-28 (v1: 신설 — 첫 `pnpm data:collect` 성공 실행이 DB 쓰기 직전에 죽었다)
> 상태: 고침(길이 기반 분할 + 오류 감싸기). 실제 통과는 사용자의 다음 `data:collect` 에서 확인한다.

## 증상

`pnpm data:collect` 가 **검색까지 정상으로 마친 뒤**, 아무 맥락 없는 한 줄로 죽는다.

```
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^
{ message: 'Bad Request' }
```

스택도, 테이블 이름도, 질의도 없다. 이 줄만 보면 네이버 API 문제인지 DB 문제인지도 알 수 없다.

## 원인

`collect-blog.mjs` 는 "신규 / 기존" 을 세려고 수집한 url 을 `blog_posts` 에서 조회한다.

```js
for (let i = 0; i < urls.length; i += 500) {            // ← 개수로 잘랐다
  const chunk = urls.slice(i, i + 500);
  const { data, error } = await supabase.from('blog_posts').select('url').in('url', chunk);
```

`in()` 은 목록 **전체를 쿼리 스트링에 싣는다.** 블로그 url 은 개당 약 48자라 500개면 URL 이 **33KB** 가 되고,
요청이 **PostgREST 에 닿기도 전에** 엣지에서 거절된다. 그 응답은 PostgREST 오류가 아니라 **평문 `Bad Request`** 라,
supabase-js 가 `{ message: 'Bad Request' }` 라는 객체 하나로 감싼다.

실측 경계(2026-09-28, 이 프로젝트 Supabase 에 직접):

| 개수 | URL 길이 | 결과 |
|---|---|---|
| 200 | 13,367자 | 200 OK |
| 220 | 14,707자 | 200 OK |
| 240 | 16,047자 | **fetch 자체 실패**(undici `UND_ERR_HEADERS_OVERFLOW`) |
| 500 | 33,467자 | **400 · 본문이 JSON 아닌 `Bad Request`** ← 이 버그 |

240~300 구간이 특히 고약하다 — status 조차 못 받고 클라이언트에서 죽는다.

### 왜 이제서야 터졌나

`blog_posts` 가 계속 비어 있어 이 경로가 **한 번도 500개에 닿은 적이 없었다.** 수집이 처음으로 성공해
1년치가 들어오자 첫 조회에서 바로 넘겼다. 즉 **수집이 성공했다는 증거이기도 하다**(→ [BUG-006](BUG-006-naver-key-401-undiagnosable.md) 의 API HUB 이전이 통했다).

### 왜 진단이 안 됐나 — 맨 객체를 던졌다

```js
if (error) throw error;   // supabase-js 의 error 는 Error 가 아니라 맨 객체다
```

`Error` 가 아니면 Node 는 스택을 못 찍는다. 게다가 이 경우 객체에 `message` 하나뿐이라
"어느 테이블의 무슨 질의가 몇 건에서" 가 전부 사라졌다. PostgREST 가 직접 낸 오류였다면
`{code, message, details, hint}` 가 와서 그나마 나았을 텐데, 엣지가 가로채서 그마저 없었다.

## 수정

1. **개수가 아니라 길이로 자른다** — `scripts/lib/chunkForUrlFilter.mjs`(+ 7 테스트).
   실제로 URL 에 실리는 모양 그대로(따옴표·구분자·퍼센트 인코딩까지) 세어 예산 6,000자에서 끊는다.
   실측 상한 14,707자의 절반도 안 된다 — 요청이 몇 번 더 나가는 비용은 무시할 만하고, 반대쪽 실패는 원인이 안 보이는 종류라서.
   **개수로 자르면 안 되는 이유**는 값 길이가 데이터마다 다르다는 것이다. 같은 코드가 어떤 데이터에서는 돌고
   어떤 데이터에서는 죽으며, 그 경계가 코드 어디에도 안 적혀 있다.
   확인: url 1,200개 → 14 덩어리(최대 91건), 실제 요청 6,073자 → 200 OK.
2. **맨 객체를 던지지 않는다** — `dbError(무엇을, error, 몇 건)` 로 감싸 Error 로 만든다.
   url 값은 싣지 않고 **개수만** 싣는다.
3. upsert 쪽(500건씩)은 **그대로 둔다.** 그쪽은 POST 본문이라 URL 길이와 무관하다 — 같은 숫자지만 다른 제약이다.

## 관련

- [BUG-006](BUG-006-naver-key-401-undiagnosable.md) — 이 버그에 닿기까지 막고 있던 401. 그게 풀려서 이게 나왔다.
- [docs/todo/02-collect-naver-blog.md](../todo/02-collect-naver-blog.md) — 수집 단계

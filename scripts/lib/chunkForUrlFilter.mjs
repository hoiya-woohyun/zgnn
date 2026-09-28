// PostgREST 의 `in.(…)` 처럼 **값을 URL 에 싣는** 질의를 안전한 크기로 자른다.
//
// 왜 개수가 아니라 길이인가 — `supabase.from(t).select().in('url', chunk)` 는 목록 전체를 **쿼리 스트링**에 넣는다.
// 개수로 자르면(옛 코드: 500) 값 길이에 따라 URL 길이가 제멋대로라, 같은 코드가 어떤 데이터에서는 돌고
// 어떤 데이터에서는 죽는다. 그리고 **그 죽음이 진단 불가능한 모양으로 온다**(아래).
//
// 실측 경계(2026-09-28, 이 프로젝트의 Supabase 에 직접 쏴서 — 블로그 url 은 개당 약 48자):
//
//     200개 / URL 13,367자 → 200 OK
//     220개 / URL 14,707자 → 200 OK
//     240개 / URL 16,047자 → fetch 자체가 실패(undici UND_ERR_HEADERS_OVERFLOW)
//     500개 / URL 33,467자 → **400, 본문이 JSON 이 아닌 "Bad Request"**
//
// 마지막 줄이 BUG-007 이다. PostgREST 오류였다면 `{code, message, details, hint}` 가 왔을 텐데,
// 엣지가 요청을 **PostgREST 에 닿기도 전에** 평문으로 거절해서 supabase-js 가 그것을 `{ message: 'Bad Request' }`
// 하나로 감쌌다. 우리 코드는 그걸 그대로 `throw` 했고, Error 가 아니라 맨 객체라 **스택도 안 찍혔다.**
// 즉 "어느 테이블의 무슨 질의가 왜 죽었는가" 가 전부 사라진다.
//
// 예산은 넉넉히 잡는다 — 실측으로 확인된 상한(14,707)의 절반도 안 되게. 여기서 아낄 것이 없다:
// 요청이 몇 번 더 나가는 비용은 무시할 만하고, 반대쪽 실패는 위처럼 원인이 안 보이는 종류다.
const DEFAULT_BUDGET = 6000;

/**
 * @param {string[]} values      `in.(…)` 에 넣을 값들
 * @param {number} [budget]      인코딩 뒤 기준 예산(문자 수)
 * @returns {string[][]}         각 덩어리. 값 하나가 예산보다 길어도 **버리지 않고** 혼자 한 덩어리가 된다 —
 *                               조용히 빠지면 "기존 글" 판정이 틀려 신규 수가 부풀고, 그건 아무 데도 안 찍힌다.
 */
export function chunkForUrlFilter(values, budget = DEFAULT_BUDGET) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const value of values) {
    // 실제로 URL 에 실리는 모양 그대로 센다 — 따옴표·구분자·퍼센트 인코딩까지. 한글 url 이 섞여도 어긋나지 않는다.
    const cost = encodeURIComponent(`${JSON.stringify(value)},`).length;
    if (current.length > 0 && size + cost > budget) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(value);
    size += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

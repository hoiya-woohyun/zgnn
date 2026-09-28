// 네이버 오픈 API 실패 응답에서 **진단에 필요한 만큼만** 뽑는다. 수집(검색 블로그)과 좌표 보강(검색 지역) 둘이 쓰므로 owner-prefix 를 붙이지 않는다.
//
// 왜 규칙을 넓혔나 — 05-security 의 로그 위생은 "`fetch` 에러 메시지에는 status·query 만" 이었다. 그 규칙이 지키려는 것은 둘이고,
// 키가 로그에 안 실리는 것과 검색 **결과**가 남지 않는 것(약관: 복제·저장 금지)이다. 둘 다 여기서 그대로 지켜진다.
// 문제는 401 을 만났을 때 **status 만으로는 아무것도 갈리지 않는다**는 것이다 — 값이 틀렸는지, 애플리케이션에 「검색」이
// 없는지, 다른 계정의 키인지가 전부 같은 401 로 온다(→ BUG-006).
//
// **실측이 설계를 한 번 뒤집었다**(2026-09-28, 가짜 키로 실제 호출):
//
//     status 401 {"errorMessage":"NID AUTH Result Invalid (1000) : Authentication failed. (인증에 실패했습니다.)","errorCode":"024"}
//
// 처음엔 문서에서 흔히 인용되는 "Not Exist Client ID" 같은 문구로 갈래를 나눴는데, **실제 응답은 그렇게 오지 않는다.**
// `errorCode` 는 인증 실패 전부가 `024` 라 갈래가 없고, 갈리는 것은 `errorMessage` 안의 **괄호 숫자**(여기선 `1000`)다.
// 그래서 이 파일은 그 숫자를 뽑는 것을 본령으로 삼고, 문구 매칭은 보조로만 둔다.
//
// 내보내는 글자의 안전성 — 숫자는 `\d+` 로만 뽑고(키가 섞일 수 없다), 나머지는 전부 이 파일의 상수 라벨이다.
// `errorMessage` **원문은 어떤 경우에도 나가지 않는다**: 네이버가 앞으로 무엇을 넣을지 우리가 보장할 수 없어서다.

/** 인증 결과의 내부 코드 — 실측으로 확인된 것만 뜻을 적는다. 모르는 번호는 번호만 보여 준다(뜻을 지어내지 않는다). */
const AUTH_SUBCODES = {
  1000: '이 Client ID 로 인증이 안 된다 — 값이 틀렸거나(공백 포함) 다른 네이버 계정의 애플리케이션이다',
};

/** 문구 매칭은 보조다. 앞이 우선 — 좁은 쪽이 먼저 와야 한다. */
const LABELS = [
  [/Not Exist Client ID\s*\/\s*Secret/i, 'Client Secret 이 이 Client ID 의 것과 다르다'],
  [/Not Exist Client ID/i, 'Client ID 가 없다'],
  [/Invalid\s*API\s*Service|등록되지 않은|Not Exist Service/i, '이 애플리케이션에 해당 API 가 없다 — 개발자센터 → 애플리케이션 → 사용 API 에 「검색」을 더한다'],
  [/Quota|Rate\s*limit|한도/i, '호출 한도 초과'],
];

/** `NID AUTH Result Invalid (1000)` → 1000. 숫자만 꺼내므로 응답에서 나가는 글자가 숫자로 한정된다. */
function authSubcodeOf(message) {
  const found = /NID\s*AUTH\s*Result\s*Invalid\s*\((\d+)\)/i.exec(message);
  return found ? found[1] : null;
}

/**
 * 실패 응답 본문 → 에러 메시지에 붙일 꼬리표.
 *
 * @param {unknown} body  `res.json()` 결과(파싱 실패면 null 을 넘긴다)
 * @returns {string} ` errorCode=024 (…)` 꼴. 아무것도 못 읽으면 빈 문자열이라 호출부에서 그냥 이어 붙이면 된다.
 */
export function describeNaverError(body) {
  if (!body || typeof body !== 'object') return '';
  const { errorCode, errorMessage } = /** @type {{ errorCode?: unknown, errorMessage?: unknown }} */ (body);
  const code = typeof errorCode === 'string' || typeof errorCode === 'number' ? String(errorCode) : null;
  const message = typeof errorMessage === 'string' ? errorMessage : '';

  const subcode = authSubcodeOf(message);
  // 뜻을 아는 번호면 뜻을, 모르면 번호를 그대로 — "인증코드 2000" 만으로도 다음 사람이 여기 한 줄 더할 단서가 된다.
  const label = subcode
    ? (AUTH_SUBCODES[subcode] ?? `인증 거부(내부코드 ${subcode} — 아직 뜻을 모른다)`)
    : (LABELS.find(([pattern]) => pattern.test(message))?.[1] ?? null);

  if (!code && !label) return '';
  if (!label) return ` errorCode=${code}`;
  return code ? ` errorCode=${code} (${label})` : ` (${label})`;
}

/**
 * 실패한 응답에서 꼬리표를 뽑는다. 본문을 못 읽어도(HTML 오류 페이지·빈 본문) 던지지 않는다 —
 * 진단을 도우려다 원래 에러를 가리면 안 된다.
 *
 * @param {Response} res
 * @returns {Promise<string>}
 */
export async function naverErrorTail(res) {
  const body = await res.json().catch(() => null);
  return describeNaverError(body);
}

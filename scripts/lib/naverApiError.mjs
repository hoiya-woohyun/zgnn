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

// **401 은 세 갈래다**(2026-09-28 실측, 가짜 헤더로 직접 호출):
//
//     헤더 없음 · 빈 문자열      → "Not Exist Client ID"
//     ID 만 있고 Secret 없음      → "Not Exist Client Secret"
//     둘 다 값이 있으나 인증 거부 → "NID AUTH Result Invalid (1000)"
//
// 그래서 `1000` 은 **"값은 둘 다 갔는데 네이버가 그 조합을 모른다"** 로 좁게 읽어야 한다 —
// 빈 값·헤더 누락·공백으로 날아간 경우는 애초에 다른 문구로 온다. 이 구분이 진단의 절반이다.

/** 인증 결과의 내부 코드 — 실측으로 확인된 것만 뜻을 적는다. 모르는 번호는 번호만 보여 준다(뜻을 지어내지 않는다). */
const AUTH_SUBCODES = {
  1000: '값은 둘 다 전달됐으나 네이버가 이 ID·Secret 조합을 모른다 — 값이 틀렸거나 · 둘이 뒤바뀌었거나 · 개발자센터 키가 아니다',
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

/** 글자 종류만 본다 — 무엇이 들어왔는지가 아니라 **어떤 부류가 들어왔는지**. */
function charsetOf(value) {
  const kinds = [
    [/[a-z]/, '영소'],
    [/[A-Z]/, '영대'],
    [/[0-9]/, '숫자'],
    [/\s/, '공백'],
    [/[^\sa-zA-Z0-9]/, '기호'],
  ];
  const found = kinds.filter(([re]) => re.test(value)).map(([, name]) => name);
  return found.length ? found.join('+') : '없음';
}

/**
 * 보낸 값의 **모양**만 적는다 — 길이와 글자 종류. 값 자체는 어떤 경우에도 나가지 않는다.
 *
 * 왜 필요한가 — 키는 **숨김 입력**이라 사용자가 무엇을 넣었는지 볼 수 없다. 401 이 나도 "내가 뭘 보냈더라" 를
 * 되짚을 방법이 없어서, 흔한 실수(둘을 뒤바꿔 입력 · 다른 시스템의 키)를 눈으로 잡을 수 없다. 이 한 줄이 그 자리를 메운다.
 * 길이·글자 종류는 시크릿이 아니고, 사용자 본인의 터미널에만, **401 일 때만** 찍힌다(05-security).
 *
 * 뒤바뀜 판정은 길이 비교 하나로 한다 — 개발자센터는 Client ID 가 Secret 보다 길다. 정확한 자릿수를 못 박지 않는 이유는
 * 그 값이 바뀔 수 있어서이고, **둘의 대소 관계**는 그보다 오래 간다.
 */
export function describeKeyShape(clientId, clientSecret) {
  const id = String(clientId ?? '');
  const secret = String(clientSecret ?? '');
  const lines = [`보낸 값의 모양 — ID: ${id.length}자(${charsetOf(id)}) · Secret: ${secret.length}자(${charsetOf(secret)}). 값은 찍지 않는다.`];
  if (secret.length > id.length) {
    lines.push('  ⚠️ Secret 이 ID 보다 길다 — 개발자센터는 보통 그 반대다. 둘을 **뒤바꿔 입력**한 것 아닌지 본다.');
  }
  if (/\s/.test(id) || /\s/.test(secret)) {
    lines.push('  ⚠️ 값 가운데에 공백이 있다 — 붙여넣기가 잘린 것일 수 있다(앞뒤 공백은 이미 털었다).');
  }
  return lines.join('\n');
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

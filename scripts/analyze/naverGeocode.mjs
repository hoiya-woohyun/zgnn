// 좌표 보강의 **두 번째 축: 주소 → 좌표**(NCP Maps Geocoding). 첫 축은 이름(`naverLocal.mjs`)이다.
//
// 왜 두 축인가 — 이름 축은 **정규화 후 완전 일치**만 채택한다(동명 가게의 좌표가 실리는 것이 좌표 없는 것보다 나쁘다).
// 그 엄격함의 값은 "지역검색이 이름을 못 맞히면 좌표가 영영 없다" 다. 그런데 추출 스키마에는 `address` 가 이미 있어
// (`extractPlaces.mjs`) 본문에 주소가 적혀 있으면 Claude 가 뽑아 둔다 — **이름이 실패한 후보를 주소가 구제한다**(docs/todo/03).
//
// **왜 이것이 "좌표를 지어내는 것" 이 아닌가**: 도로명주소는 좌표를 유일하게 정한다. 오히려 동명 가게의 좌표를 이름만으로
// 가져오는 쪽이 지어내는 것이고, 그래서 이름 축이 완전 일치만 받는다(→ ADR-008 의 "좌표를 지어내지 않는다").
// 단 그 논리는 **주소가 한 점을 정할 때만** 성립한다 — "제주시 애월읍" 은 읍 전체이고 그것을 좌표로 바꾸면 그게 지어내기다.
// 그 자리를 막는 것이 이 파일의 절반(`addressSpecificity`)이고, 나머지 절반은 응답을 믿지 않는 것이다.
//
// **응답 모양은 조사로 확인했고, 우리 키로는 아직 한 번도 안 불러 봤다**(키가 Claude 세션에 없다 — docs/todo/README 의 ⚠️).
// 2026-09-28 조사(공식 문서 + 제3자 실제 응답 캡처 2건 + 자격증명 없는 라이브 프로브)로 확정된 것:
//  - **x = 경도, y = 위도**, 둘 다 **도(度) 단위 소수 문자열**("126.9810887")이다. 지역검색의 `mapx`/`mapy` 와 달리 10^7 배가 아니다.
//    그런데도 파서를 지역검색과 **공유**한다(`parseNaverCoord`) — 정수가 오면 10^7 로 읽고, 어느 쪽이든 최종 판별은 제주 범위 검사다.
//    스왑이야말로 이 API 의 최대 함정이다: NCP Maps 는 요청·응답 전부 **경도,위도 순**인데 JS SDK 의 `naver.maps.LatLng()` 는 위도,경도 순이다.
//    뒤집으면 (33, 126) 이 경도·위도 자리에 와 제주 범위 밖이라 버려진다.
//  - **`addressElements` 는 9칸이 항상 다 온다.** 없는 성분은 빠지는 게 아니라 `longName: ""` 로 온다. 그래서 "칸이 있다" 는 아무 증거가 아니고
//    **`longName` 이 비지 않았는지**를 봐야 한다. 그래도 필드가 아예 없거나 모양이 다르면 **닫지 말고 입력 주소 판정으로 물러선다**(그리고 센다) —
//    검증 안 된 필드에 대고 fail-closed 하면 보강이 조용히 100% no-op 이 된다(`parseNaverCoord` 가 소수 문자열로 당한 자리).
//  - **REST 는 평평하고, `v2` 로 감싸는 것은 브라우저 SDK 다**(`naver.maps.Service.geocode` → `response.v2`). 온라인 예제 대부분이 SDK 코드라
//    `response.v2.addresses` 를 읽는데 REST 에 그러면 undefined 다. 우리는 평평한 쪽을 읽고, **감싸여 와도 풀어 준다** — 한 줄이고, 틀렸을 때 손해가 크다.
//  - **`errorMessage` 는 200 OK 에도 `""` 로 온다**(문서는 "500 일 때만" 이라 적었지만 실제 캡처 둘 다 갖고 있다). 그래서 **에러 신호로 쓰지 않는다.**
//  - ⚠️ **`totalCount > 0` 은 채택 근거가 아니다** — 실측: "서울특별시 금천구" 가 `status OK · totalCount 1` 로 **구(區) 중심점**을 돌려준다.
//    거칠거나 잘린 주소는 시끄럽게 실패하지 않고 **그럴듯한 쓰레기**를 준다. 이 파일의 `addressSpecificity` + 건물번호 검사가 그 자리를 막는다.
//
// 429·401 을 만나도 **실행을 세우지 않는다** — 이름 축(`analyze-candidates.mjs` 의 `enrichWithNaver`)과 다른 점이고, 이유는 그쪽 주석에 있다.
//
// I/O 는 geocodeAddress 하나뿐이고 fetchImpl 을 주입받아 테스트한다. 키·응답 본문은 로그에 남기지 않는다(docs/todo/05).
import { naverErrorTail } from '../lib/naverApiError.mjs';
import { NAVER_GEOCODE_URL, naverMapsAuthHeaders } from '../lib/naverMapsApi.mjs';
import { distanceMeters, townOf } from './matchPlace.mjs';
import { inJeju, parseNaverCoord, shortenJejuPrefix } from './naverLocal.mjs';

/**
 * 도로명·지번의 **이름** 토큰. 제주 주소는 `…로`·`…길`·`…리`·`…동` 으로 끝난다.
 * `…가`(종로1가)는 넣지 않는다 — 제주에 그런 주소가 없고, 넣으면 "어딘가" 같은 말이 도로명으로 잡힌다.
 * `\d*`·`번길` 은 "상가로1길"·"김녕로2길" 처럼 이름 안에 숫자가 박힌 꼴을 위한 것이다.
 */
const NAME_TOKEN = /[가-힣A-Za-z0-9]+(로|길|리)\d*(번길)?$|^[가-힣]{1,4}\d?[가-힣]?동$/;

/** 건물번호·지번 토큰. "11-15"·"6935"·"산 12" 를 받는다. */
const NUMBER_TOKEN = /^산?\s*\d+(-\d+)?$/;

/**
 * 주소를 토큰으로 쪼갠다. **쉼표도 구분자다** — 도로명주소에 상세주소가 붙는 표준 표기가 "관덕로 8, 2층" 이고
 * `extractPlaces` 는 본문의 주소를 **적힌 그대로** 뽑으므로 그 꼴이 그대로 온다. 공백만 쪼개면 `8,` 이 번호로 안 잡혀
 * 번호가 **있는** 주소가 "번호 없음" 으로 떨어지고, 운영자는 그 계수기를 보고 추출 프롬프트를 고치러 간다 —
 * 첫 실행이 곧 측정인데 측정이 엉뚱한 곳을 가리킨다(리뷰 지적).
 */
function tokensOf(address) {
  return String(address ?? '').trim().split(/[\s,]+/).filter(Boolean);
}

/**
 * 주소가 **한 점을 정하는가**. Geocoding 에 보내기 전에 여기서 막는 것이 이 파일의 핵심 방어다.
 *
 * 왜 범위 검사로는 못 막나 — 거친 주소도 geocode 하면 **정상(status OK · totalCount 1)으로** 행정구역 중심점을 준다
 * (2026-09-28 실측: "서울특별시 금천구" → 구 중심점, 건물번호는 `""`). 그 점은 제주 범위 안이면 `inJeju` 를 통과하고,
 * 그대로 `places.geo` 에 구워지면 지도에 엉뚱한 핀이 찍힌다. datum 함정(docs/todo/03)과 같은 부류 —
 * **박스 검사가 못 보는 종류의 틀림**이다. 같은 엔드포인트를 운영에 쓴 제3자도 같은 결론에 이르러
 * "시도·도로명·건물번호가 일치하는 단일 결과" 만 받는 규칙을 쓴다 — 아래 검사가 그것과 같은 뜻이다.
 *
 * 순서대로 본다: 도로명·지번 이름 → 그 뒤의 번호 → 제주 여부. 번호는 **이름 토큰보다 뒤에** 있어야 한다 —
 * "제주시 1234 애월읍" 같은 조각에 속지 않기 위해서다.
 * 제주 판정은 '제주' 로 시작하거나 제주 12개 읍·면 중 하나를 담고 있으면 통과다(`townOf` 의 닫힌 목록).
 * 도(province)를 생략한 "애월읍 상가로1길 11-15" 를 구제하려는 것이고, 최종 판별은 어차피 좌표 범위 검사가 한다.
 *
 * @param {string} address
 * @returns {'' | 'noRoadOrLotName' | 'noBuildingNumber' | 'notJejuAddress'}  ''(빈 문자열)이면 보낼 만한 주소다
 */
export function addressSpecificity(address) {
  const tokens = tokensOf(address);
  const nameAt = tokens.findIndex((token) => NAME_TOKEN.test(token));
  if (nameAt < 0) return 'noRoadOrLotName';
  if (!tokens.slice(nameAt + 1).some((token) => NUMBER_TOKEN.test(token))) return 'noBuildingNumber';
  const joined = tokens.join(' ');
  if (!joined.startsWith('제주') && townOf(joined) === null) return 'notJejuAddress';
  return '';
}

/** `addressSpecificity` 가 '' 를 주는 주소인가. 호출부에서 읽기 쉽게 감싼 것. */
export function isSpecificAddress(address) {
  return addressSpecificity(address) === '';
}

/**
 * Geocoding 호출. 결과가 없어도(0건) 던지지 않는다 — 그건 정상 응답이다(`pickGeocoded` 가 사유로 센다).
 * 비 2xx 면 status 를 실어 throw. 키는 헤더에만 있고 URL 에 없다.
 *
 * @param {string} address
 * @param {{ clientId: string, clientSecret: string }} keys  NAVER_MAP_CLIENT_ID · NAVER_MAP_CLIENT_SECRET(검색 키가 아니다 — lib/naverMapsApi.mjs)
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<object>} 응답 본문 — { status, meta: { totalCount }, addresses: [...] } 를 기대하지만 검증은 pickGeocoded 가 한다
 */
export async function geocodeAddress(address, { clientId, clientSecret }, fetchImpl = fetch) {
  const url = new URL(NAVER_GEOCODE_URL);
  url.searchParams.set('query', String(address ?? '').trim());

  const res = await fetchImpl(url, {
    // Accept 는 공식 문서가 요구한다. 없어도 JSON 이 오지만(프로브로 확인) 문서가 적은 것을 빼 두면
    // 나중에 HTML 오류 페이지가 와도 우리 잘못인지 알 수 없다.
    headers: { ...naverMapsAuthHeaders(clientId, clientSecret), Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // 주소는 시크릿이 아니지만 메시지에 싣지 않는다 — 실패 로그가 후기 본문에서 읽은 문자열을 남기는 통로가 되지 않게(docs/todo/05).
    // 꼬리표는 검색 쪽과 같은 함수로 뽑는다: 같은 apigw 라 게이트웨이 실패는 `{"error":{"errorCode":…}}` 로 감싸져 온다.
    throw Object.assign(new Error(`네이버 Geocoding 실패: status=${res.status}${await naverErrorTail(res)}`), { status: res.status });
  }
  // ⚠️ 200 인데 본문이 JSON 이 아닌 경우(게이트웨이 안내 페이지·프록시)를 여기서 끊는다.
  // `res.json()` 이 그냥 throw 하게 두면 V8 의 SyntaxError 가 **본문 앞부분을 메시지에 담아** 나가고
  // (`Unexpected token '<', "<!DOCTYPE "...`), 그 메시지가 firstFailure 로 요약 줄까지 간다 — 로그 위생 규칙 위반이다(리뷰 지적).
  const body = await res.json().catch(() => null);
  if (body === null) throw new Error(`네이버 Geocoding 응답이 JSON 이 아니다(status=${res.status}, 본문은 싣지 않는다)`);
  return body;
}

/**
 * 두 번째 축의 탈락 사유 계수기 — **입력 쪽(주소)과 응답 쪽(좌표)을 한 객체에 모은다.**
 * 이름 축의 `newPickReasons` 와 같은 역할이고, 이유도 같다: **첫 실행이 곧 응답 모양의 실측**이라
 * "왜 좌표가 안 붙었는가" 를 구별할 신호가 필요하다.
 *
 * `address*` 넷은 호출 **전에** 떨어진 것이고(쿼터를 쓰지 않았다), 나머지는 호출 **후에** 떨어진 것이다.
 * 이 둘이 갈려 있어야 "주소가 애초에 없어서" 와 "주소는 있었는데 응답이 안 맞아서" 를 구별할 수 있다 —
 * 전자면 고칠 곳은 이 파일이 아니라 추출 프롬프트(`extractPlaces.mjs`)다.
 *
 * `elementsUnknownShape` 는 탈락이 아니라 **경고 카운터**다: `addressElements` 를 못 읽어 입력 주소 판정으로 물러선 횟수.
 * 이 값이 크면 필드 모양이 우리 가정과 다른 것이고, 그때 이 파일의 `hasBuildingNumber` 를 고친다.
 */
export function newGeocodeReasons() {
  return {
    // 호출 전 — 주소가 축에 못 올라간 이유
    addressMissing: 0,
    addressNoRoadOrLotName: 0,
    addressNoBuildingNumber: 0,
    addressNotJeju: 0,
    // 호출 후 — 응답이 채택되지 않은 이유
    statusNotOk: 0,
    noResult: 0,
    addressesFieldMissing: 0,
    notJejuAddress: 0,
    coordUnparsable: 0,
    coordOutOfJeju: 0,
    noBuildingNumber: 0,
    numberNotEchoed: 0,
    ambiguous: 0,
    elementsUnknownShape: 0,
    sample: null,
    firstFailure: null,
  };
}

/** `addressSpecificity` 의 사유 → `newGeocodeReasons` 의 칸. */
const ADDRESS_REASON_KEY = {
  noRoadOrLotName: 'addressNoRoadOrLotName',
  noBuildingNumber: 'addressNoBuildingNumber',
  notJejuAddress: 'addressNotJeju',
};

/**
 * 이 주소로 Geocoding 을 **부를 만한가**. 부르지 않기로 하면 사유를 센다.
 * 호출부(analyze-candidates.mjs)를 얇게 두기 위해 판정과 계수를 여기 모았다 — 테스트도 여기 붙는다.
 * @returns {boolean} true 면 geocodeAddress 를 부른다
 */
export function shouldGeocode(address, reasons = null) {
  const s = String(address ?? '').trim();
  if (s === '') {
    if (reasons) reasons.addressMissing++;
    return false;
  }
  const why = addressSpecificity(s);
  if (why === '') return true;
  if (reasons) reasons[ADDRESS_REASON_KEY[why]]++;
  return false;
}

/**
 * 성분 하나의 종류 목록. **문서가 스스로 모순된다**(2026-09-28 조사, 현행·구 문서 트리 둘 다):
 * 필드 표는 키를 `type`(단수)이라 적고, 같은 문서의 응답 예제는 `"types": ["SIDO"]`(복수·배열)를 찍는다.
 * 제3자 실제 캡처는 `types` 쪽이라 그게 와이어 포맷으로 보이지만, **둘 다 받는다** — 한쪽만 읽으면
 * 틀렸을 때 건물번호 검사가 통째로 "모양을 모른다" 로 떨어져 방어가 사라진다. 문자열 하나로 와도 배열로 감싼다.
 */
function typesOf(element) {
  const raw = element?.types ?? element?.type;
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === 'string');
  return typeof raw === 'string' ? [raw] : null;
}

/**
 * 입력 주소의 **선두 번호**. "11-15" → "11", "6935" → "6935", "산 12" → "12".
 * 하이픈 뒤를 떼는 이유 — 지오코더가 부번을 정규화해 돌려주는 경우(11-15 → 11)에 헛되게 탈락시키지 않으려는 것이다.
 */
function leadingNumbersOf(address) {
  const tokens = tokensOf(address);
  const found = [];
  for (const token of tokens) {
    if (!NUMBER_TOKEN.test(token)) continue;
    const digits = /\d+/.exec(token);
    if (digits) found.push(digits[0]);
  }
  return found;
}

/**
 * **돌아온 주소가 내가 물어본 번호를 되울렸는가.** `addressElements` 를 전혀 보지 않는 **독립 가드**다.
 *
 * 왜 따로 필요한가 — 중심점 함정의 유일한 확실한 신호이면서, 문서의 `type`/`types` 자기모순을 **살아서 넘는다.**
 * `hasBuildingNumber` 가 모양을 못 읽어 `null` 을 주면 우리는 (일부러) 채택 쪽으로 물러서는데, 그 길로 중심점이 새면
 * 두 겹 방어가 한 겹이 된다. 이 검사는 필드 이름에 걸리지 않으므로 그때도 살아 있다.
 * 실측된 함정: "서울특별시 금천구" 를 물으면 `status OK · totalCount 1` 로 **입력을 그대로 되울린** 주소와 구 중심점 좌표가 온다 —
 * 되울린 문자열에는 **숫자가 없다.** 그래서 번호 하나만 요구해도 중심점 전체가 걸린다.
 *
 * ⚠️ **토큰 단위로 본다.** 처음엔 숫자 경계(`(?<!\\d)N(?!\\d)`)로만 봤고 "돌아온 주소가 이미 구체적이라 해가 없다" 고 적었는데,
 * **그 변명이 틀린 경우가 정확히 막아야 할 경우였다**(리뷰가 재현): `김녕로2길 2` 를 물으면 지오코더가 **도로 중심점**
 * `김녕로2길`(건물번호 없음)을 줄 수 있고, 그때 물어본 "2" 가 **도로명 안의 "2"** 에 걸려 통과한다.
 * 제주 도로명은 숫자가 박힌 것이 예외가 아니라 흔하다(`김녕로1길`·`김녕로2길`·`상가로1길` — 실측 표 5행 중 3행).
 * 그래서 **번호 토큰 자체**가 물어본 번호를 담고 있어야 한다 — `김녕로2길` 은 번호 토큰이 아니라 그냥 탈락한다.
 */
function echoesNumber(returnedText, inputNumbers) {
  if (inputNumbers.length === 0) return false; // 물어본 번호가 없으면 대조할 수 없다 → 채택하지 않는다(아래 pickGeocoded 주석)
  const tokens = tokensOf(returnedText);
  return inputNumbers.some((n) => tokens.some((t) => NUMBER_TOKEN.test(t) && /\d+/.exec(t)[0] === n));
}

/** addressElements 에서 건물번호·지번을 찾는다. 모양을 못 읽으면 null — "없다"(false)와 구별해야 한다(호출부가 갈라 센다). */
function hasBuildingNumber(addressElements) {
  if (!Array.isArray(addressElements) || addressElements.length === 0) return null;
  let sawTypes = false;
  for (const element of addressElements) {
    const types = typesOf(element);
    if (types === null || types.length === 0) continue;
    sawTypes = true;
    if (!types.some((t) => t === 'BUILDING_NUMBER' || t === 'LAND_NUMBER')) continue;
    // ⚠️ 9칸이 항상 다 오고 없는 성분은 longName 이 '' 다 — **칸이 있다는 것은 아무 증거가 아니다.**
    // 그리고 첫 빈 칸에서 포기하면 안 된다: 지번 주소는 BUILDING_NUMBER 가 비고 LAND_NUMBER 만 찬다.
    // `||` 다(`??` 가 아니다) — 없는 성분이 `longName: ''` 로 오는 API 라서, `??` 면 빈 문자열을 값으로 보고 shortName 으로 못 물러선다.
    const value = String(element?.longName || element?.shortName || '').trim();
    if (value !== '') return true;
  }
  // 종류를 하나도 못 읽었으면 모양이 다른 것이다(null). 읽혔고 건물번호만 없으면 그건 진짜 "없다"(false) — 행정구역으로 풀린 것이다.
  return sawTypes ? false : null;
}

/**
 * 같은 주소가 푼 점들이 이보다 멀면 "모르는 것" 으로 본다. `matchPlace` 의 `GEO_NEAR_M`(100m)과 같은 값이어야 한다 —
 * 그 거리가 병합 판정을 가르는 경계라서다. 상수를 import 하지 않고 여기 적는 이유는 뜻이 다르기 때문이다(거리 가점 vs 모호성).
 */
const AMBIGUOUS_M = 100;

/**
 * 진단 표본 한 건. **값이 아니라 모양**을 남긴다 — 좌표의 자릿수·타입과, `addressElements` 의 **실제 키 이름**이다.
 * 후자가 문서 자기모순(`type` 표 vs `types` 예제)을 한 줄로 닫는다. 좌표는 비밀이 아니고 주소는 싣지 않는다.
 */
function sampleOf(entry) {
  const element = Array.isArray(entry?.addressElements) ? entry.addressElements[0] : null;
  return {
    x: entry?.x,
    y: entry?.y,
    xType: typeof entry?.x,
    elementKeys: element && typeof element === 'object' ? Object.keys(element).join('|') : null,
  };
}

/**
 * 응답 → 좌표 하나. 없으면 null — **좌표를 지어내지 않는다**.
 *
 * 채택 조건 넷: 제주 주소 · 좌표가 제주 범위 · 건물번호(또는 지번)가 있음 · 후보가 여럿이면 서로 100m 안.
 * 마지막 조건(ambiguous)이 왜 있나 — `matchPlace` 의 `GEO_NEAR_M` 이 100m 라 그만큼 떨어진 두 점은 **판정을 가른다**.
 * 주소 하나가 멀리 떨어진 여러 점으로 풀리면 어느 쪽인지 우리가 모르는 것이라 아무것도 쓰지 않는다.
 *
 * @param {object} rawBody  geocodeAddress 의 반환값
 * @param {{ address: string }} asked  우리가 물어본 주소 — 되울림 검사(echoesNumber)에 쓴다. **필수다**:
 *   기본값을 두면 호출부가 빠뜨렸을 때 가드가 조용히 꺼지고, 그 상태로도 테스트가 다 통과한다(리뷰 지적).
 *   번호가 없는 주소를 물었으면 대조할 것이 없어 **채택하지 않는다** — 거기까지 오면 `addressSpecificity` 가 먼저 막았어야 한다.
 * @param {ReturnType<typeof newGeocodeReasons> | null} [reasons]
 * @returns {{ lat: number, lng: number, address: string } | null}
 */
export function pickGeocoded(rawBody, { address: asked }, reasons = null) {
  // REST 는 평평하게 주고 브라우저 SDK 만 `v2` 로 감싼다(머리 주석). 감싸여 와도 풀어 주는 이유는 한쪽을 골라 틀렸을 때의 손해가
  // 비대칭이기 때문이다 — 평평한 걸 `v2` 로 읽으면 전 건 no-op 이고, 감싸인 걸 평평하게 읽어도 전 건 no-op 이다. 둘 다 받는다.
  const body = rawBody?.v2 && typeof rawBody.v2 === 'object' ? rawBody.v2 : rawBody;

  // status 는 'OK' 를 기대하지만 **없어도 통과시킨다** — 필드 이름이 다를 수 있고, 진짜 판별은 아래 좌표 검사다.
  // 'OK' 가 아닌 값이 명시적으로 왔을 때만 탈락(ERROR·INVALID_REQUEST·SYSTEM_ERROR).
  const status = body?.status;
  if (typeof status === 'string' && status !== 'OK') {
    if (reasons) reasons.statusNotOk++;
    return null;
  }

  // **"빈 배열이 왔다" 와 "addresses 필드가 없다" 를 갈라 센다.** 둘을 섞으면 첫 실행이 무엇을 측정했는지 알 수 없다 —
  // 전자는 "그 주소를 모른다"(정상), 후자는 **응답 모양이 우리 가정과 다르다**(코드를 고칠 일)다.
  if (!Array.isArray(body?.addresses)) {
    if (reasons) reasons.addressesFieldMissing++;
    return null;
  }
  const addresses = body.addresses;
  if (addresses.length === 0) {
    if (reasons) reasons.noResult++;
    return null;
  }

  const askedNumbers = leadingNumbersOf(asked);
  const picks = [];
  for (const entry of addresses) {
    const road = String(entry?.roadAddress ?? '').trim();
    const jibun = String(entry?.jibunAddress ?? '').trim();
    const address = road || jibun;
    if (!address.startsWith('제주')) {
      if (reasons) reasons.notJejuAddress++;
      continue;
    }
    // ⚠️ x=경도 · y=위도. 지역검색의 mapx/mapy 와 같은 스왑 함정이고, 뒤집으면 범위 검사가 잡는다.
    const lat = parseNaverCoord(entry?.y);
    const lng = parseNaverCoord(entry?.x);
    if (!inJeju(lat, lng)) {
      if (reasons) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) reasons.coordUnparsable++;
        else reasons.coordOutOfJeju++;
        if (reasons.sample === null) reasons.sample = sampleOf(entry);
      }
      continue;
    }
    // 되울림 검사는 **도로명·지번 둘 다**에 대고 본다 — 지번으로 물었는데 roadAddress 만 정규화돼 오는 경우가 있다.
    if (!echoesNumber(`${road} ${jibun}`, askedNumbers)) {
      if (reasons) {
        reasons.numberNotEchoed++;
        if (reasons.sample === null) reasons.sample = sampleOf(entry);
      }
      continue;
    }
    const numbered = hasBuildingNumber(entry?.addressElements);
    if (numbered === false) {
      // 응답이 "건물번호 없음" 이라고 말한다 — 행정구역 단위로 풀린 것이다. 입력 판정을 통과했어도 여기서 막는다.
      if (reasons) {
        reasons.noBuildingNumber++;
        // 전 건이 여기서 떨어지면 `채택 0건` 진단이 표본 없이 끝난다 — 첫 실행을 해석 가능하게 만드는 바로 그 줄이다(리뷰 지적).
        if (reasons.sample === null) reasons.sample = sampleOf(entry);
      }
      continue;
    }
    if (numbered === null && reasons) {
      reasons.elementsUnknownShape++;
      // 모양을 못 읽었으면 **무엇이 왔는지**를 한 번 남긴다 — 문서 모순(type/types)이 이 한 줄로 닫힌다.
      if (reasons.sample === null) reasons.sample = sampleOf(entry);
    }
    picks.push({ lat, lng, address: shortenJejuPrefix(address) });
  }

  if (picks.length === 0) return null;
  const first = picks[0];
  // 여럿이면 전부 첫 점과 가까운지 본다. 하나라도 멀면 주소가 한 점을 정하지 못한 것이다.
  // **쌍마다** 본다. 첫 점 기준으로만 재면(별 모양) 90m·90m 지만 서로 180m 인 세 점이 통과한다 —
  // 문서가 약속한 것은 "서로 100m 넘게 떨어지면 안 쓴다" 다(리뷰 지적).
  if (picks.some((a) => picks.some((b) => distanceMeters(a, b) > AMBIGUOUS_M))) {
    if (reasons) reasons.ambiguous++;
    return null;
  }
  return first;
}

/**
 * 요약 한 줄 — 이름 축의 "좌표 보강:" 줄과 나란히 찍힌다. 첫 실행의 판정표는 docs/todo/README.md 의 ⚠️ 절에 있다.
 *
 * 읽는 법: `기회` 는 이름 축이 **찾아보고** 좌표를 못 붙인 후보 수(= 이 축이 구제할 대상)다. 검색 키가 없으면 이름 축이
 * 아무것도 보지 않았으므로 여기 안 들어온다.
 * ⚠️ **"호출 후 탈락" 은 호출 수와 안 맞는다.** 응답 하나에 결과가 여럿이라(기본 10) `제주밖주소`·`좌표*`·`번호안되울림`·`건물번호없음` 은
 * **결과마다**, `결과없음`·`addresses 필드없음`·`status 이상`·`여러점` 은 **호출마다** 센다. 이름 축(`newPickReasons`)과 같은 관례다. 그중 `호출` 까지 간 것과,
 * 가지 못한 것(`주소 없음`·`주소가 한 점을 못 정함`)이 갈려 있다. **`주소 없음` 이 대부분이면 고칠 곳은 이 축이 아니라
 * 추출 프롬프트**다 — 본문에 주소가 있는데 못 뽑은 것인지 원래 없는 것인지는 후기 몇 개를 열어 봐야 갈린다.
 *
 * @param {{ chance: number, tried: number, picked: number, failed: number }} stats
 * @param {ReturnType<typeof newGeocodeReasons>} reasons
 */
export function formatGeocodeSummary(stats, reasons) {
  const r = reasons;
  const vague = r.addressNoRoadOrLotName + r.addressNoBuildingNumber + r.addressNotJeju;
  const lines = [
    `주소→좌표(Geocoding): 기회 ${stats.chance} · 호출 ${stats.tried} · 채택 ${stats.picked} · 요청실패 ${stats.failed}`,
    `  호출 전 탈락 — 주소 없음 ${r.addressMissing} · 한 점을 못 정하는 주소 ${vague}` +
      `(도로명·지번 이름 없음 ${r.addressNoRoadOrLotName} · 번호 없음 ${r.addressNoBuildingNumber} · 제주 아님 ${r.addressNotJeju})`,
    `  호출 후 탈락 — 결과없음 ${r.noResult} · addresses 필드없음 ${r.addressesFieldMissing} · status 이상 ${r.statusNotOk} · 제주밖주소 ${r.notJejuAddress} · ` +
      `좌표파싱실패 ${r.coordUnparsable} · 좌표제주밖 ${r.coordOutOfJeju} · 번호안되울림 ${r.numberNotEchoed} · 건물번호없음 ${r.noBuildingNumber} · 여러점 ${r.ambiguous}`,
  ];
  if (r.elementsUnknownShape > 0) {
    lines.push(
      `  ⚠️ addressElements 를 못 읽어 되울림 검사만으로 채택한 건수 ${r.elementsUnknownShape} — ` +
        '필드 모양이 가정과 다르다. 아래 표본의 elementKeys 를 보고 naverGeocode.mjs 의 typesOf 를 고친다.',
    );
  }
  /*
   * **전 건이 throw 한 실행을 진단할 수 있어야 한다.** 좌표 파싱까지 못 갔으면 `sample` 이 비어 있어서,
   * 이 줄이 없으면 `호출 N · 채택 0 · 요청실패 N` 만 남는다 — 레포가 스스로 경고한 "판정 불가에 속지 말 것" 그 자리다.
   * `apiHubCode=400`(콘솔에서 Geocoding 미체크)과 `401 (…거부)`(키가 틀렸거나 계통이 다르다)는 **조치가 완전히 다르다.**
   */
  if (r.firstFailure) lines.push(`  ⚠️ 첫 요청실패: ${r.firstFailure}`);
  if (stats.tried > 0 && stats.picked === 0 && r.sample) {
    lines.push(
      `  ⚠️ 채택 0건이다. 응답 표본 x=${r.sample.x}(${r.sample.xType}) y=${r.sample.y}` +
        (r.sample.elementKeys ? ` · addressElements[0] 의 키: ${r.sample.elementKeys}` : ' · addressElements 를 못 읽었다') +
        ' — x 가 경도(126.x)·y 가 위도(33.x) 인 소수인지 본다. 10자리 정수면 지역검색과 같은 10^7 포맷이다.',
    );
  }
  return lines.join('\n');
}

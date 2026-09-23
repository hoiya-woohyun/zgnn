/**
 * 네이버 지도 SDK(NCP Maps JavaScript API v3) 로더.
 *
 * SDK 는 npm 패키지가 아니라 `oapi.map.naver.com` 이 내려주는 스크립트 한 장이다.
 * 이 앱은 정적 내보내기라 서버에서 심을 자리가 없어, 지도 화면이 뜰 때 직접 붙인다.
 *
 * Kakao 와 다른 점 셋 —
 *  1. `autoload=false` + `kakao.maps.load(cb)` 같은 초기화 경합이 **없다.** 서브모듈
 *     (`&submodules=geocoder` 등)을 안 쓰면 스크립트 load 시점에 `naver.maps` 가 이미 서 있다.
 *     서브모듈을 쓰게 되면 그때는 `&callback=fn` 이 필요하다 — 지금은 안 쓴다.
 *  2. 인증 실패를 **알려 준다**(`window.navermap_authFailure`). Kakao 는 통로가 없어 지도 자리가
 *     조용히 비었다. 아래 `notifyAuthFailure` 가 그걸 받아 화면의 폴백으로 넘긴다.
 *  3. 지도를 띄울 때 SDK 가 `oapi.map.naver.com/v3/auth?…&time=…&callback=…` 을 **런타임에** 부른다.
 *     `time` 이 매번 달라 URL 로 캐시할 수 없다 — 오프라인 동작은 이 호출의 실패를 SDK 가 어떻게
 *     다루느냐에 달려 있고, 아직 실측하지 않았다(docs/todo/naver-migration-research.md §3).
 *
 * ── 출처 등록 (이걸 안 하면 코드가 맞아도 지도가 안 뜬다)
 * 클라이언트 아이디는 **출처(origin) 제한**으로 보호된다. NCP 콘솔의
 * Application → Maps → Web 서비스 URL 에 쓰는 주소를 등록해야 한다.
 * 콘솔에서 **Dynamic Map 이 체크돼 있어야 한다** — 아니면 429(Quota Exceed)가 난다.
 */

/**
 * 키를 코드가 아니라 env 로 받는 이유.
 *
 * Kakao JS 키는 기본값을 코드에 뒀다(ADR-008) — 키가 없으면 지도가 **조용히** 죽어서였다.
 * 네이버는 그 이유가 약해졌다: 키가 없거나 틀리면 아래에서 **문구가 있는 거부**로 떨어지고,
 * 화면은 "지도는 인터넷이 필요해요" 안내를 그린다. 조용한 실패가 아니다.
 *
 * `process.env.NEXT_PUBLIC_*` 는 Next 가 빌드 때 문자열로 바꿔 넣는다. `process.env` 를
 * 통째로 넘기거나 키 이름을 변수로 만들면 값이 사라지므로 이 형태 그대로 둘 것.
 *
 * 이름에 `NEXT_PUBLIC_` 이 붙은 것이 곧 "이 값은 공개 전제" 라는 표시다 — 검색 API 의
 * `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(시크릿, 저장 금지)과 **다른 값**이다(ADR-016).
 */
const KEY_ID = process.env.NEXT_PUBLIC_NAVER_MAP_KEY_ID || '';

const SDK_SRC = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${KEY_ID}`;

/** 로더가 이미 붙인 스크립트를 다시 찾기 위한 표식. */
const SCRIPT_ID = 'naver-maps-sdk';

/**
 * 한 번 시작한 로딩은 결과를 재사용한다.
 *
 * 지도 화면은 라우팅으로 들락거리고 개발 중에는 HMR 로도 다시 마운트된다.
 * 그때마다 스크립트를 새로 붙이면 SDK 가 전역을 두 번 초기화한다.
 */
let pending: Promise<typeof naver.maps> | null = null;

/**
 * 인증 실패 구독자.
 *
 * 실패는 스크립트 load 보다 **늦게** 온다 — SDK 가 지도를 만들 때 `/v3/auth` 를 부르고
 * 그 응답을 보고 판정하기 때문이다. 그래서 로더의 promise 가 이미 resolve 된 뒤에 올 수 있고,
 * 그때는 거부가 아니라 구독자에게 알리는 수밖에 없다.
 */
const authFailureListeners = new Set<() => void>();
let authFailed = false;

/**
 * 인증 실패를 구독한다. 이미 실패한 뒤에 구독하면 즉시 한 번 불린다.
 * @returns 구독 해제 함수
 */
export function onNaverMapsAuthFailure(listener: () => void): () => void {
  if (authFailed) {
    listener();
    return () => {};
  }
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

function notifyAuthFailure() {
  authFailed = true;
  // 다음 시도가 새 스크립트로 처음부터 가도록 캐시를 비운다.
  pending = null;
  for (const listener of authFailureListeners) listener();
}

/**
 * SDK 를 받아 `naver.maps` 를 돌려준다.
 *
 * 실패(오프라인 · 출처 미등록 · 스크립트 차단 · 키 없음)는 reject 로 알린다 — 지도 화면이
 * 그 거부를 받아 "지도는 인터넷이 필요해요" 안내를 대신 그린다.
 */
export function loadNaverMaps(): Promise<typeof naver.maps> {
  /*
   * 인증이 한 번 거부됐으면 다시 시도하지 않고 바로 거부한다.
   *
   * 이 줄이 없으면 이렇게 깨진다 — 실패 뒤 `/map` 을 다시 열면 구독자가 **동기로** 불려
   * 화면이 'error' 가 되는데, 스크립트 자체는 이미 로드돼 있어서(거부된 건 인증뿐이다)
   * 아래 `window.naver?.maps?.Map` 분기가 resolve 해 버린다. 그 then 이 마이크로태스크에서
   * 'ready' 로 덮어써, 타일이 안 깔린 빈 지도가 폴백 없이 남는다.
   *
   * `authFailed` 는 일부러 sticky 다. 이걸 되돌리게 바꾼다면 아래 이른 resolve 분기가
   * `window.navermap_authFailure` 를 다시 걸지 않는다는 점도 함께 손봐야 한다.
   */
  if (authFailed) {
    return Promise.reject(
      new Error('네이버 지도 인증에 실패했어요 — 클라이언트 아이디와 등록된 웹 서비스 URL 을 확인해 주세요.'),
    );
  }
  if (pending) return pending;

  pending = new Promise<typeof naver.maps>((resolve, reject) => {
    // SSR 로는 못 온다(지도 화면이 ssr:false 로 붙는다) — 그래도 방어해 둔다.
    if (typeof window === 'undefined') {
      reject(new Error('네이버 지도는 브라우저에서만 불러올 수 있어요.'));
      return;
    }

    if (!KEY_ID) {
      // 조용히 빈 지도를 두지 않는다. 새로 clone 한 곳에서 원인을 바로 알 수 있게.
      reject(new Error('NEXT_PUBLIC_NAVER_MAP_KEY_ID 가 비어 있어요 — NCP 콘솔의 클라이언트 아이디가 필요해요.'));
      return;
    }

    // 이미 초기화까지 끝난 뒤의 재요청.
    if (window.naver?.maps?.Map) {
      resolve(window.naver.maps);
      return;
    }

    /*
     * 인증 실패 전역 콜백. SDK 가 이 이름을 그대로 찾으므로 바꿀 수 없다.
     * 아직 resolve 전이면 거부로, 이미 resolve 됐으면 구독자에게 알린다.
     */
    let settled = false;
    window.navermap_authFailure = () => {
      notifyAuthFailure();
      if (!settled) {
        settled = true;
        reject(new Error('네이버 지도 인증에 실패했어요 — 클라이언트 아이디와 등록된 웹 서비스 URL 을 확인해 주세요.'));
      }
    };

    const onReady = () => {
      const maps = window.naver?.maps;
      if (!maps) {
        if (!settled) {
          settled = true;
          reject(new Error('네이버 지도 SDK 를 읽었지만 초기화되지 않았어요.'));
        }
        return;
      }
      if (settled) return;
      settled = true;
      resolve(maps);
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', onReady, { once: true });
    script.addEventListener(
      'error',
      () => {
        // 다음 시도가 새 스크립트로 처음부터 가도록 캐시와 DOM 을 함께 비운다.
        pending = null;
        script.remove();
        if (settled) return;
        settled = true;
        reject(new Error('네이버 지도 SDK 를 불러오지 못했어요.'));
      },
      { once: true },
    );

    if (!existing) {
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = SDK_SRC;
      document.head.appendChild(script);
    }
  });

  return pending;
}

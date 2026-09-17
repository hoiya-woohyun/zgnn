/**
 * Kakao 지도 SDK 로더.
 *
 * SDK 는 npm 패키지가 아니라 `dapi.kakao.com` 이 내려주는 스크립트 한 장이다.
 * 이 앱은 정적 내보내기라 서버에서 심을 자리가 없어, 지도 화면이 뜰 때 직접 붙인다.
 *
 * `autoload=false` 를 붙이는 이유: 기본값이면 스크립트가 읽히는 즉시 스스로 초기화를
 * 시작하고, 그게 끝나기 전에 `kakao.maps.Map` 을 만지면 터진다. false 로 두고
 * `kakao.maps.load(cb)` 의 콜백에서 지도를 만들면 그 경합이 사라진다.
 *
 * ── 도메인 등록 (이걸 안 하면 코드가 맞아도 지도가 안 뜬다)
 * JS 키는 **출처(origin) 제한**으로 보호된다. Kakao Developers 콘솔의
 * 내 애플리케이션 → 플랫폼 → Web 에 쓰는 주소를 등록해야 한다.
 *   - 개발: http://localhost:7727  (3000 이 아니다 — README 「실행」의 포트 항목 참고)
 *   - 배포: 실제 도메인 (아직 미정 — 정해지면 추가할 것)
 * 등록 전에는 SDK 가 인증 오류를 내고 지도 자리가 비어 보인다.
 */

/**
 * 키를 코드에 두는 이유.
 *
 * Kakao JS 키는 애초에 공개되는 값이다 — 어디에 두든 빌드 결과물의 JS 안에 문자열로
 * 남고, 실제 보호는 위의 출처 허용 목록이 한다. 반면 `.env.local` 은 gitignore 대상이라
 * 거기에만 두면 새로 clone 한 곳에서 지도가 **조용히** 죽는다(CARTO 때와 달리 키가 없을 때
 * 쓸 대체 타일이 없다). 그래서 기본값을 코드에 두고, 키를 갈아야 할 때만
 * `.env.local` 의 `NEXT_PUBLIC_KAKAO_MAP_KEY` 로 덮어쓴다.
 *
 * `process.env.NEXT_PUBLIC_*` 는 Next 가 빌드 때 문자열로 바꿔 넣는다. `process.env` 를
 * 통째로 넘기거나 키 이름을 변수로 만들면 값이 사라지므로 이 형태 그대로 둘 것.
 */
const APP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY || 'a13d460af33fa9ffd282aeabbc5e59cf';

const SDK_SRC = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${APP_KEY}&autoload=false`;

/** 로더가 이미 붙인 스크립트를 다시 찾기 위한 표식. */
const SCRIPT_ID = 'kakao-maps-sdk';

/**
 * 한 번 시작한 로딩은 결과를 재사용한다.
 *
 * 지도 화면은 라우팅으로 들락거리고 개발 중에는 HMR 로도 다시 마운트된다.
 * 그때마다 스크립트를 새로 붙이면 SDK 가 전역을 두 번 초기화한다.
 */
let pending: Promise<typeof kakao.maps> | null = null;

/**
 * SDK 를 받아 `kakao.maps` 를 돌려준다.
 *
 * 실패(오프라인 · 도메인 미등록 · 스크립트 차단)는 reject 로 알린다 — 지도 화면이
 * 그 거부를 받아 "지도는 인터넷이 필요해요" 안내를 대신 그린다.
 */
export function loadKakaoMaps(): Promise<typeof kakao.maps> {
  if (pending) return pending;

  pending = new Promise<typeof kakao.maps>((resolve, reject) => {
    // SSR 로는 못 온다(지도 화면이 ssr:false 로 붙는다) — 그래도 방어해 둔다.
    if (typeof window === 'undefined') {
      reject(new Error('Kakao 지도는 브라우저에서만 불러올 수 있어요.'));
      return;
    }

    // 이미 초기화까지 끝난 뒤의 재요청.
    if (window.kakao?.maps?.Map) {
      resolve(window.kakao.maps);
      return;
    }

    const onReady = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        reject(new Error('Kakao 지도 SDK 를 읽었지만 초기화되지 않았어요.'));
        return;
      }
      // autoload=false 라 여기서 한 번 더 초기화를 기다린다.
      maps.load(() => resolve(maps));
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
        reject(new Error('Kakao 지도 SDK 를 불러오지 못했어요.'));
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

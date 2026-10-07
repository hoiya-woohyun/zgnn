/**
 * 홈 하단 설치 안내(07 U9)를 띄울지, 띄우면 어떤 길을 알려 줄지.
 *
 * 오프라인(제주 산간·비행기 모드)이 이 앱의 약속인데, 그 약속은 홈 화면에 추가해야 쓸 만해진다. 그런데 설치를 권하는
 * 곳이 없었다(리뷰 2026-09-29 U9). 길은 둘뿐이다 — 브라우저가 설치 창을 열어 주는 곳(Android Chrome·데스크톱 Chrome/Edge 의
 * `beforeinstallprompt`)과, 사용자가 방법을 알아야 하는 iOS(공유 → 홈 화면에 추가).
 *
 * 셋째 길은 **인앱 브라우저**다(07 U9 후속). 카톡·네이버·인스타 웹뷰에는 "홈 화면에 추가" 메뉴 자체가 없고, 저장소도 Safari·홈 화면 앱과
 * 따로라 설치·오프라인을 못 쓴다. 카톡 공유로 들어오는 길이 가장 흔해서, 설치를 권하는 대신 **바깥 브라우저로 여는 길**을 알린다 —
 * 카카오톡은 그 주소(`kakaotalk://web/openExternal`)가 있어 한 번에, 나머지는 메뉴 안내.
 *
 * **그 밖에서는 아무 말도 하지 않는다.** 구체적으로 무엇을 누르라고 말할 수 없는 안내는 조르기만 한다 —
 * 설치 신호가 없는 Android 는 **이미 설치한** 사람일 가능성이 크다(Chrome 은 설치된 앱에 신호를 주지 않는다).
 */

export type TInstallGuide = 'none' | 'prompt' | 'ios' | 'inApp';

export type TInstallGuideInput = {
  /** 이 기기에서 앱을 연 횟수(스토어 `visitCount`). 첫 방문엔 권하지 않는다 — 인사·등록이 먼저다. */
  visitCount: number;
  /** 이미 홈 화면 앱으로 열려 있나(`display-mode: standalone` · iOS `navigator.standalone`). */
  standalone: boolean;
  /** 브라우저가 준 설치 신호(`beforeinstallprompt`)를 쥐고 있나. */
  canPrompt: boolean;
  userAgent: string;
  /** iPadOS 13+ Safari 는 UA 가 `Macintosh` 라 터치 지점 수로만 Mac 과 갈린다. */
  maxTouchPoints: number;
};

/** 메뉴에 "홈 화면에 추가" 가 없는 인앱 브라우저 — 카카오톡·네이버 앱·인스타그램·페이스북·라인. */
const IN_APP_BROWSER = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i;

/** 인앱 브라우저인가. 그 웹뷰의 저장소는 Safari·홈 화면 앱과 **따로**라 저장 목록 공유 담기(`savedPageShared`)도 이걸 본다. */
export const isInAppBrowser = (userAgent: string): boolean => IN_APP_BROWSER.test(userAgent);

/**
 * 인앱 웹뷰에서 바깥 브라우저로 이 주소를 여는 링크. 카카오톡만 있다 — 다른 앱엔 그런 주소가 없어 null(메뉴로 안내한다).
 * 카카오톡이 여는 것은 기기의 기본 브라우저다(iOS 는 Safari, Android 는 Chrome 이 보통).
 */
export const openExternalUrl = (userAgent: string, href: string): string | null =>
  /KAKAOTALK/i.test(userAgent) ? `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}` : null;

export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function installGuideKind(input: TInstallGuideInput): TInstallGuide {
  if (input.visitCount < 2 || input.standalone) return 'none';
  if (isInAppBrowser(input.userAgent)) return 'inApp';
  if (input.canPrompt) return 'prompt';
  if (isIOSDevice(input.userAgent, input.maxTouchPoints)) return 'ios';
  return 'none';
}

// 평가자 공용 — 브라우저 컨텍스트는 반드시 이 함수로 만든다.
//
// 1. 주소창은 http://localhost:7727 그대로다(네이버 지도 인증이 이 출처만 받는다).
//    그러나 7727 로 가는 요청은 전부 이 회차의 깨끗한 정적 빌드(7728)가 답한다 —
//    7727 에는 다른 작업 중인 개발 서버가 떠 있어 그쪽을 보면 안 된다.
// 2. 서버로 보내는 쓰기(제보·다녀왔어요 등)는 실제로 전송되지 않고 '성공' 으로 응답된다.
//    마음 놓고 끝까지 눌러 봐도 된다.
// 3. 서비스워커는 끈다(오프라인 동작은 이번 평가 범위 밖).
import { existsSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const APP = 'http://localhost:7727';
const REAL = 'http://localhost:7728';

/**
 * @param {{ device?: string, desktop?: boolean, headless?: boolean }} [opts]
 *   device: Playwright devices 이름(예: 'iPhone 13', 'Pixel 7', 'iPhone SE', 'iPhone 13 Pro Max')
 *   desktop: true 면 1280×800 데스크톱(device 무시)
 * @returns {Promise<{ browser: import('playwright').Browser, context: import('playwright').BrowserContext, page: import('playwright').Page, APP: string }>}
 */
export async function openApp({ device = 'iPhone 13', desktop = false, headless = true, statePath } = {}) {
  // statePath: 스크립트를 여러 번 나눠 돌릴 때 localStorage 를 이어 가려면 같은 경로를 넘기고,
  // 끝에서 `await context.storageState({ path: statePath })` 로 저장한다. 파일이 없으면 새 사용자로 시작한다.
  const browser = await chromium.launch({ headless });
  const base = desktop
    ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
    : { ...devices[device], hasTouch: true };
  if (!desktop && !devices[device]) throw new Error(`알 수 없는 기기: ${device}`);
  const context = await browser.newContext({
    ...base,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    serviceWorkers: 'block',
    ...(statePath && existsSync(statePath) ? { storageState: statePath } : {}),
  });

  await context.route(`${APP}/**`, async (route) => {
    const req = route.request();
    try {
      const response = await route.fetch({ url: req.url().replace(APP, REAL), maxRedirects: 5 });
      await route.fulfill({ response });
    } catch {
      await route.abort('connectionfailed');
    }
  });

  await context.route(/https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.continue();
    return route.fulfill({ status: 201, headers: cors, body: '' });
  });

  const page = await context.newPage();
  return { browser, context, page, APP };
}

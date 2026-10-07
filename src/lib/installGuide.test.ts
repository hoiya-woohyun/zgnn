import { describe, expect, it } from 'vitest';
import { installGuideKind, type TInstallGuideInput } from './installGuide';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

const base: TInstallGuideInput = {
  visitCount: 2,
  standalone: false,
  canPrompt: false,
  userAgent: IPHONE,
  maxTouchPoints: 5,
};

describe('installGuideKind (07 U9)', () => {
  it('첫 방문(과 읽기 전 0)에는 권하지 않는다', () => {
    expect(installGuideKind({ ...base, visitCount: 0 })).toBe('none');
    expect(installGuideKind({ ...base, visitCount: 1 })).toBe('none');
    expect(installGuideKind({ ...base, visitCount: 2 })).toBe('ios');
  });

  it('이미 홈 화면 앱으로 열려 있으면 권하지 않는다', () => {
    expect(installGuideKind({ ...base, standalone: true })).toBe('none');
    expect(installGuideKind({ ...base, userAgent: ANDROID_CHROME, canPrompt: true, standalone: true })).toBe('none');
  });

  it('설치 신호가 있으면 설치 창을 연다', () => {
    expect(installGuideKind({ ...base, userAgent: ANDROID_CHROME, maxTouchPoints: 5, canPrompt: true })).toBe('prompt');
  });

  it('iPhone 과 iPadOS(UA 가 Macintosh) 는 공유 → 홈 화면에 추가를 알린다', () => {
    expect(installGuideKind(base)).toBe('ios');
    expect(installGuideKind({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).toBe('ios');
  });

  it('터치 없는 Mac 은 iPad 가 아니다', () => {
    expect(installGuideKind({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 })).toBe('none');
  });

  it('설치 신호 없는 Android 는 이미 설치했을 가능성이 커 조르지 않는다', () => {
    expect(installGuideKind({ ...base, userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe('none');
  });

  it.each([
    ['카카오톡', `${IPHONE} KAKAOTALK 10.8.0`],
    ['네이버 앱', `${IPHONE} NAVER(inapp; search; 2000; 12.8.0)`],
    ['인스타그램', `${IPHONE} Instagram 350.0.0.0`],
    ['페이스북', `${IPHONE} [FBAN/FBIOS;FBAV/480.0.0]`],
    ['라인', `${IPHONE} Line/14.0.0`],
  ])('%s 인앱 브라우저에는 메뉴가 없어 권하지 않는다', (_name, userAgent) => {
    expect(installGuideKind({ ...base, userAgent })).toBe('none');
    expect(installGuideKind({ ...base, userAgent, canPrompt: true })).toBe('none');
  });
});

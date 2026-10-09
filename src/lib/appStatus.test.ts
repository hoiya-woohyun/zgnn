import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STATUS_DURATION_MS,
  STATUS_INTERACTIVE_MIN_MS,
  clearAppStatus,
  createFirstTimesGate,
  getAppStatus,
  holdAppStatus,
  isAtStatusLink,
  releaseAppStatus,
  statusDurationMs,
  showAppStatus,
  subscribeAppStatus,
} from './appStatus';

describe('showAppStatus — 잠깐 떴다 사라지는 상태 한 줄', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAppStatus();
  });
  afterEach(() => {
    clearAppStatus();
    vi.useRealTimers();
  });

  it('띄우면 보이고 기본 시간이 지나면 사라진다', () => {
    showAppStatus('링크를 복사했어요');
    expect(getAppStatus()?.text).toBe('링크를 복사했어요');
    vi.advanceTimersByTime(STATUS_DURATION_MS - 1);
    expect(getAppStatus()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getAppStatus()).toBeNull();
  });

  it('링크를 실어 보내고, 링크가 있으면 짧게 달라 해도 최소 시간은 둔다', () => {
    showAppStatus('저장했어요', { link: { href: '/saved', label: '저장한 곳 보기' }, durationMs: 2500 });
    expect(getAppStatus()?.link).toEqual({ href: '/saved', label: '저장한 곳 보기' });
    vi.advanceTimersByTime(STATUS_INTERACTIVE_MIN_MS - 1);
    expect(getAppStatus()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getAppStatus()).toBeNull();
  });

  it('링크가 없으면 준 시간 그대로다', () => {
    showAppStatus('짧게', { durationMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(getAppStatus()).toBeNull();
  });

  it('포커스·hover 로 멈추면 사라지지 않고, 떼면 남은 시간(최소 기본 시간)부터 이어 간다', () => {
    showAppStatus('저장했어요', { link: { href: '/saved', label: '저장한 곳 보기' } });
    vi.advanceTimersByTime(4500); // 남은 500ms
    holdAppStatus();
    vi.advanceTimersByTime(60_000);
    expect(getAppStatus()).not.toBeNull();
    releaseAppStatus();
    vi.advanceTimersByTime(STATUS_DURATION_MS - 1);
    expect(getAppStatus()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getAppStatus()).toBeNull();
  });

  it('멈춘 채 새 알림이 오면 새 알림은 정상 타이머로 돈다', () => {
    showAppStatus('하나', { action: { label: '되돌리기', onPress: () => {} } });
    holdAppStatus();
    showAppStatus('둘');
    vi.advanceTimersByTime(STATUS_DURATION_MS);
    expect(getAppStatus()).toBeNull();
  });

  it('새 메시지는 이전 것을 갈아 끼우고, 이전 타이머가 새 메시지를 지우지 않는다', () => {
    showAppStatus('첫째');
    vi.advanceTimersByTime(1500);
    showAppStatus('둘째');
    vi.advanceTimersByTime(600); // 첫째의 2초는 지났다
    expect(getAppStatus()?.text).toBe('둘째');
    vi.advanceTimersByTime(STATUS_DURATION_MS);
    expect(getAppStatus()).toBeNull();
  });

  it('같은 문구가 연달아 와도 다른 메시지로 구분된다', () => {
    const a = showAppStatus('저장했어요');
    const b = showAppStatus('저장했어요');
    expect(a.id).not.toBe(b.id);
  });

  it('구독자는 뜰 때와 사라질 때 알림을 받고, 해지하면 더 받지 않는다', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppStatus(listener);
    showAppStatus('하나');
    vi.advanceTimersByTime(STATUS_DURATION_MS);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    showAppStatus('둘');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('createFirstTimesGate — 처음 몇 번만', () => {
  it('limit 번째까지만 true', () => {
    const gate = createFirstTimesGate(2);
    expect([gate(), gate(), gate(), gate()]).toEqual([true, true, false, false]);
  });

  it('문마다 따로 센다', () => {
    const a = createFirstTimesGate(1);
    const b = createFirstTimesGate(1);
    expect(a()).toBe(true);
    expect(b()).toBe(true);
    expect(a()).toBe(false);
  });
});

describe('showAppStatus — 되돌리기 버튼(12 U2.1)', () => {
  afterEach(() => clearAppStatus());

  it('action 을 실어 보낸다', () => {
    const onPress = vi.fn();
    showAppStatus('프로필을 지웠어요', { action: { label: '되돌리기', onPress } });
    expect(getAppStatus()?.action?.label).toBe('되돌리기');
    getAppStatus()?.action?.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('statusDurationMs', () => {
  it('링크·버튼이 있으면 최소 시간 이상, 더 길게 준 것은 그대로', () => {
    expect(statusDurationMs({})).toBe(STATUS_DURATION_MS);
    expect(statusDurationMs({ link: {} })).toBe(STATUS_INTERACTIVE_MIN_MS);
    expect(statusDurationMs({ action: {}, durationMs: 6000 })).toBe(6000);
  });
});

describe('isAtStatusLink — 링크가 가리키는 화면에 와 있나', () => {
  it('끝 슬래시 유무와 상관없이 같은 화면', () => {
    expect(isAtStatusLink('/saved/', '/saved')).toBe(true);
    expect(isAtStatusLink('/saved', '/saved/')).toBe(true);
  });

  it('쿼리는 떼고, 그 아래 경로도 도착', () => {
    expect(isAtStatusLink('/saved/', '/saved?ids=a')).toBe(true);
    expect(isAtStatusLink('/saved/x/', '/saved')).toBe(true);
  });

  it('이름이 앞만 같은 다른 화면은 아니다', () => {
    expect(isAtStatusLink('/savedx/', '/saved')).toBe(false);
    expect(isAtStatusLink('/map/', '/saved')).toBe(false);
  });
});

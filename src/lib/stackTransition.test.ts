import { describe, expect, it } from 'vitest';
import { canStartStackBackAt, isStackRoute, stackTransitionOf } from './stackTransition';

const move = (from: string, to: string, depthDelta: number, popRequested = false) =>
  stackTransitionOf({ from, to, depthDelta, popRequested });

describe('isStackRoute — 위에 쌓이는 화면인가', () => {
  it('탭바 화면은 아니다', () => {
    for (const path of ['/', '/places/stay', '/map', '/checklist', '/settings/']) expect(isStackRoute(path)).toBe(false);
  });

  it('안으로 들어간 화면은 맞다', () => {
    for (const path of ['/dog', '/saved/', '/place/abc']) expect(isStackRoute(path)).toBe(true);
  });

  it('검수 화면은 앱의 길 밖이라 아니다', () => {
    expect(isStackRoute('/admin')).toBe(false);
    expect(isStackRoute('/admin/ops/')).toBe(false);
  });
});

describe('stackTransitionOf — 이 이동을 어느 쪽으로 미끄러뜨리나', () => {
  it('탭 화면에서 안으로 들어가면 쌓는다', () => {
    expect(move('/settings', '/dog', 1)).toBe('push');
    expect(move('/places/cafe', '/place/abc', 1)).toBe('push');
  });

  it('쌓인 위에 또 쌓는다 — 상세에서 근처 상세로', () => {
    expect(move('/place/a', '/place/b', 1)).toBe('push');
    expect(move('/saved', '/place/a', 1)).toBe('push');
  });

  it('뒤로 얕아지면 걷는다', () => {
    expect(move('/dog', '/settings', -1)).toBe('pop');
    expect(move('/place/b', '/place/a', -1)).toBe('pop');
  });

  it('딥링크의 뒤로가기는 깊이가 그대로여도 셸이 말하면 걷는다', () => {
    expect(move('/place/a', '/places/stay', 0, true)).toBe('pop');
    expect(move('/place/a', '/places/stay', 0)).toBe('none');
  });

  it('탭바 화면끼리는 옆 페이저 몫이다', () => {
    expect(move('/', '/places/stay', 1)).toBe('none');
    expect(move('/checklist', '/', -1)).toBe('none');
  });

  it('쌓인 화면에서 탭바로 다른 탭에 가는 것은 되돌아가는 것이 아니다', () => {
    expect(move('/place/a', '/checklist', 1)).toBe('none');
  });

  it('같은 화면(쿼리·끝 슬래시만 바뀜)은 그리지 않는다', () => {
    expect(move('/saved', '/saved/', 0)).toBe('none');
    expect(move('/map', '/map/', 0)).toBe('none');
  });

  it('검수 화면 안팎은 그리지 않는다', () => {
    expect(move('/admin', '/admin/ops', 1)).toBe('none');
  });
});

describe('canStartStackBackAt — 어디서 끌면 걷어 내나', () => {
  it('홈 화면 앱은 맨 끝부터 48px 까지', () => {
    expect(canStartStackBackAt(0, true)).toBe(true);
    expect(canStartStackBackAt(47, true)).toBe(true);
    expect(canStartStackBackAt(48, true)).toBe(false);
  });

  it('브라우저는 Safari 몫(왼쪽 24px)을 비켜 그다음 띠만', () => {
    expect(canStartStackBackAt(10, false)).toBe(false);
    expect(canStartStackBackAt(24, false)).toBe(false);
    expect(canStartStackBackAt(30, false)).toBe(true);
    expect(canStartStackBackAt(60, false)).toBe(false);
  });
});

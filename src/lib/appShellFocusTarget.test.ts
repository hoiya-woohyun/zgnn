import { describe, expect, it } from 'vitest';
import {
  focusArrivalTargetOf,
  linkPathOf,
  noteFocusArrival,
  nthOfLink,
  openerIndexOf,
  type TFocusArrivalScene,
  type TFocusOpener,
} from './appShellFocusTarget';

const BASE = 'https://zgnn.app/places/cafe/';

describe('linkPathOf — 링크가 가리키는 곳을 비교할 수 있는 모양으로', () => {
  it('끝 `/` 차이를 지운다 — 렌더된 href 와 글자 그대로 맞추면 갈린다', () => {
    expect(linkPathOf('/place/abc/', BASE)).toBe('/place/abc');
    expect(linkPathOf('/place/abc', BASE)).toBe('/place/abc');
    expect(linkPathOf('https://zgnn.app/place/abc/', BASE)).toBe('/place/abc');
  });

  it('쿼리는 남기고 해시는 버린다', () => {
    expect(linkPathOf('/saved/?ids=a,b', BASE)).toBe('/saved?ids=a,b');
    expect(linkPathOf('/place/abc/#reviews', BASE)).toBe('/place/abc');
  });

  it('다른 출처는 null', () => {
    expect(linkPathOf('https://map.naver.com/p/entry/place/1', BASE)).toBeNull();
  });
});

describe('nthOfLink · openerIndexOf — 같은 곳으로 가는 링크가 여럿일 때', () => {
  const paths = ['/', '/dog', '/saved', '/dog', null];

  it('누른 링크가 같은 곳으로 가는 링크 중 몇 번째인가', () => {
    expect(nthOfLink(paths, 1)).toBe(0);
    expect(nthOfLink(paths, 3)).toBe(1);
    expect(nthOfLink(paths, 2)).toBe(0);
  });

  it('같은 번째를 고른다 — 설정의 두 번째 `/dog` 카드로 들어갔다 오면 두 번째로', () => {
    expect(openerIndexOf(paths, { path: '/dog', nth: 0 })).toBe(1);
    expect(openerIndexOf(paths, { path: '/dog', nth: 1 })).toBe(3);
  });

  it('그 사이 줄었으면 마지막 것, 아예 없으면 -1', () => {
    expect(openerIndexOf(paths, { path: '/dog', nth: 5 })).toBe(3);
    expect(openerIndexOf(paths, { path: '/place/abc', nth: 0 })).toBe(-1);
  });
});

describe('noteFocusArrival — 깊이별로 연 링크를 적고 돌아오면 돌려준다', () => {
  const card: TFocusOpener = { route: '/places/cafe', path: '/place/a', nth: 0 };
  const move = (over: Partial<Parameters<typeof noteFocusArrival>[1]>) => ({
    from: '/places/cafe/',
    to: '/place/a/',
    depth: 1,
    depthDelta: 1,
    traversed: false,
    clicked: card,
    ...over,
  });

  it('목록 → 상세 → 뒤로: 누른 카드가 돌아온다', () => {
    const book = new Map<number, TFocusOpener>();
    expect(noteFocusArrival(book, move({}))).toBeNull();
    expect(noteFocusArrival(book, move({ from: '/place/a/', to: '/places/cafe/', depth: 0, depthDelta: -1, traversed: true, clicked: null }))).toEqual(card);
  });

  it('상세 → 근처 상세 → 뒤로 → 뒤로: 깊이마다 그 화면에서 누른 링크', () => {
    const book = new Map<number, TFocusOpener>();
    const near: TFocusOpener = { route: '/place/a', path: '/place/b', nth: 0 };
    noteFocusArrival(book, move({}));
    noteFocusArrival(book, move({ from: '/place/a', to: '/place/b', depth: 2, clicked: near }));
    expect(noteFocusArrival(book, move({ from: '/place/b', to: '/place/a', depth: 1, depthDelta: -1, clicked: null }))).toEqual(near);
    expect(noteFocusArrival(book, move({ from: '/place/a', to: '/places/cafe', depth: 0, depthDelta: -1, clicked: null }))).toEqual(card);
  });

  it('돌아와도 지우지 않는다 — 앞으로 갔다 다시 돌아와도 같은 카드', () => {
    const book = new Map<number, TFocusOpener>();
    noteFocusArrival(book, move({}));
    const back = move({ from: '/place/a', to: '/places/cafe', depth: 0, depthDelta: -1, traversed: true, clicked: null });
    noteFocusArrival(book, back);
    expect(noteFocusArrival(book, move({ traversed: true, clicked: null }))).toBeNull();
    expect(noteFocusArrival(book, back)).toEqual(card);
  });

  it('링크 없이 쌓으면(버튼의 router.push) 그 칸을 비운다 — 옛 카드로 돌아가지 않는다', () => {
    const book = new Map<number, TFocusOpener>();
    noteFocusArrival(book, move({}));
    noteFocusArrival(book, move({ from: '/place/a', to: '/places/cafe', depth: 0, depthDelta: -1, clicked: null }));
    noteFocusArrival(book, move({ to: '/place/c', clicked: null }));
    expect(noteFocusArrival(book, move({ from: '/place/c', to: '/places/cafe', depth: 0, depthDelta: -1, clicked: null }))).toBeNull();
  });

  it('누른 링크가 도착한 곳을 가리키지 않으면 이번 이동을 연 링크가 아니다(새 탭으로 연 클릭이 남은 것)', () => {
    const book = new Map<number, TFocusOpener>();
    noteFocusArrival(book, move({ to: '/place/c' }));
    expect(noteFocusArrival(book, move({ from: '/place/c', to: '/places/cafe', depth: 0, depthDelta: -1, clicked: null }))).toBeNull();
  });

  it('돌아온 화면이 적어 둔 화면과 다르면 쓰지 않는다 — 그 깊이를 탭 전환이 갈아 끼웠다', () => {
    const book = new Map<number, TFocusOpener>();
    noteFocusArrival(book, move({}));
    expect(noteFocusArrival(book, move({ from: '/place/a', to: '/map', depth: 0, depthDelta: -1, clicked: null }))).toBeNull();
  });

  it('갈아 끼움·탭 전환(깊이 그대로)은 읽지도 적지도 않는다', () => {
    const book = new Map<number, TFocusOpener>();
    expect(noteFocusArrival(book, move({ to: '/places/stay', depthDelta: 0, clicked: { ...card, path: '/places/stay' } }))).toBeNull();
    expect(book.size).toBe(0);
  });
});

describe('focusArrivalTargetOf — 도착한 화면에서 포커스를 어디에', () => {
  const scene = (over: Partial<TFocusArrivalScene>): TFocusArrivalScene => ({
    opener: null,
    links: ['/', '/place/a', '/place/b'],
    hasHeading: true,
    focusMoved: false,
    focusLost: true,
    lastTry: false,
    ...over,
  });

  it('돌아왔으면 방금 연 카드로', () => {
    expect(focusArrivalTargetOf(scene({ opener: { path: '/place/b', nth: 0 } }))).toEqual({ kind: 'opener', index: 2 });
  });

  it('뒤로 가기 버튼이 화면을 넘어 포커스를 쥐고 있어도 연 링크가 먼저다(상세 → 근처 상세 → 뒤로)', () => {
    expect(focusArrivalTargetOf(scene({ opener: { path: '/place/a', nth: 0 }, focusLost: false }))).toEqual({ kind: 'opener', index: 1 });
  });

  it('화면이 스스로 포커스를 옮겼으면 손대지 않는다', () => {
    expect(focusArrivalTargetOf(scene({ opener: { path: '/place/a', nth: 0 }, focusMoved: true }))).toEqual({ kind: 'none' });
    expect(focusArrivalTargetOf(scene({ focusMoved: true }))).toEqual({ kind: 'none' });
  });

  it('잃었으면 h1 — 들어갈 때 · 종류 알약 · 연 링크를 못 찾은 돌아옴', () => {
    expect(focusArrivalTargetOf(scene({}))).toEqual({ kind: 'heading' });
    expect(focusArrivalTargetOf(scene({ opener: { path: '/place/z', nth: 0 } }))).toEqual({ kind: 'heading' });
  });

  it('포커스가 살아 있으면 그대로 — 탭바에서 Enter 를 친 사람은 다음 탭으로 옮겨 가려는 것이다', () => {
    expect(focusArrivalTargetOf(scene({ focusLost: false }))).toEqual({ kind: 'none' });
  });

  describe('연 링크가 <main> 밖 층(지도 시트)에 있을 때 — 14 W261019.15b', () => {
    const sheet = { opener: { path: '/place/b', nth: 1 }, links: ['/place/b', '/place/b'] };

    it('층(dialog)이 열리며 스스로 포커스를 가져갔어도 그 안의 연 링크로 — 같은 곳 두 링크 중 누른 번째', () => {
      expect(focusArrivalTargetOf(scene({ ...sheet, hasHeading: false, focusMoved: true, focusHoldsOpener: true, focusLost: false }))).toEqual({
        kind: 'opener',
        index: 1,
      });
    });

    it('연 링크를 품지 않은 곳으로 옮겨졌으면 여전히 비킨다', () => {
      expect(focusArrivalTargetOf(scene({ ...sheet, focusMoved: true, focusHoldsOpener: false }))).toEqual({ kind: 'none' });
    });

    it('셸이 h1 에 둔 뒤 층이 늦게 뜨면 그 링크로 옮긴다', () => {
      expect(focusArrivalTargetOf(scene({ ...sheet, headingPlaced: true, focusLost: false }))).toEqual({ kind: 'opener', index: 1 });
      // h1 이 inert 가 되며 body 로 떨어졌다가 dialog 가 가져간 프레임도 같다.
      expect(focusArrivalTargetOf(scene({ ...sheet, headingPlaced: true, focusMoved: true, focusHoldsOpener: true, focusLost: false }))).toEqual({
        kind: 'opener',
        index: 1,
      });
    });

    it('h1 에 둔 뒤 아직 안 떴으면 기다리고, 그사이 누가 옮겼거나 끝까지 안 뜨면 그만', () => {
      const late = { opener: sheet.opener, links: ['/'], headingPlaced: true, focusLost: false };
      expect(focusArrivalTargetOf(scene(late))).toEqual({ kind: 'wait' });
      expect(focusArrivalTargetOf(scene({ ...late, focusMoved: true }))).toEqual({ kind: 'none' });
      expect(focusArrivalTargetOf(scene({ ...late, lastTry: true }))).toEqual({ kind: 'none' });
    });
  });

  it('화면이 덜 그려졌으면 기다리고, 끝내 h1 이 없으면 본문으로', () => {
    expect(focusArrivalTargetOf(scene({ links: [], hasHeading: false, opener: { path: '/place/a', nth: 0 } }))).toEqual({ kind: 'wait' });
    expect(focusArrivalTargetOf(scene({ links: [], hasHeading: false }))).toEqual({ kind: 'wait' });
    expect(focusArrivalTargetOf(scene({ links: [], hasHeading: false, lastTry: true }))).toEqual({ kind: 'main' });
    expect(focusArrivalTargetOf(scene({ hasHeading: false, focusLost: false, lastTry: true }))).toEqual({ kind: 'none' });
  });
});

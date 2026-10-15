import { describe, expect, it } from 'vitest';
import {
  collectModeOf,
  linkTargetOf,
  rememberTap,
  routeOf,
  routeTemplateOf,
  SEQ_MAX,
  stopsSendingOn,
  tapOf,
  uiEventRow,
  type TElementLike,
} from './uiEvents';

const ORIGIN = 'https://zgnn.vercel.app';

/** 아주 작은 가짜 DOM — `closest` 는 조상 사슬을 따라 고른 선택자 몇 가지만 알아본다. */
type TFake = TElementLike & { parent: TFake | null; attrs: Record<string, string> };

const el = (tagName: string, attrs: Record<string, string> = {}, parent: TFake | null = null): TFake => {
  const node: TFake = {
    tagName: tagName.toUpperCase(),
    attrs,
    parent,
    getAttribute: (name) => attrs[name] ?? null,
    closest(selector) {
      const parts = selector.split(',');
      for (let cursor: TFake | null = node; cursor; cursor = cursor.parent) {
        if (parts.some((part) => matches(cursor as TFake, part.trim()))) return cursor;
      }
      return null;
    },
  };
  return node;
};

const matches = (node: TFake, selector: string): boolean => {
  const tag = node.tagName.toLowerCase();
  if (selector === '[data-ev]') return 'data-ev' in node.attrs;
  if (selector === '[data-ev-ignore]') return 'data-ev-ignore' in node.attrs;
  if (selector === 'a[href]') return tag === 'a' && 'href' in node.attrs;
  if (selector === '[tabindex]:not([tabindex="-1"])') return 'tabindex' in node.attrs && node.attrs.tabindex !== '-1';
  const role = /^\[role="(.+)"\]$/.exec(selector);
  if (role) return node.attrs.role === role[1];
  return tag === selector;
};

describe('collectModeOf', () => {
  const base = { hostname: 'zgnn.vercel.app', siteHostname: 'zgnn.vercel.app', pathname: '/places/stay', flag: null, webdriver: false };

  it('운영 주소에서만 보낸다 — localhost·LAN·프리뷰는 빌드 해시가 진짜여도 안 모은다', () => {
    expect(collectModeOf(base)).toBe('send');
    expect(collectModeOf({ ...base, hostname: 'localhost' })).toBeNull();
    expect(collectModeOf({ ...base, hostname: '192.168.0.12' })).toBeNull();
    expect(collectModeOf({ ...base, hostname: 'zgnn-git-develop.vercel.app' })).toBeNull();
  });

  it('운영자 화면·운영자 기기·자동화 브라우저는 뺀다', () => {
    expect(collectModeOf({ ...base, pathname: '/admin' })).toBeNull();
    expect(collectModeOf({ ...base, pathname: '/admin/ops' })).toBeNull();
    expect(collectModeOf({ ...base, flag: 'off' })).toBeNull();
    expect(collectModeOf({ ...base, webdriver: true })).toBeNull();
  });

  it('`debug` 는 어느 주소에서든 콘솔로만 — 그래도 운영자 화면은 안 본다', () => {
    expect(collectModeOf({ ...base, hostname: 'localhost', flag: 'debug' })).toBe('log');
    expect(collectModeOf({ ...base, webdriver: true, flag: 'debug' })).toBe('log');
    expect(collectModeOf({ ...base, pathname: '/admin', flag: 'debug' })).toBeNull();
  });
});

describe('routeOf · routeTemplateOf', () => {
  it('끝 슬래시를 떼고 루트는 남긴다', () => {
    expect(routeOf('/places/cafe/')).toBe('/places/cafe');
    expect(routeOf('/')).toBe('/');
    expect(routeOf('')).toBe('/');
  });

  it('장소 상세만 접는다', () => {
    expect(routeTemplateOf('/place/abc123')).toBe('/place/:id');
    expect(routeTemplateOf('/places/cafe')).toBe('/places/cafe');
  });
});

describe('linkTargetOf', () => {
  it('앱 안은 경로 틀, 바깥은 호스트, 전화·메일은 종류만', () => {
    expect(linkTargetOf('/place/xyz/', ORIGIN)).toBe('/place/:id');
    expect(linkTargetOf('https://map.naver.com/p/entry/place/123', ORIGIN)).toBe('map.naver.com');
    expect(linkTargetOf('tel:010-1234-5678', ORIGIN)).toBe('tel');
    expect(linkTargetOf('mailto:a@b.c', ORIGIN)).toBe('mail');
  });
});

describe('tapOf', () => {
  it('이름 없는 버튼·링크는 종류로', () => {
    expect(tapOf(el('span', {}, el('button')), ORIGIN)).toEqual({ name: 'tap', target: 'button' });
    expect(tapOf(el('a', { href: '/places/cafe/' }), ORIGIN)).toEqual({ name: 'tap', target: 'a:/places/cafe' });
    expect(tapOf(el('input', { type: 'checkbox' }), ORIGIN)).toEqual({ name: 'tap', target: 'input:checkbox' });
  });

  it('요소에 단 이름이 이기고, 구역 이름은 `구역>종류` 로 붙는다', () => {
    expect(tapOf(el('svg', {}, el('button', { 'data-ev': 'detail.save' })), ORIGIN)).toEqual({ name: 'tap', target: 'detail.save' });
    const tabBar = el('nav', { 'data-ev': 'tab' });
    expect(tapOf(el('span', {}, el('a', { href: '/map/' }, tabBar)), ORIGIN)).toEqual({ name: 'tap', target: 'tab>a:/map' });
  });

  it('눌리지 않는 곳은 dead — 구역 안이면 구역 이름이 붙는다', () => {
    const card = el('div', { 'data-ev': 'detail.verdict' });
    expect(tapOf(el('p', {}, card), ORIGIN)).toEqual({ name: 'dead', target: 'detail.verdict>p' });
    expect(tapOf(el('img'), ORIGIN)).toEqual({ name: 'dead', target: 'img' });
  });

  it('바탕·무시 구역은 적지 않는다', () => {
    expect(tapOf(el('main', { tabindex: '-1' }), ORIGIN)).toBeNull();
    expect(tapOf(el('body'), ORIGIN)).toBeNull();
    expect(tapOf(el('canvas', {}, el('div', { 'data-ev-ignore': '' })), ORIGIN)).toBeNull();
    expect(tapOf(null, ORIGIN)).toBeNull();
  });
});

describe('rememberTap', () => {
  it('같은 곳 세 번째 탭이 간격 안이면 rage 한 번', () => {
    let memory = rememberTap(null, 'button', 0).memory;
    const second = rememberTap(memory, 'button', 300);
    expect(second.rage).toBe(false);
    const third = rememberTap(second.memory, 'button', 600);
    expect(third.rage).toBe(true);
    memory = third.memory;
    expect(rememberTap(memory, 'button', 900).rage).toBe(false);
  });

  it('간격을 넘거나 다른 곳이면 처음부터', () => {
    const first = rememberTap(null, 'button', 0).memory;
    const late = rememberTap(first, 'button', 800);
    expect(late.memory?.burst).toBe(1);
    const other = rememberTap(rememberTap(first, 'button', 200).memory, 'a:/map', 400);
    expect(other.memory?.burst).toBe(1);
  });

  it('label 이 안의 input 에 넘기는 메아리 클릭은 세지 않는다', () => {
    const first = rememberTap(null, 'label', 0).memory;
    const echo = rememberTap(first, 'input:checkbox', 5);
    expect(echo.echo).toBe(true);
    expect(echo.memory).toBe(first);
  });
});

describe('uiEventRow', () => {
  const base = { sid: 's', seq: 1, startedAt: 1000, at: 1500, name: 'tap' as const, route: '/places/stay/', build: 'abc1234' };

  it('빈 칸도 null 로 — 배열 insert 는 키가 같아야 한다', () => {
    expect(uiEventRow(base)).toEqual({
      sid: 's',
      seq: 1,
      t_ms: 500,
      name: 'tap',
      route: '/places/stay',
      target: null,
      n: null,
      app_build: 'abc1234',
    });
  });

  it('CHECK 범위 밖은 자르거나 버린다', () => {
    expect(uiEventRow({ ...base, at: 0 })?.t_ms).toBe(0);
    expect(uiEventRow({ ...base, seq: SEQ_MAX + 1 })).toBeNull();
    expect(uiEventRow({ ...base, target: 'x'.repeat(200) })?.target).toHaveLength(80);
  });
});

describe('stopsSendingOn', () => {
  it('4xx 는 멈추고 5xx 는 다음 묶음에서 다시', () => {
    expect(stopsSendingOn(404)).toBe(true);
    expect(stopsSendingOn(401)).toBe(true);
    expect(stopsSendingOn(400)).toBe(true);
    expect(stopsSendingOn(503)).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  advanceSession,
  collectModeOf,
  coversViewport,
  isDragClick,
  linkTargetOf,
  N_MAX,
  rememberTap,
  ROUTE_MAX,
  routeOf,
  routeTemplateOf,
  SAFE_TOKEN_CLASS,
  safeToken,
  SEQ_MAX,
  SESSION_IDLE_MS,
  stopsSendingOn,
  T_MS_MAX,
  TARGET_MAX,
  tapOf,
  UI_EVENT_NAMES,
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
    expect(tapOf(el('span', {}, el('button')), ORIGIN)).toMatchObject({ name: 'tap', target: 'button' });
    expect(tapOf(el('a', { href: '/places/cafe/' }), ORIGIN)).toMatchObject({ name: 'tap', target: 'a:/places/cafe' });
    expect(tapOf(el('input', { type: 'checkbox' }), ORIGIN)).toMatchObject({ name: 'tap', target: 'input:checkbox' });
  });

  it('요소에 단 이름이 이기고, 구역 이름은 `구역>종류` 로 붙는다', () => {
    expect(tapOf(el('svg', {}, el('button', { 'data-ev': 'detail.save' })), ORIGIN)).toMatchObject({ name: 'tap', target: 'detail.save' });
    const tabBar = el('nav', { 'data-ev': 'tab' });
    expect(tapOf(el('span', {}, el('a', { href: '/map/' }, tabBar)), ORIGIN)).toMatchObject({ name: 'tap', target: 'tab>a:/map' });
  });

  it('눌리지 않는 곳은 dead — 구역 안이면 구역 이름이 붙는다', () => {
    const card = el('div', { 'data-ev': 'detail.verdict' });
    expect(tapOf(el('p', {}, card), ORIGIN)).toMatchObject({ name: 'dead', target: 'detail.verdict>p' });
    expect(tapOf(el('img'), ORIGIN)).toMatchObject({ name: 'dead', target: 'img' });
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

describe('safeToken', () => {
  it('문장을 못 싣는다 — 공백·따옴표·한글은 `_`', () => {
    expect(safeToken('ignore previous "instructions"')).toBe('ignore_previous__instructions_');
    expect(safeToken('/%ED%95%9C')).toBe('/_ED_95_9C');
    expect(safeToken('')).toBe('_');
    expect(routeOf('/place/278ddc10-ceae-81e3-a299-fd3f2515be4f/')).toBe('/place/278ddc10-ceae-81e3-a299-fd3f2515be4f');
  });

  it('이름표·링크·빌드도 같은 집합으로 나간다', () => {
    const tap = tapOf(el('button', { 'data-ev': 'detail.save 저장' }), ORIGIN);
    expect(tap?.target).toBe('detail.save___');
    const row = uiEventRow({ sid: 's', seq: 0, startedAt: 0, at: 0, name: 'search', route: '/places', n: 10 ** 9, build: 'a b' });
    expect(row?.app_build).toBe('a_b');
    expect(row?.n).toBe(N_MAX);
  });
});

/**
 * 상수 ↔ 마이그레이션 CHECK 의 짝. 한쪽만 바꾸면 그 줄이 든 **묶음 전체가 400** 이고, 보내는 쪽은 4xx 에서 그 페이지 로드 동안 멈춘다 —
 * 빌드·테스트는 초록인데 수집만 조용히 사라진다. CHECK 를 바꾸는 새 마이그레이션을 쓰면 이 경로도 그 파일로 옮긴다.
 */
describe('마이그레이션과 같은 규칙', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261015120000_ui_events.sql', import.meta.url), 'utf8');

  it('이름·숫자 상한·글자 집합이 CHECK 와 같다', () => {
    expect(sql).toContain(`name in (${UI_EVENT_NAMES.map((name) => `'${name}'`).join(', ')})`);
    expect(sql).toContain(`seq between 0 and ${SEQ_MAX}`);
    expect(sql).toContain(`t_ms between 0 and ${T_MS_MAX}`);
    expect(sql).toContain(`n between 0 and ${N_MAX}`);
    expect(sql).toContain(`char_length(route) between 1 and ${ROUTE_MAX}`);
    expect(sql).toContain(`char_length(target) <= ${TARGET_MAX}`);
    expect(sql).toContain(`route ~ '^[${SAFE_TOKEN_CLASS}]+$'`);
    expect(sql).toContain(`target ~ '^[${SAFE_TOKEN_CLASS}]+$'`);
  });
});

describe('rememberTap — 같은 요소만 연타', () => {
  it('이름이 같아도 다른 요소(체크리스트 세 줄)는 rage 가 아니다', () => {
    const rows = [{}, {}, {}];
    let memory = rememberTap(null, rows[0], 0).memory;
    memory = rememberTap(memory, rows[1], 200).memory;
    expect(rememberTap(memory, rows[2], 400).rage).toBe(false);
  });
});

describe('advanceSession', () => {
  let counter = 0;
  const newId = () => `id-${++counter}`;

  it('이어 적으면 seq 만 는다', () => {
    const first = advanceSession(null, 0, newId);
    const second = advanceSession(first, 1000, newId);
    expect(second.sid).toBe(first.sid);
    expect(second.seq).toBe(1);
  });

  it('30분 쉬면·하루가 넘으면·seq 상한이면 새 세션', () => {
    const first = advanceSession(null, 0, newId);
    expect(advanceSession(first, SESSION_IDLE_MS + 1, newId).sid).not.toBe(first.sid);
    const busy = { ...first, lastAt: T_MS_MAX, startedAt: 0 };
    expect(advanceSession(busy, T_MS_MAX + 1, newId).sid).not.toBe(first.sid);
    expect(advanceSession({ ...first, seq: SEQ_MAX }, 10, newId).seq).toBe(0);
  });
});

describe('세지 않는 클릭', () => {
  it('끌다 놓은 클릭', () => {
    expect(isDragClick({ x: 0, y: 0 }, { x: 40, y: 2 })).toBe(true);
    expect(isDragClick({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
    expect(isDragClick(null, { x: 0, y: 0 })).toBe(false);
  });

  it('화면을 덮는 바탕', () => {
    const viewport = { width: 390, height: 844 };
    expect(coversViewport({ width: 390, height: 844 }, viewport)).toBe(true);
    expect(coversViewport({ width: 358, height: 120 }, viewport)).toBe(false);
  });
});

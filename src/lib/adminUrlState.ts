/**
 * `/admin` 의 탭과 걸러 보기를 주소 쿼리에 싣는다(`?tab=archived&warn=any&type=cafe`) — 순수.
 *
 * 왜: 상태가 전부 메모리라 새로고침·12시간마다 오는 재로그인·뒤로 가기에서 `검수 대기`·`전체` 로 돌아갔다(UX 감사 13).
 * 정적 내보내기라 서버가 쿼리를 읽어 줄 수 없고, 마운트 때 브라우저 쪽에서만 읽는다. 기본값은 쿼리에 적지 않는다 —
 * 평소 주소가 `/admin/` 그대로여야 하고, 기본값이 바뀌어도 저장된 링크가 옛 기본값을 박아 두지 않는다.
 * 모르는 값은 기본값으로 읽는다(손으로 고친 주소·옛 링크가 화면을 깨지 않게). 쿼리의 다른 키는 건드리지 않는다.
 *
 * `tier`(짝: 기존·확인·신규)는 2026-10-06 에 없앴다 — `kind` 가 같은 것을 더 잘게 가른다(todo/13 T4.3). 옛 링크의 `?tier=` 는
 * 에러 없이 무시하고, 다음에 주소를 쓸 때 지운다(`LEGACY_KEYS`) — 우리가 쓰던 키라 "다른 키" 가 아니다. 남겨 두면 저장된 링크마다 죽은 키가 따라다닌다.
 */

export const ADMIN_TABS = ['posts', 'candidates', 'places', 'archived', 'blocks'] as const;
export type TAdminTab = (typeof ADMIN_TABS)[number];
export const DEFAULT_ADMIN_TAB: TAdminTab = 'candidates';

/** 짝(11 U2 · todo/13 T4.3) — `?kind=update` 가 갱신 묶음만. 옛 `tier` 의 기존 = 갱신 + 보강. */
export const KIND_FILTER_KEYS = ['all', 'update', 'fill', 'new', 'ask'] as const;
export type TKindFilter = (typeof KIND_FILTER_KEYS)[number];

export const POLICY_FILTER_KEYS = ['all', 'has', 'needsLook', 'listedOnly'] as const;
export type TPolicyFilter = (typeof POLICY_FILTER_KEYS)[number];

export const TYPE_FILTER_KEYS = ['all', 'stay', 'restaurant', 'cafe', 'other'] as const;
export type TTypeFilter = (typeof TYPE_FILTER_KEYS)[number];

export const WARN_FILTER_KEYS = ['all', 'any', 'region', 'address', 'noBasis', 'typeMismatch'] as const;
export type TWarnFilter = (typeof WARN_FILTER_KEYS)[number];

export type TAdminUrlState = {
  tab: TAdminTab;
  kind: TKindFilter;
  policy: TPolicyFilter;
  type: TTypeFilter;
  warn: TWarnFilter;
};

export const DEFAULT_ADMIN_URL_STATE: TAdminUrlState = {
  tab: DEFAULT_ADMIN_TAB,
  kind: 'all',
  policy: 'all',
  type: 'all',
  warn: 'all',
};

/** 예전에 우리가 쓰던 키 — 읽지 않고, 쓸 때 지운다. */
const LEGACY_KEYS = ['tier'] as const;

const pick = <T extends string>(keys: readonly T[], raw: string | null, fallback: T): T =>
  raw !== null && (keys as readonly string[]).includes(raw) ? (raw as T) : fallback;

/** 쿼리 문자열(`location.search`, 앞의 `?` 는 있어도 없어도 된다) → 상태. */
export function parseAdminUrl(search: string): TAdminUrlState {
  const params = new URLSearchParams(search);
  return {
    tab: pick(ADMIN_TABS, params.get('tab'), DEFAULT_ADMIN_URL_STATE.tab),
    kind: pick(KIND_FILTER_KEYS, params.get('kind'), 'all'),
    policy: pick(POLICY_FILTER_KEYS, params.get('policy'), 'all'),
    type: pick(TYPE_FILTER_KEYS, params.get('type'), 'all'),
    warn: pick(WARN_FILTER_KEYS, params.get('warn'), 'all'),
  };
}

/** 상태 → 쿼리 문자열(앞의 `?` 없음, 기본값이면 ''). `search` 의 다른 키는 그대로 둔다. */
export function writeAdminUrl(search: string, state: TAdminUrlState): string {
  const params = new URLSearchParams(search);
  for (const key of LEGACY_KEYS) params.delete(key);
  for (const key of Object.keys(DEFAULT_ADMIN_URL_STATE) as (keyof TAdminUrlState)[]) {
    if (state[key] === DEFAULT_ADMIN_URL_STATE[key]) params.delete(key);
    else params.set(key, state[key]);
  }
  return params.toString();
}

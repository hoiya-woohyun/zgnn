import { describe, expect, it } from 'vitest';
import {
  archiveNoteLine,
  countPlacesByStatus,
  dayOf,
  lastNoteLine,
  matchesPlaceQuery,
  noteHistory,
  noteLineText,
  placeAddressDraft,
  placeAddressPatch,
  placeAddressProblem,
  placeBadges,
  placeGaps,
  sortManagedPlaces,
} from './adminPlaces';
import { hasVerifiedColumn, markPlaceVerified, seedVerifyTargets } from './adminPlaces';
import type { TPlaceRow } from './adminCandidates';

const place = (patch: Partial<TPlaceRow> = {}): TPlaceRow => ({
  id: 'place-1',
  type: 'cafe',
  name: '두부식당',
  region_raw: '동쪽 (구좌읍)',
  features: '',
  pet_policy_text: '',
  pet_policy: null,
  review_url: null,
  naver_url: null,
  naver_place_id: null,
  lat: null,
  lng: null,
  address: null,
  category: null,
  stay_price_text: null,
  stay_amenities_text: null,
  sort: null,
  status: 'published',
  source: 'notion',
  archived_at: null,
  archive_note: null,
  ...patch,
});

describe('sortManagedPlaces', () => {
  /*
   * 내림이 맨 위인 것이 이 정렬의 요점이다. 이 목록을 여는 두 가지 일(방금 내린 것 확인 · 되살리기)이
   * 둘 다 내린 곳을 찾는 일이라, 게시중 86곳 아래 묻히면 매번 검색을 해야 한다.
   */
  it('내린 곳을 맨 위에 최근 순으로, 나머지는 이름순으로 세운다', () => {
    const rows = [
      place({ id: 'b', name: '나카페' }),
      place({ id: 'old1', name: '옛가게1', status: 'archived', archived_at: '2026-09-01T00:00:00.000Z' }),
      place({ id: 'a', name: '가카페' }),
      place({ id: 'old2', name: '옛가게2', status: 'archived', archived_at: '2026-09-20T00:00:00.000Z' }),
    ];

    expect(sortManagedPlaces(rows).map((row) => row.id)).toEqual(['old2', 'old1', 'a', 'b']);
  });

  /** 트리거가 생기기 전에 Studio 로 내린 행은 `archived_at` 이 없다 — 시각이 있는 것이 더 최근이다. */
  it('내린 시각이 없는 행은 있는 행보다 뒤에 둔다', () => {
    const rows = [
      place({ id: 'noTime', name: 'ㄱ', status: 'archived' }),
      place({ id: 'withTime', name: 'ㅎ', status: 'archived', archived_at: '2026-09-01T00:00:00.000Z' }),
    ];

    expect(sortManagedPlaces(rows).map((row) => row.id)).toEqual(['withTime', 'noTime']);
  });

  it('원본 배열을 고치지 않는다', () => {
    const rows = [place({ id: 'b', name: '나' }), place({ id: 'a', name: '가' })];
    sortManagedPlaces(rows);
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });
});

describe('matchesPlaceQuery', () => {
  it('빈 검색어는 전부 통과시킨다', () => {
    expect(matchesPlaceQuery(place(), '')).toBe(true);
    expect(matchesPlaceQuery(place(), '   ')).toBe(true);
  });

  /** 띄어쓰기가 데이터와 다른 것이 가장 흔한 실패다 — "카페 살레" 로 쳐도 "카페살레" 를 찾아야 한다. */
  it('공백과 대소문자를 무시한다', () => {
    const row = place({ name: '카페살레' });
    expect(matchesPlaceQuery(row, '카페 살레')).toBe(true);
    expect(matchesPlaceQuery(place({ name: 'Cafe Salle' }), 'cafesalle')).toBe(true);
  });

  it('지역과 주소로도 찾는다', () => {
    const row = place({ name: '두부식당', region_raw: '동쪽 (구좌읍)', address: '제주시 애월읍 1' });
    expect(matchesPlaceQuery(row, '구좌')).toBe(true);
    expect(matchesPlaceQuery(row, '애월읍 1')).toBe(true);
    expect(matchesPlaceQuery(row, '성산')).toBe(false);
  });

  /**
   * 대조용 정규화(`normalizeName`)를 쓰지 않는 이유를 못 박는다 — 그쪽은 '카페'·'제주' 를 떼므로,
   * 검색에 쓰면 "카페" 를 입력한 사람에게 카페가 하나도 안 나온다.
   */
  it("'카페' 처럼 대조에서 떼는 말도 검색에서는 찾는다", () => {
    expect(matchesPlaceQuery(place({ name: '카페살레' }), '카페')).toBe(true);
  });
});

describe('countPlacesByStatus', () => {
  it('상태별로 센다 — 없는 상태는 0', () => {
    const rows = [place(), place({ id: '2' }), place({ id: '3', status: 'archived' })];
    expect(countPlacesByStatus(rows)).toEqual({ published: 2, draft: 0, archived: 1 });
  });

  it('빈 목록도 세 칸을 다 준다', () => {
    expect(countPlacesByStatus([])).toEqual({ published: 0, draft: 0, archived: 0 });
  });
});

describe('archiveNoteLine', () => {
  /*
   * 줄에 날짜가 있어야 하는 이유: `archived_at` 은 "지금 내려 있는 시각" 하나뿐이라 되살리면 null 이 된다.
   * 내렸다 되살린 이력은 이 칸에만 남으므로 줄마다 날짜가 없으면 순서를 읽을 수 없다.
   */
  it('내림 줄에 날짜·사유·메모를 담는다', () => {
    expect(archiveNoteLine('archive', '2026-09-29', '폐업', '9월에 문 닫음')).toBe(
      '[admin 2026-09-29] 내림 · 폐업 — 9월에 문 닫음',
    );
  });

  it('메모가 없거나 공백뿐이면 사유까지만 적는다', () => {
    expect(archiveNoteLine('archive', '2026-09-29', '중복')).toBe('[admin 2026-09-29] 내림 · 중복');
    expect(archiveNoteLine('archive', '2026-09-29', '중복', '   ')).toBe('[admin 2026-09-29] 내림 · 중복');
  });

  it('사유가 없으면 기타로 적는다 — 사유 칸이 비는 줄은 만들지 않는다', () => {
    expect(archiveNoteLine('archive', '2026-09-29')).toBe('[admin 2026-09-29] 내림 · 기타');
  });

  it('되살림 줄에는 사유가 없다', () => {
    expect(archiveNoteLine('restore', '2026-09-30')).toBe('[admin 2026-09-30] 되살림');
  });
});

describe('lastNoteLine', () => {
  /** 지금 왜 내려 있는지는 **마지막** 줄에 있다. 앞줄은 지난 이력이다. */
  it('마지막 줄을 준다', () => {
    const note = '[admin 2026-09-01] 내림 · 폐업\n[admin 2026-09-10] 되살림\n[admin 2026-09-29] 내림 · 중복';
    expect(lastNoteLine(note)).toBe('[admin 2026-09-29] 내림 · 중복');
  });

  it('없거나 빈 줄뿐이면 undefined', () => {
    expect(lastNoteLine(null)).toBeUndefined();
    expect(lastNoteLine('')).toBeUndefined();
    expect(lastNoteLine('\n  \n')).toBeUndefined();
  });
});

describe('noteLineText', () => {
  /**
   * **저장 문자열은 안 바뀐다** — 위 `archiveNoteLine` 단정이 그대로 통과하는 것이 그 증거다.
   * 여기서 벗기는 것은 화면에 보일 때의 대괄호·태그뿐이다(태그는 누가 썼는지 가리는 내부 표식이다).
   */
  it.each([
    ['[admin 2026-09-29] 내림 · 폐업 — 메모', '2026-09-29 내림 · 폐업 — 메모'],
    ['[admin 2026-09-30] 되살림', '2026-09-30 되살림'],
    ['[data:apply] 내림 · 중복', '내림 · 중복'],
    ['Studio 에서 손으로 적은 줄', 'Studio 에서 손으로 적은 줄'],
    // 우리 태그가 아닌 대괄호는 건드리지 않는다 — 손글씨를 망치지 않는 것이 이 함수의 경계다.
    ['[폐업] 9월 문 닫음', '[폐업] 9월 문 닫음'],
    ['[2026-09-01] 폐업', '[2026-09-01] 폐업'],
    ['[] 빈 태그', '[] 빈 태그'],
    ['[admin] 날짜 없는 우리 태그', '날짜 없는 우리 태그'],
  ])('%s → %s', (line, expected) => {
    expect(noteLineText(line)).toBe(expected);
  });

  it('없으면 없는 대로 — 호출자가 && 로 거르는 값이다', () => {
    expect(noteLineText(undefined)).toBeUndefined();
  });
});

describe('dayOf', () => {
  it('ISO 문자열에서 날짜만 뗀다', () => {
    expect(dayOf('2026-09-29T13:24:00.000Z')).toBe('2026-09-29');
  });
});

describe('placeBadges', () => {
  // 사이트와 같은 길이어야 한다 — 요금 줄이 원문 그대로 배지가 되는 것까지 같다.
  it('원문의 요금·크기 조건을 사이트 배지로 읽는다', () => {
    const labels = placeBadges(place({ pet_policy_text: '1~5kg 1만원.\n6~10kg 1.5만원.' })).map((badge) => badge.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join(' ')).toContain('1만원');
  });

  it('원문이 비면 확인된 정보 없음 한 장뿐이다', () => {
    expect(placeBadges(place()).map((badge) => badge.label)).toEqual(['확인된 정보 없음']);
  });
});

describe('placeGaps', () => {
  it('비어 있는 칸을 사이트에서 사라지는 것의 이름으로 돌려준다', () => {
    expect(placeGaps(place())).toEqual(['noGeo', 'noAddress', 'noNaver', 'noPolicy', 'noFeatures']);
  });

  it('다 찬 곳은 빈 배열이다 — 네이버는 링크나 플레이스 id 중 하나면 된다', () => {
    const full = place({
      lat: 33.5,
      lng: 126.8,
      address: '제주 제주시 구좌읍 충렬로 141-15',
      naver_place_id: '1118214877',
      pet_policy_text: '소형견만',
      features: '마당이 넓어요',
    });
    expect(placeGaps(full)).toEqual([]);
  });

  it('공백뿐인 칸은 빈 것으로 본다', () => {
    expect(placeGaps(place({ features: '  ' }))).toContain('noFeatures');
  });

  it('좌표는 한쪽만 있어도 지도에 안 선다', () => {
    expect(placeGaps(place({ lat: 33.5 }))).toContain('noGeo');
  });
});

describe('noteHistory', () => {
  it('모든 줄을 순서대로, 우리 태그만 벗겨 돌려준다', () => {
    const note = '[admin 2026-09-01] 내림 · 폐업\n[admin 2026-09-10] 되살림\n\n[폐업] 손글씨';
    expect(noteHistory(note)).toEqual(['2026-09-01 내림 · 폐업', '2026-09-10 되살림', '[폐업] 손글씨']);
  });

  it('비어 있으면 빈 배열', () => {
    expect(noteHistory(null)).toEqual([]);
  });
});

describe('placeAddressPatch', () => {
  it('빈 주소를 채우면 그 칸만 쓴다', () => {
    const row = place({ address: null });
    expect(placeAddressPatch(row, { ...placeAddressDraft(row), address: ' 제주 서귀포시 안덕면 1 ' })).toEqual({
      address: '제주 서귀포시 안덕면 1',
    });
  });

  it('아무것도 안 바뀌면 null — 빈 update 로 재빌드를 헛돌리지 않는다', () => {
    const row = place({ address: '제주시 1', lat: 33.4, lng: 126.5 });
    expect(placeAddressPatch(row, placeAddressDraft(row))).toBeNull();
  });

  it('좌표는 두 칸을 함께 쓴다', () => {
    const row = place({ lat: 33.4, lng: 126.5 });
    expect(placeAddressPatch(row, { address: '', lat: '33.3', lng: '126.5' })).toEqual({ lat: 33.3, lng: 126.5 });
  });

  it('주소를 비우면 null 로 지운다', () => {
    const row = place({ address: '제주시 1' });
    expect(placeAddressPatch(row, { address: '  ', lat: '', lng: '' })).toEqual({ address: null });
  });
});

describe('placeAddressProblem', () => {
  it('좌표 한 칸만 채우면 막는다', () => {
    expect(placeAddressProblem({ address: '', lat: '33.3', lng: '' })).toMatch('둘 다');
  });

  it('위·경도를 뒤바꾸면 막는다', () => {
    expect(placeAddressProblem({ address: '', lat: '126.5', lng: '33.3' })).toMatch('제주 밖');
  });

  it('주소만 고치는 것은 된다', () => {
    expect(placeAddressProblem({ address: '제주시 1', lat: '', lng: '' })).toBeNull();
  });
});

describe('markPlaceVerified · 확인 날짜', () => {
  const fake = () => {
    const writes: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          writes.push(payload);
          const done = { data: { ...payload }, error: null };
          return { eq: () => Object.assign(Promise.resolve({ error: null }), { select: () => ({ single: () => Promise.resolve(done) }) }) };
        },
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;
    return { writes, client };
  };

  it('칸이 없는 원격에는 쓰지 않는다 — 없는 칸을 쓰면 승인 전체가 실패한다', async () => {
    const { writes, client } = fake();
    expect(await markPlaceVerified(client, { id: 'p1' }, '2026-10-01T00:00:00.000Z')).toBeNull();
    expect(writes).toEqual([]);
    expect(await markPlaceVerified(client, { id: 'p1', verified_at: null }, '2026-10-01T00:00:00.000Z')).toBe('2026-10-01T00:00:00.000Z');
    expect(writes).toEqual([{ verified_at: '2026-10-01T00:00:00.000Z' }]);
    expect(hasVerifiedColumn([{ id: 'a' }, { id: 'b', verified_at: null }])).toBe(true);
  });
});

describe('seedVerifyTargets — 시드 확인 날짜(11 H.6)', () => {
  it('notion 이고 칸이 있고 비어 있는 행만', () => {
    const row = (id: string, over: Record<string, unknown>) => ({ id, source: 'notion', verified_at: null, ...over }) as unknown as TPlaceRow;
    const noColumn = { id: 'x', source: 'notion' } as unknown as TPlaceRow;
    const out = seedVerifyTargets([row('a', {}), row('b', { source: 'blog' }), row('c', { verified_at: '2026-10-01' }), noColumn]);
    expect(out.map((place) => place.id)).toEqual(['a']);
  });
});

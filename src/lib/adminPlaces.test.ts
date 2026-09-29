import { describe, expect, it } from 'vitest';
import {
  archiveNoteLine,
  countPlacesByStatus,
  dayOf,
  lastNoteLine,
  matchesPlaceQuery,
  noteLineText,
  sortManagedPlaces,
} from './adminPlaces';
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

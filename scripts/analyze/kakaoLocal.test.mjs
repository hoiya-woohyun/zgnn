import { describe, expect, it } from 'vitest';
import places from '../../src/data/places.json' with { type: 'json' };
import { parseRegion } from '../lib/placeFields.mjs';
import { extractAddressUnits, inferRegionRaw, pickKakaoPlace, searchKakaoPlace, toKakaoQuery } from './kakaoLocal.mjs';

// Kakao 응답 꼴 그대로 — x·y 는 문자열이다.
const doc = (over) => ({
  id: '1118214877',
  place_name: '솔숲펜션',
  address_name: '제주특별자치도 제주시 구좌읍 세화리 1234',
  road_address_name: '제주특별자치도 제주시 구좌읍 충렬로 141-15',
  x: '126.8488419',
  y: '33.5111848',
  category_name: '여행 > 숙박 > 펜션',
  place_url: 'http://place.map.kakao.com/1118214877',
  ...over,
});

const okResponse = (documents) => ({ ok: true, status: 200, json: async () => ({ documents }) });

describe('toKakaoQuery', () => {
  it("'제주 ' 접두를 붙인다", () => {
    expect(toKakaoQuery('솔숲펜션')).toBe('제주 솔숲펜션');
  });
  it("이미 '제주' 로 시작하면 겹쳐 붙이지 않는다", () => {
    expect(toKakaoQuery('제주애견펜션 쉼멍스테이')).toBe('제주애견펜션 쉼멍스테이');
    expect(toKakaoQuery('  제주 솔숲펜션 ')).toBe('제주 솔숲펜션');
  });
});

describe('searchKakaoPlace', () => {
  const KEY = 'test-rest-key-do-not-log';

  it('키는 Authorization 헤더에만, query 는 접두 붙여 URL 에 넣고 documents 를 돌려준다', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return okResponse([doc()]);
    };
    const documents = await searchKakaoPlace('솔숲펜션', KEY, fetchImpl);

    expect(documents).toHaveLength(1);
    expect(documents[0].place_name).toBe('솔숲펜션');
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://dapi.kakao.com/v2/local/search/keyword.json');
    expect(url.searchParams.get('query')).toBe('제주 솔숲펜션');
    expect(calls[0].url).not.toContain(KEY);
    expect(calls[0].init.headers.Authorization).toBe(`KakaoAK ${KEY}`);
  });

  it('결과가 없으면 []', async () => {
    expect(await searchKakaoPlace('없는가게', KEY, async () => okResponse([]))).toEqual([]);
    expect(await searchKakaoPlace('없는가게', KEY, async () => ({ ok: true, status: 200, json: async () => ({}) }))).toEqual([]);
  });

  it('비 2xx 면 status 와 query 만 담아 throw — 키·본문은 메시지에 없다', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ errorType: 'AccessDeniedError', message: 'secret body' }) });
    const error = await searchKakaoPlace('솔숲펜션', KEY, fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('status=401');
    expect(error.message).toContain('query=제주 솔숲펜션');
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain('secret body');
  });
});

describe('pickKakaoPlace', () => {

  it('같은 이름이 여럿이면 AI 가 읽은 읍·면(town)의 것을 우선한다 — 우도 카페살레 vs 본섬 동명', () => {
    const mainland = { place_name: '카페살레', address_name: '제주특별자치도 서귀포시 성산읍 고성리 1', x: '126.9', y: '33.45' };
    const udo = { place_name: '카페살레', address_name: '제주특별자치도 제주시 우도면 연평리 1', x: '126.95', y: '33.5' };
    expect(pickKakaoPlace([mainland, udo], { name: '카페살레', town: '우도면' }).address).toContain('우도면');
    expect(pickKakaoPlace([mainland, udo], { name: '카페살레', town: '성산읍' }).address).toContain('성산읍');
    // town 이 없거나 어느 결과에도 없으면 Kakao 정확도순 첫 것
    expect(pickKakaoPlace([mainland, udo], { name: '카페살레' }).address).toContain('성산읍');
    expect(pickKakaoPlace([mainland, udo], { name: '카페살레', town: '한림읍' }).address).toContain('성산읍');
  });

  it('부분 일치(0.7)는 받지 않는다 — "고기부엌" 에 "협재고기부엌" 이 오면 null (엉뚱한 좌표가 places 에 쓰인다)', () => {
    const docs = [{ place_name: '협재고기부엌', address_name: '제주특별자치도 제주시 한림읍 협재리 1', x: '126.2', y: '33.4' }];
    expect(pickKakaoPlace(docs, { name: '고기부엌' })).toBeNull();
    expect(pickKakaoPlace([{ ...docs[0], place_name: '고기부엌 협재점' }], { name: '고기부엌' })).toBeNull();
    expect(pickKakaoPlace([{ ...docs[0], place_name: '고기부엌' }], { name: '고기부엌' })).not.toBeNull();
  });
  it('x 는 lng, y 는 lat — 그리고 문자열이 아니라 숫자로', () => {
    const picked = pickKakaoPlace([doc()], { name: '솔숲펜션' });
    expect(picked.lat).toBe(33.5111848);
    expect(picked.lng).toBe(126.8488419);
    expect(typeof picked.lat).toBe('number');
    expect(typeof picked.lng).toBe('number');
  });

  it('도로명 주소를 우선하고 "제주특별자치도" 는 기존 86곳처럼 "제주" 로 줄인다', () => {
    const picked = pickKakaoPlace([doc()], { name: '솔숲펜션' });
    expect(picked.address).toBe('제주 제주시 구좌읍 충렬로 141-15');
    expect(picked.kakaoPlaceUrl).toBe('http://place.map.kakao.com/1118214877');
    expect(picked.category).toBe('펜션');
  });

  it('도로명 주소가 비어 있으면 지번 주소', () => {
    const picked = pickKakaoPlace([doc({ road_address_name: '' })], { name: '솔숲펜션' });
    expect(picked.address).toBe('제주 제주시 구좌읍 세화리 1234');
  });

  it('제주 밖 주소는 이름이 같아도 버린다', () => {
    const busan = doc({ address_name: '부산 해운대구 우동 123', road_address_name: '부산 해운대구 해운대로 1' });
    expect(pickKakaoPlace([busan], { name: '솔숲펜션' })).toBeNull();
  });

  it('여럿이면 이름이 가장 닮은 것을 고른다 — 순서가 앞이라도 이름이 다르면 지지 않는다', () => {
    const other = doc({ id: '2', place_name: '평대코지카페', x: '126.9', y: '33.4' });
    const target = doc({ id: '3', place_name: '카페살레', x: '126.95', y: '33.5' });
    const picked = pickKakaoPlace([other, target], { name: '살레' });
    expect(picked.lng).toBe(126.95);
    expect(picked.lat).toBe(33.5);
  });

  it('이름이 닮은 것이 하나도 없으면 null — 좌표를 지어내지 않는다', () => {
    expect(pickKakaoPlace([doc({ place_name: '전혀다른가게' })], { name: '솔숲펜션' })).toBeNull();
    expect(pickKakaoPlace([], { name: '솔숲펜션' })).toBeNull();
  });

  it('좌표가 숫자로 안 읽히는 문서는 건너뛴다 — 빈 문자열이 (0, 0) 이 되면 안 된다', () => {
    expect(pickKakaoPlace([doc({ x: '', y: '' })], { name: '솔숲펜션' })).toBeNull();
    expect(pickKakaoPlace([doc({ x: '  ', y: '33.5' })], { name: '솔숲펜션' })).toBeNull();
    expect(pickKakaoPlace([doc({ x: undefined, y: undefined })], { name: '솔숲펜션' })).toBeNull();
    expect(pickKakaoPlace([doc({ x: 'abc', y: '33.5' })], { name: '솔숲펜션' })).toBeNull();
  });
});

describe('extractAddressUnits — 한글엔 \\b 가 없다', () => {
  it('읍·면·동은 토큰 단위로만 잡는다', () => {
    expect(extractAddressUnits('제주 제주시 조천읍 중산간동로 1364 1층')).toEqual({ eupMyeon: '조천읍', si: '제주시' });
    expect(extractAddressUnits('제주 제주시 탑동로11길 6 2층 궁서체')).toEqual({ si: '제주시' });
    expect(extractAddressUnits('제주특별자치도 서귀포시 안덕면 일주서로1488번길 9')).toEqual({ eupMyeon: '안덕면', si: '서귀포시' });
    expect(extractAddressUnits('제주특별자치도 제주시 연동 123-4')).toEqual({ dong: '연동', si: '제주시' });
  });
  it('없으면 빈 객체', () => {
    expect(extractAddressUnits('')).toEqual({});
    expect(extractAddressUnits(undefined)).toEqual({});
  });
});

describe('inferRegionRaw — 실제 86곳으로', () => {
  it('읍·면 → 기존 데이터의 방향', () => {
    expect(inferRegionRaw('제주특별자치도 제주시 구좌읍 해맞이해안로 1140', places)).toBe('동쪽 (구좌읍)');
    expect(inferRegionRaw('제주 제주시 애월읍 애월해안로 907', places)).toBe('서쪽 (애월읍)');
    expect(inferRegionRaw('제주 서귀포시 표선면 토산중앙로 487-134', places)).toBe('남쪽 (표선면)');
  });

  it('우도는 기존 행과 같은 "우도면"', () => {
    expect(inferRegionRaw('제주특별자치도 제주시 우도면 우도해안길 816', places)).toBe('우도면');
  });

  it('읍·면이 없는 시내 주소는 시 로 — 기존 데이터의 "북쪽 (제주시)"·"남쪽 (서귀포시)"', () => {
    expect(inferRegionRaw('제주 제주시 탑동로11길 6 2층', places)).toBe('북쪽 (제주시)');
    expect(inferRegionRaw('제주특별자치도 제주시 노형동 123', places)).toBe('북쪽 (제주시)');
    expect(inferRegionRaw('제주 서귀포시 소보리당로 200', places)).toBe('남쪽 (서귀포시)');
  });

  it('기존 데이터에서 방향이 갈리는 읍·면(안덕면 남 1 · 서 1)은 정하지 않는다 — 시 로 뭉개지도 않는다', () => {
    expect(inferRegionRaw('제주 서귀포시 안덕면 일주서로1488번길 9', places)).toBe('');
  });

  it('기존 데이터에 없는 읍·면이나 빈 주소는 ""', () => {
    expect(inferRegionRaw('제주 제주시 없는읍 어딘가 1', places)).toBe('');
    expect(inferRegionRaw('', places)).toBe('');
    expect(inferRegionRaw('제주 제주시 구좌읍 해맞이해안로 1140', [])).toBe('');
  });

  it('동수가 아니면 다수결', () => {
    const existing = [
      { region: { direction: 'south', town: '안덕면' } },
      { region: { direction: 'south', town: '안덕면' } },
      { region: { direction: 'west', town: '안덕면' } },
    ];
    expect(inferRegionRaw('제주 서귀포시 안덕면 사계리 1', existing)).toBe('남쪽 (안덕면)');
  });

  it('parseRegion 과 왕복 — town 과 direction 이 그대로 돌아온다', () => {
    const cases = [
      ['제주 제주시 구좌읍 해맞이해안로 1140', '구좌읍', 'east'],
      ['제주 서귀포시 남원읍 태위로360번길 192', '남원읍', 'south'],
      ['제주 제주시 한경면 청수로 14', '한경면', 'west'],
      ['제주 제주시 우도면 우도해안길 876', '우도면', 'udo'],
      ['제주 제주시 1100로 2894-49 1층', '제주시', 'north'],
    ];
    for (const [address, town, direction] of cases) {
      const parsed = parseRegion(inferRegionRaw(address, places));
      expect(parsed.town, address).toBe(town);
      expect(parsed.direction, address).toBe(direction);
    }
  });

  it('기존 86곳 전부: region.raw 를 주소에서 다시 만들면 raw 와 같은 town·direction 으로 파싱된다(주소·읍면이 있는 곳만)', () => {
    let checked = 0;
    for (const place of places) {
      if (!place.address) continue;
      const { eupMyeon } = extractAddressUnits(place.address);
      // 주소와 region 이 어긋난 행(주소는 애월읍인데 raw 는 "북쪽 (제주시)" 등)은 데이터 문제라 여기서 판정하지 않는다.
      if (!eupMyeon || eupMyeon !== place.region.town) continue;
      const inferred = inferRegionRaw(place.address, places);
      if (inferred === '') continue; // 안덕면처럼 방향이 갈리는 town
      expect(parseRegion(inferred).direction, place.name).toBe(place.region.direction);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(60);
  });
});

import { describe, expect, it } from 'vitest';
import places from '../../src/data/places.json' with { type: 'json' };
import { parseRegion } from '../lib/placeFields.mjs';
import { extractAddressUnits, inferRegionRaw, newPickReasons, parseNaverCoord, pickNaverPlace, searchNaverPlace, stripTags, toNaverQuery } from './naverLocal.mjs';

// 네이버 응답 꼴 그대로 — mapx/mapy 는 WGS84 를 10^7 배한 정수, title 엔 <b> 가 섞인다.
const item = (over) => ({
  title: '<b>솔숲펜션</b>',
  link: '',
  category: '숙박>펜션',
  description: '',
  telephone: '',
  address: '제주특별자치도 제주시 구좌읍 세화리 1234',
  roadAddress: '제주특별자치도 제주시 구좌읍 충렬로 141-15',
  mapx: '1268488419',
  mapy: '335111848',
  ...over,
});

const okResponse = (items) => ({ ok: true, status: 200, json: async () => ({ items }) });

describe('toNaverQuery', () => {
  it("'제주 ' 접두를 붙인다", () => {
    expect(toNaverQuery('솔숲펜션')).toBe('제주 솔숲펜션');
  });
  it("이미 '제주' 로 시작하면 겹쳐 붙이지 않는다", () => {
    expect(toNaverQuery('제주애견펜션 쉼멍스테이')).toBe('제주애견펜션 쉼멍스테이');
    expect(toNaverQuery('  제주 솔숲펜션 ')).toBe('제주 솔숲펜션');
  });
});

describe('stripTags — 안 벗기면 이름이 영영 안 맞는다', () => {
  it('<b> 강조 태그와 HTML 엔티티를 벗긴다', () => {
    expect(stripTags('제주 <b>솔숲펜션</b>')).toBe('제주 솔숲펜션');
    expect(stripTags('카페 &amp; 베이커리')).toBe('카페 & 베이커리');
    expect(stripTags(undefined)).toBe('');
  });
});

describe('parseNaverCoord — 문서가 스스로 모순되는 자리', () => {
  it('10^7 로 나눈다', () => {
    expect(parseNaverCoord('1268488419')).toBeCloseTo(126.8488419, 7);
    expect(parseNaverCoord('335111848')).toBeCloseTo(33.5111848, 7);
  });
  it('소수 문자열은 이미 도(degree) 단위로 본다 — 나누면 0 이 되어 보강이 통째로 no-op 이 된다', () => {
    // 이 브랜치는 실제 응답을 한 번도 못 봤다. 포맷이 소수였을 경우 전 건이 NaN 으로 떨어지는
    // 대신 그대로 읽고, 제주 범위인지로 판별한다(아래 inJeju 테스트).
    expect(parseNaverCoord('126.8488419')).toBeCloseTo(126.8488419, 7);
    expect(parseNaverCoord('33.5111848')).toBeCloseTo(33.5111848, 7);
    expect(parseNaverCoord('-33.5')).toBeCloseTo(-33.5, 7);
  });
  it('숫자가 아니면 NaN — 빈 문자열이 (0, 0) 좌표로 둔갑하지 않게', () => {
    expect(parseNaverCoord('')).toBeNaN();
    expect(parseNaverCoord('  ')).toBeNaN();
    expect(parseNaverCoord(undefined)).toBeNaN();
    expect(parseNaverCoord('abc')).toBeNaN();
    expect(parseNaverCoord('12.3.4')).toBeNaN();
    expect(parseNaverCoord('126.')).toBeNaN();
  });
});

describe('searchNaverPlace', () => {
  const KEYS = { clientId: 'test-id-do-not-log', clientSecret: 'test-secret-do-not-log' };

  it('키는 헤더에만, query 는 접두 붙여 URL 에 넣고 display 상한 5 로 items 를 돌려준다', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return okResponse([item()]);
    };
    const items = await searchNaverPlace('솔숲펜션', KEYS, fetchImpl);

    expect(items).toHaveLength(1);
    const url = new URL(calls[0].url);
    // API HUB 다(개발자센터 아님 — BUG-006). 호스트·경로·헤더 이름이 전부 다르고, **셋 중 하나만 틀려도 401 이라 구별이 안 된다.**
    expect(url.origin + url.pathname).toBe('https://naverapihub.apigw.ntruss.com/search/v1/local');
    expect(url.searchParams.get('query')).toBe('제주 솔숲펜션');
    expect(url.searchParams.get('display')).toBe('5');
    expect(calls[0].url).not.toContain(KEYS.clientId);
    expect(calls[0].url).not.toContain(KEYS.clientSecret);
    expect(calls[0].init.headers['X-NCP-APIGW-API-KEY-ID']).toBe(KEYS.clientId);
    expect(calls[0].init.headers['X-NCP-APIGW-API-KEY']).toBe(KEYS.clientSecret);
    // 옛 헤더가 남아 있으면 안 된다 — 둘 다 보내면 어느 쪽으로 통과했는지 모르게 된다.
    expect(calls[0].init.headers['X-Naver-Client-Id']).toBeUndefined();
  });

  it('결과가 없으면 []', async () => {
    expect(await searchNaverPlace('없는가게', KEYS, async () => okResponse([]))).toEqual([]);
    expect(await searchNaverPlace('없는가게', KEYS, async () => ({ ok: true, status: 200, json: async () => ({}) }))).toEqual([]);
  });

  it('비 2xx 면 status 와 query 만 담아 throw — 키·본문은 메시지에 없다', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ errorMessage: 'secret body', errorCode: '024' }) });
    const error = await searchNaverPlace('솔숲펜션', KEYS, fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('status=401');
    expect(error.message).toContain('query=제주 솔숲펜션');
    expect(error.message).not.toContain(KEYS.clientId);
    expect(error.message).not.toContain(KEYS.clientSecret);
    expect(error.message).not.toContain('secret body');
  });
});

describe('pickNaverPlace', () => {
  it('mapx 는 lng, mapy 는 lat — 그리고 10^7 로 나눈 숫자로', () => {
    const picked = pickNaverPlace([item()], { name: '솔숲펜션' });
    expect(picked.lat).toBeCloseTo(33.5111848, 7);
    expect(picked.lng).toBeCloseTo(126.8488419, 7);
  });

  it('title 의 <b> 를 벗기고 이름을 맞춘다', () => {
    expect(pickNaverPlace([item({ title: '<b>솔숲</b>펜션' })], { name: '솔숲펜션' })).not.toBeNull();
  });

  it('탈락 사유를 구분해 센다 — "포맷이 틀렸다" 와 "이름이 안 맞았다" 가 똑같이 null 로 보이지 않게', () => {
    // 좌표 포맷이 우리가 아는 것과 다른 경우(KATECH). 첫 실행이 곧 포맷의 실측이라
    // 이 계수가 없으면 운영자가 볼 단서는 "후보 N건" 뿐이다.
    const coordBad = newPickReasons();
    expect(pickNaverPlace([item({ mapx: '311277', mapy: '552097' })], { name: '솔숲펜션' }, coordBad)).toBeNull();
    expect(coordBad.coordOutOfJeju).toBe(1);
    expect(coordBad.nameMismatch).toBe(0);
    expect(coordBad.itemsButNoPick).toBe(1);
    expect(coordBad.sample).toEqual({ mapx: '311277', mapy: '552097' });

    // 좌표는 멀쩡한데 이름이 다른 경우 — 같은 null 이지만 사유가 갈린다.
    const nameBad = newPickReasons();
    expect(pickNaverPlace([item({ title: '<b>협재고기부엌</b>' })], { name: '고기부엌' }, nameBad)).toBeNull();
    expect(nameBad.nameMismatch).toBe(1);
    expect(nameBad.coordOutOfJeju).toBe(0);
    expect(nameBad.coordUnparsable).toBe(0);

    // 파싱 자체가 안 되는 경우는 또 다른 칸으로.
    const unparsable = newPickReasons();
    expect(pickNaverPlace([item({ mapx: 'abc', mapy: 'def' })], { name: '솔숲펜션' }, unparsable)).toBeNull();
    expect(unparsable.coordUnparsable).toBe(1);
    expect(unparsable.coordOutOfJeju).toBe(0);

    // 제주 밖 주소는 좌표를 보기도 전에 떨어진다 — 사유 5개 중 이것만 안 덮여 있었다.
    const notJeju = newPickReasons();
    const busan = item({ address: '부산 해운대구 우동 123', roadAddress: '부산 해운대구 해운대로 1' });
    expect(pickNaverPlace([busan], { name: '솔숲펜션' }, notJeju)).toBeNull();
    expect(notJeju.notJejuAddress).toBe(1);
    expect(notJeju.coordUnparsable).toBe(0);
    expect(notJeju.coordOutOfJeju).toBe(0);
    expect(notJeju.nameMismatch).toBe(0);
  });

  it('이름만 안 맞아 0건이면 sample 이 null — ⚠️ 좌표 포맷 경고가 안 뜨는 것이 의도다', () => {
    /*
     * `analyze-candidates.mjs` 의 ⚠️ 표본 출력은 `picked === 0 && r.sample` 로 게이트된다.
     * 좌표는 멀쩡한데 이름만 안 맞아 0건인 경우까지 "포맷이 틀렸다" 는 경고를 띄우면
     * 첫 실행의 진단이 거꾸로 흐린다. sample 은 **좌표 때문에 떨어졌을 때만** 채워진다.
     */
    const nameOnly = newPickReasons();
    expect(pickNaverPlace([item({ title: '<b>협재고기부엌</b>' })], { name: '고기부엌' }, nameOnly)).toBeNull();
    expect(nameOnly.nameMismatch).toBe(1);
    expect(nameOnly.sample).toBeNull();
  });

  it('reasons 를 안 넘겨도 동작한다 — 계수는 선택이다', () => {
    expect(pickNaverPlace([item()], { name: '솔숲펜션' })).not.toBeNull();
  });

  it('옛 KATECH 값이 오면 제주 범위 밖이라 버린다 — 문서 예제가 그 꼴이다', () => {
    // 공식 문서 응답 예제의 값. /1e7 하면 0.031·0.055 라 제주가 아니다.
    expect(pickNaverPlace([item({ mapx: '311277', mapy: '552097' })], { name: '솔숲펜션' })).toBeNull();
  });

  it('제주 범위를 벗어난 좌표는 주소가 제주라도 버린다', () => {
    expect(pickNaverPlace([item({ mapx: '1269000000', mapy: '375000000' })], { name: '솔숲펜션' })).toBeNull();
  });

  it('같은 이름이 여럿이면 AI 가 읽은 읍·면(town)의 것을 우선한다 — 우도 카페살레 vs 본섬 동명', () => {
    const mainland = item({ title: '카페살레', address: '제주특별자치도 서귀포시 성산읍 고성리 1', roadAddress: '', mapx: '1269000000', mapy: '334500000' });
    const udo = item({ title: '카페살레', address: '제주특별자치도 제주시 우도면 연평리 1', roadAddress: '', mapx: '1269500000', mapy: '335000000' });
    expect(pickNaverPlace([mainland, udo], { name: '카페살레', town: '우도면' }).address).toContain('우도면');
    expect(pickNaverPlace([mainland, udo], { name: '카페살레', town: '성산읍' }).address).toContain('성산읍');
    expect(pickNaverPlace([mainland, udo], { name: '카페살레' }).address).toContain('성산읍');
    expect(pickNaverPlace([mainland, udo], { name: '카페살레', town: '한림읍' }).address).toContain('성산읍');
  });

  it('부분 일치는 받지 않는다 — "고기부엌" 에 "협재고기부엌" 이 오면 null', () => {
    const docs = [item({ title: '협재고기부엌', address: '제주특별자치도 제주시 한림읍 협재리 1', roadAddress: '' })];
    expect(pickNaverPlace(docs, { name: '고기부엌' })).toBeNull();
    expect(pickNaverPlace([item({ title: '고기부엌 협재점', roadAddress: '' })], { name: '고기부엌' })).toBeNull();
    expect(pickNaverPlace([item({ title: '고기부엌', roadAddress: '' })], { name: '고기부엌' })).not.toBeNull();
  });

  it('도로명 주소를 우선하고 "제주특별자치도" 는 기존 86곳처럼 "제주" 로 줄인다', () => {
    const picked = pickNaverPlace([item()], { name: '솔숲펜션' });
    expect(picked.address).toBe('제주 제주시 구좌읍 충렬로 141-15');
    expect(picked.category).toBe('펜션');
  });

  it('도로명 주소가 비어 있으면 지번 주소', () => {
    expect(pickNaverPlace([item({ roadAddress: '' })], { name: '솔숲펜션' }).address).toBe('제주 제주시 구좌읍 세화리 1234');
  });

  it('link 는 비어 있으면 null — 문서 예제부터 비어 있다', () => {
    expect(pickNaverPlace([item()], { name: '솔숲펜션' }).naverLink).toBeNull();
    expect(pickNaverPlace([item({ link: 'https://example.com' })], { name: '솔숲펜션' }).naverLink).toBe('https://example.com');
  });

  it('제주 밖 주소는 이름이 같아도 버린다', () => {
    const busan = item({ address: '부산 해운대구 우동 123', roadAddress: '부산 해운대구 해운대로 1' });
    expect(pickNaverPlace([busan], { name: '솔숲펜션' })).toBeNull();
  });

  it('이름이 닮은 것이 하나도 없으면 null — 좌표를 지어내지 않는다', () => {
    expect(pickNaverPlace([item({ title: '전혀다른가게' })], { name: '솔숲펜션' })).toBeNull();
    expect(pickNaverPlace([], { name: '솔숲펜션' })).toBeNull();
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

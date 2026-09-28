import { describe, expect, it } from 'vitest';
import {
  addressSpecificity,
  formatGeocodeSummary,
  geocodeAddress,
  isSpecificAddress,
  newGeocodeReasons,
  pickGeocoded,
  shouldGeocode,
} from './naverGeocode.mjs';

/*
 * 픽스처의 출처 — **공식 문서 + 제3자 실제 응답 캡처**(2026-09-28 조사)다. 우리 키로 부른 적은 아직 없다
 * (키가 Claude 세션에 없다 — docs/todo/README.md 의 ⚠️). 그래서 테스트를 두 겹으로 둔다:
 *   1. 확인된 모양(x=경도 소수 문자열 · 9칸 addressElements)이 왔을 때 **채택된다**.
 *   2. 그 모양이 틀렸을 때(정수 · 스왑 · 필드 없음 · v2 로 감싸임) **틀린 좌표가 나가지 않는다**.
 * 우리 실행의 실측이 생기면 1 의 픽스처를 그 응답으로 바꾼다.
 */

/** 문서가 말하는 응답 한 건. 애월읍 상가로1길 11-15(요호르기 스테이 주소 — docs/todo/03 의 표). */
const address = (over = {}) => ({
  roadAddress: '제주특별자치도 제주시 애월읍 상가로1길 11-15',
  jibunAddress: '제주특별자치도 제주시 애월읍 상가리 1234',
  englishAddress: '11-15, Sangga-ro 1-gil, Aewol-eup, Jeju-si, Jeju-do',
  x: '126.3709800',
  y: '33.4620900',
  distance: 0,
  // ⚠️ 9칸이 **항상 다 온다**(실측). 없는 성분은 빠지는 게 아니라 longName 이 '' 다 — RI·BUILDING_NAME·LAND_NUMBER 가 그 예다.
  // code 는 POSTAL_CODE 조차 '' 이고 값은 longName 에 있다.
  addressElements: [
    { types: ['SIDO'], longName: '제주특별자치도', shortName: '제주특별자치도', code: '' },
    { types: ['SIGUGUN'], longName: '제주시', shortName: '제주시', code: '' },
    { types: ['DONGMYUN'], longName: '애월읍', shortName: '애월읍', code: '' },
    { types: ['RI'], longName: '', shortName: '', code: '' },
    { types: ['ROAD_NAME'], longName: '상가로1길', shortName: '상가로1길', code: '' },
    { types: ['BUILDING_NUMBER'], longName: '11-15', shortName: '11-15', code: '' },
    { types: ['BUILDING_NAME'], longName: '', shortName: '', code: '' },
    { types: ['LAND_NUMBER'], longName: '', shortName: '', code: '' },
    { types: ['POSTAL_CODE'], longName: '63032', shortName: '63032', code: '' },
  ],
  ...over,
});

// ⚠️ `errorMessage: ''` 가 **200 OK 에도 온다**(문서는 "500 일 때만" 이라 적었지만 실제 캡처 둘 다 갖고 있다).
// 픽스처에 넣어 두는 이유 — 누가 나중에 "errorMessage 가 있으면 에러" 라는 분기를 더하면 이 테스트가 막는다.
const okBody = (addresses) => ({
  status: 'OK',
  meta: { totalCount: addresses.length, page: 1, count: addresses.length },
  addresses,
  errorMessage: '',
});

/** 우리가 물어본 주소. 픽스처의 roadAddress 와 번호(11-15)가 같아야 되울림 검사를 통과한다. */
const ASKED = { address: '제주특별자치도 제주시 애월읍 상가로1길 11-15' };

/** pickGeocoded 는 인자가 셋이다(본문 · 물어본 주소 · 계수기). 테스트가 매번 ASKED 를 적지 않게 감싼다. */
const pick = (body, reasons = null, asked = ASKED) => pickGeocoded(body, asked, reasons);

describe('addressSpecificity — 박스 검사가 못 보는 틀림을 여기서 막는다', () => {
  it('도로명 + 건물번호가 있으면 통과한다(docs/todo/03 의 실측 주소 5개)', () => {
    for (const addr of [
      '제주특별자치도 제주시 애월읍 상가로1길 11-15',
      '제주특별자치도 제주시 애월읍 일주서로 6935 1층',
      '제주특별자치도 서귀포시 안덕면 평화로 486',
      '제주특별자치도 제주시 구좌읍 김녕로2길 6 1층',
      '제주특별자치도 제주시 구좌읍 김녕로1길 23',
    ]) {
      expect(addressSpecificity(addr), addr).toBe('');
    }
  });

  it('지번 주소(…리 1234 · …동 1234-5 · 산 12)도 한 점을 정한다', () => {
    expect(addressSpecificity('제주특별자치도 제주시 구좌읍 세화리 1234')).toBe('');
    expect(addressSpecificity('제주 제주시 노형동 1234-5')).toBe('');
    expect(addressSpecificity('제주특별자치도 서귀포시 성산읍 신풍리 산 12')).toBe('');
  });

  it('⚠️ 읍·면까지만 있는 주소는 막는다 — geocode 하면 읍 어딘가의 좌표를 정상으로 준다', () => {
    expect(addressSpecificity('제주특별자치도 제주시 애월읍')).toBe('noRoadOrLotName');
    expect(addressSpecificity('제주시 한림읍')).toBe('noRoadOrLotName');
    expect(addressSpecificity('제주특별자치도')).toBe('noRoadOrLotName');
  });

  it('도로명·지번 이름은 있는데 번호가 없으면 막는다 — 리(里)·로(路) 전체는 한 점이 아니다', () => {
    expect(addressSpecificity('제주 애월읍 곽지리')).toBe('noBuildingNumber');
    expect(addressSpecificity('제주시 구좌읍 중산간동로')).toBe('noBuildingNumber');
  });

  it('번호가 이름 토큰보다 앞에 있으면 인정하지 않는다 — 조각난 주소에 속지 않게', () => {
    expect(addressSpecificity('제주시 1234 애월읍 상가로1길')).toBe('noBuildingNumber');
  });

  it('제주가 아니면 호출하지 않는다 — 원주 「다한울미트타운」 같은 동명 함정이 쿼터를 쓰지 않게', () => {
    expect(addressSpecificity('서울특별시 강남구 테헤란로 152')).toBe('notJejuAddress');
    expect(addressSpecificity('강원도 원주시 흥업면 흥업리 123')).toBe('notJejuAddress');
  });

  it('도(province)를 생략해도 제주 읍·면 목록으로 구제한다 — 본문 주소는 앞머리를 자주 뺀다', () => {
    expect(addressSpecificity('애월읍 상가로1길 11-15')).toBe('');
  });

  it("'…가' 로 끝나는 말을 도로명으로 보지 않는다 — 제주에 그런 주소가 없다", () => {
    expect(addressSpecificity('제주 애월 어딘가')).toBe('noRoadOrLotName');
  });

  it('isSpecificAddress 는 같은 판정의 boolean 이다', () => {
    expect(isSpecificAddress('제주특별자치도 서귀포시 안덕면 평화로 486')).toBe(true);
    expect(isSpecificAddress('제주특별자치도 제주시 애월읍')).toBe(false);
    expect(isSpecificAddress(null)).toBe(false);
    expect(isSpecificAddress('')).toBe(false);
  });
});

describe('shouldGeocode — 사유를 세고, 부를지 정한다', () => {
  it('주소가 없으면 addressMissing 을 센다 — "주소가 없어서" 와 "주소가 거칠어서" 는 고칠 곳이 다르다', () => {
    const reasons = newGeocodeReasons();
    expect(shouldGeocode(null, reasons)).toBe(false);
    expect(shouldGeocode('', reasons)).toBe(false);
    expect(shouldGeocode('   ', reasons)).toBe(false);
    expect(reasons.addressMissing).toBe(3);
    expect(reasons.addressNoRoadOrLotName).toBe(0);
  });

  it('거친 주소는 사유별로 센다', () => {
    const reasons = newGeocodeReasons();
    shouldGeocode('제주특별자치도 제주시 애월읍', reasons);
    shouldGeocode('제주 애월읍 곽지리', reasons);
    shouldGeocode('서울특별시 강남구 테헤란로 152', reasons);
    expect(reasons.addressNoRoadOrLotName).toBe(1);
    expect(reasons.addressNoBuildingNumber).toBe(1);
    expect(reasons.addressNotJeju).toBe(1);
    expect(reasons.addressMissing).toBe(0);
  });

  it('쓸 만한 주소면 true 이고 아무것도 세지 않는다', () => {
    const reasons = newGeocodeReasons();
    expect(shouldGeocode('제주특별자치도 서귀포시 안덕면 평화로 486', reasons)).toBe(true);
    expect(Object.values(reasons).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('reasons 를 안 넘겨도 터지지 않는다', () => {
    expect(shouldGeocode('제주특별자치도 제주시 애월읍')).toBe(false);
  });
});

describe('pickGeocoded — 문서가 말하는 모양이 오면 채택한다', () => {
  it('x=경도 · y=위도 로 읽고 주소 앞머리를 기존 86곳 꼴로 줄인다', () => {
    const reasons = newGeocodeReasons();
    const picked = pick(okBody([address()]), reasons);
    expect(picked).not.toBeNull();
    expect(picked.lng).toBeCloseTo(126.37098, 5);
    expect(picked.lat).toBeCloseTo(33.46209, 5);
    expect(picked.address).toBe('제주 제주시 애월읍 상가로1길 11-15');
    expect(reasons.sample).toBeNull();
  });

  it('roadAddress 가 비면 jibunAddress 로 물러선다(지번으로 물었을 때)', () => {
    const picked = pick(okBody([address({ roadAddress: '' })]), null, { address: '제주특별자치도 제주시 애월읍 상가리 1234' });
    expect(picked.address).toBe('제주 제주시 애월읍 상가리 1234');
  });

  it('지번으로 물어도 도로명이 함께 오면 통과한다 — 되울림은 두 주소를 합쳐 본다', () => {
    // 같은 건물의 도로명 번호(11-15)와 지번 번호(1234)는 다르다. 한쪽만 보면 정상 응답을 탈락시킨다.
    const picked = pick(okBody([address()]), null, { address: '제주특별자치도 제주시 애월읍 상가리 1234' });
    expect(picked).not.toBeNull();
  });

  it('⚠️ 지번 주소는 BUILDING_NUMBER 가 비고 LAND_NUMBER 만 찬다 — 첫 빈 칸에서 포기하면 안 된다', () => {
    const picked = pick(
      okBody([
        address({
          roadAddress: '',
          addressElements: [
            { types: ['SIDO'], longName: '제주특별자치도', shortName: '제주', code: '' },
            { types: ['ROAD_NAME'], longName: '', shortName: '', code: '' },
            { types: ['BUILDING_NUMBER'], longName: '', shortName: '', code: '' },
            { types: ['LAND_NUMBER'], longName: '1234', shortName: '1234', code: '' },
          ],
        }),
      ]),
      null,
      { address: '제주특별자치도 제주시 애월읍 상가리 1234' },
    );
    expect(picked).not.toBeNull();
    expect(picked.address).toBe('제주 제주시 애월읍 상가리 1234');
  });

  it("문서 표의 `type`(단수) 철자로 와도 읽는다 — 표와 예제가 서로 다르다", () => {
    const reasons = newGeocodeReasons();
    const picked = pick(
      okBody([
        address({
          addressElements: [
            { type: ['BUILDING_NUMBER'], longName: '11-15', shortName: '11-15', code: '' },
          ],
        }),
      ]),
      reasons,
    );
    expect(picked).not.toBeNull();
    expect(reasons.elementsUnknownShape).toBe(0); // 모양을 알아봤다는 뜻 — 방어가 살아 있다
  });

  it('종류가 배열이 아니라 문자열 하나로 와도 읽는다', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address({ addressElements: [{ types: 'BUILDING_NUMBER', longName: '11-15' }] })]), reasons)).not.toBeNull();
    expect(reasons.elementsUnknownShape).toBe(0);
  });

  it('브라우저 SDK 처럼 v2 로 감싸여 와도 풀어서 읽는다 — 한쪽만 받으면 전 건 no-op 이 된다', () => {
    const reasons = newGeocodeReasons();
    const picked = pick({ v2: okBody([address()]) }, reasons);
    expect(picked).not.toBeNull();
    expect(picked.lng).toBeCloseTo(126.37098, 5);
    expect(reasons.noResult).toBe(0);
  });
});

describe('pickGeocoded — 가정이 틀렸을 때 틀린 좌표가 나가지 않는다', () => {
  it('x/y 가 뒤집혀 오면 제주 범위 밖이라 버린다', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address({ x: '33.4620900', y: '126.3709800' })]), reasons)).toBeNull();
    expect(reasons.coordOutOfJeju).toBe(1);
    expect(reasons.sample).toMatchObject({ x: '33.4620900', y: '126.3709800', xType: 'string' });
    expect(reasons.sample.elementKeys).toBe('types|longName|shortName|code'); // 문서 모순(type/types)을 닫는 한 줄
  });

  it('정수로 오면 10^7 포맷으로 읽는다 — 지역검색과 같은 파서를 쓰기 때문이다', () => {
    // 이 브랜치는 "혹시 지역검색과 같은 포맷이면" 을 위한 것이다. 맞으면 통과하고, 6자리 KATECH 이면 범위 밖이라 버려진다.
    expect(pick(okBody([address({ x: '1263709800', y: '334620900' })])).lng).toBeCloseTo(126.37098, 5);
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address({ x: '311277', y: '552091' })]), reasons)).toBeNull();
    expect(reasons.coordOutOfJeju).toBe(1);
  });

  it('좌표가 숫자가 아니면 파싱실패로 센다 — 빈 문자열이 (0,0) 으로 둔갑하지 않게', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address({ x: '', y: '' })]), reasons)).toBeNull();
    expect(reasons.coordUnparsable).toBe(1);
  });

  it('⚠️ addressElements 가 없거나 모양이 다르면 닫지 않고 물러선다 — fail-closed 면 보강이 100% no-op 이 된다', () => {
    for (const elements of [undefined, [], [{ foo: 'bar' }], 'not-an-array']) {
      const reasons = newGeocodeReasons();
      const picked = pick(okBody([address({ addressElements: elements })]), reasons);
      expect(picked, JSON.stringify(elements)).not.toBeNull();
      expect(reasons.elementsUnknownShape).toBe(1);
      expect(reasons.noBuildingNumber).toBe(0);
    }
  });

  it('types 는 읽혔고 건물번호만 없으면 그건 진짜 "없다" — 읍·면으로 풀린 것이라 막는다', () => {
    const reasons = newGeocodeReasons();
    const picked = pick(
      okBody([
        address({
          addressElements: [
            { types: ['SIDO'], longName: '제주특별자치도' },
            { types: ['SIGUGUN'], longName: '제주시' },
            { types: ['DONGMYUN'], longName: '애월읍' },
            { types: ['BUILDING_NUMBER'], longName: '' },
          ],
        }),
      ]),
      reasons,
    );
    expect(picked).toBeNull();
    expect(reasons.noBuildingNumber).toBe(1);
    expect(reasons.elementsUnknownShape).toBe(0);
  });

  it('제주 밖 주소는 좌표를 보기 전에 버린다', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address({ roadAddress: '서울특별시 강남구 테헤란로 152', jibunAddress: '' })]), reasons)).toBeNull();
    expect(reasons.notJejuAddress).toBe(1);
  });

  it('⚠️ "결과 0건" 과 "addresses 필드가 없다" 를 갈라 센다 — 전자는 정상, 후자는 코드를 고칠 일이다', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([]), reasons)).toBeNull();
    expect(reasons.noResult).toBe(1);
    expect(reasons.addressesFieldMissing).toBe(0);

    expect(pick({ status: 'INVALID_REQUEST', errorMessage: 'query is required' }, reasons)).toBeNull();
    expect(reasons.statusNotOk).toBe(1);

    expect(pick({}, reasons)).toBeNull();
    expect(pick(null, reasons)).toBeNull();
    expect(pick({ addresses: 'not-an-array' }, reasons)).toBeNull();
    expect(reasons.addressesFieldMissing).toBe(3);
    expect(reasons.noResult).toBe(1); // 늘지 않았다
  });

  it('status 필드가 없어도 addresses 가 있으면 채택한다 — 필드 이름이 다를 수 있고 진짜 판별은 좌표다', () => {
    expect(pick({ addresses: [address()] })).not.toBeNull();
  });

  it('⚠️ 한 주소가 100m 넘게 떨어진 여러 점으로 풀리면 아무것도 쓰지 않는다 — GEO_NEAR_M 이 판정을 가른다', () => {
    const reasons = newGeocodeReasons();
    // 33.46209 → 33.47209 는 약 1.1km.
    expect(pick(okBody([address(), address({ y: '33.4720900' })]), reasons)).toBeNull();
    expect(reasons.ambiguous).toBe(1);
  });

  it('여러 점이 100m 안이면 첫 점을 쓴다 — 같은 건물의 도로명·지번이 둘 다 온 경우다', () => {
    // 33.46209 → 33.46239 는 약 33m.
    const picked = pick(okBody([address(), address({ y: '33.4623900' })]));
    expect(picked).not.toBeNull();
    expect(picked.lat).toBeCloseTo(33.46209, 5);
  });

  it('제주 밖 결과가 섞여 있어도 남은 제주 결과로 판정한다(모호성 계산에 끌고 들어가지 않는다)', () => {
    const picked = pick(okBody([address({ roadAddress: '서울특별시 강남구 테헤란로 152', jibunAddress: '' }), address()]));
    expect(picked).not.toBeNull();
    expect(picked.lat).toBeCloseTo(33.46209, 5);
  });
});

describe('되울림 검사 — addressElements 에 의존하지 않는 독립 가드', () => {
  it('⚠️ 중심점 함정: 돌아온 주소에 내가 물어본 번호가 없으면 버린다', () => {
    // 실측된 모양 — 거친 질의에 status OK · totalCount 1 로 **입력을 되울린** 주소와 행정구역 중심점이 온다.
    // 되울린 문자열에는 숫자가 없으므로 번호 하나만 요구해도 전부 걸린다.
    const reasons = newGeocodeReasons();
    const centroid = pick(
      okBody([
        address({
          roadAddress: '제주특별자치도 제주시 애월읍',
          jibunAddress: '제주특별자치도 제주시 애월읍',
          addressElements: [{ types: ['DONGMYUN'], longName: '애월읍', shortName: '애월읍', code: '' }],
        }),
      ]),
      reasons,
    );
    expect(centroid).toBeNull();
    expect(reasons.numberNotEchoed).toBe(1);
  });

  it('⚠️ addressElements 를 못 읽어도 되울림 검사는 살아 있다 — 두 겹이 한 겹이 되지 않는다', () => {
    const reasons = newGeocodeReasons();
    const picked = pick(
      okBody([
        address({
          roadAddress: '제주특별자치도 제주시 애월읍',
          jibunAddress: '',
          addressElements: undefined, // 모양 미지 → hasBuildingNumber 는 null(채택 쪽으로 물러선다)
        }),
      ]),
      reasons,
    );
    expect(picked).toBeNull(); // 그래도 막혔다
    expect(reasons.numberNotEchoed).toBe(1);
    expect(reasons.elementsUnknownShape).toBe(0); // 되울림에서 먼저 떨어져 여기까진 오지 않았다
  });

  it('부번이 정규화돼 돌아와도(11-15 → 11) 통과한다 — 선두 번호로 본다', () => {
    const picked = pick(okBody([address({ roadAddress: '제주특별자치도 제주시 애월읍 상가로1길 11', jibunAddress: '' })]));
    expect(picked).not.toBeNull();
  });

  it('번호가 다른 건물이면 버린다', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address({ roadAddress: '제주특별자치도 제주시 애월읍 상가로1길 77', jibunAddress: '' })]), reasons)).toBeNull();
    expect(reasons.numberNotEchoed).toBe(1);
  });
});

describe('되울림 검사 — 리뷰가 잡은 구멍(회귀)', () => {
  it('🔴 도로명 안의 숫자에 걸리지 않는다 — "김녕로2길 2" 를 물었는데 도로 중심점 "김녕로2길" 이 오면 버린다', () => {
    // 옛 구현은 숫자 경계로만 봐서 물어본 "2" 가 **`김녕로2길` 안의 2** 에 걸려 통과했다.
    // 그리고 addressElements 가 안 읽히는 분기에서는 그게 유일한 방어라 두 겹이 0 겹이 됐다.
    // 제주 도로명은 숫자가 박힌 것이 흔하다(김녕로1길·김녕로2길·상가로1길 — 실측 표 5행 중 3행).
    const reasons = newGeocodeReasons();
    const picked = pick(
      okBody([
        address({
          roadAddress: '제주특별자치도 제주시 구좌읍 김녕로2길',
          jibunAddress: '',
          addressElements: undefined, // 모양 미지 → hasBuildingNumber 는 null(의도적 fail-open)
          x: '126.8285000',
          y: '33.5290000',
        }),
      ]),
      reasons,
      { address: '제주특별자치도 제주시 구좌읍 김녕로2길 2' },
    );
    expect(picked).toBeNull();
    expect(reasons.numberNotEchoed).toBe(1);
  });

  it('같은 도로의 실제 건물번호가 오면 통과한다 — 구멍을 막으면서 정상 경로를 죽이지 않았다', () => {
    const picked = pick(
      okBody([address({ roadAddress: '제주특별자치도 제주시 구좌읍 김녕로2길 2', jibunAddress: '' })]),
      null,
      { address: '제주특별자치도 제주시 구좌읍 김녕로2길 2' },
    );
    expect(picked).not.toBeNull();
  });

  it('물어본 번호가 없으면 채택하지 않는다 — 기본값이 가드를 조용히 끄는 통로였다', () => {
    const reasons = newGeocodeReasons();
    expect(pick(okBody([address()]), reasons, { address: '제주특별자치도 제주시 애월읍' })).toBeNull();
    expect(reasons.numberNotEchoed).toBe(1);
  });
});

describe('토큰화 — 쉼표·숫자 행정동(회귀)', () => {
  it('🔴 "관덕로 8, 2층" 의 쉼표 때문에 번호를 못 찾던 것을 고쳤다 — 본문 주소는 이 꼴로 적힌다', () => {
    for (const addr of [
      '제주특별자치도 제주시 관덕로 8, 2층',
      '제주특별자치도 제주시 첨단로 242, 1층',
      '제주 제주시 애월읍 상가로1길 11-15, 1층',
    ]) {
      expect(addressSpecificity(addr), addr).toBe('');
    }
  });

  it('숫자가 든 행정동(오라2동·이도2동)도 지번 주소로 인정한다', () => {
    expect(addressSpecificity('제주 제주시 오라2동 2402-1')).toBe('');
    expect(addressSpecificity('제주특별자치도 제주시 이도2동 1176-1')).toBe('');
  });
});

describe('pickGeocoded — 나머지 회귀', () => {
  it('longName 이 빈 문자열이면 shortName 으로 물러선다 — ?? 는 "" 를 값으로 본다', () => {
    const picked = pick(
      okBody([address({ addressElements: [{ types: ['BUILDING_NUMBER'], longName: '', shortName: '11-15', code: '' }] })]),
    );
    expect(picked).not.toBeNull();
  });

  it('건물번호없음 으로 떨어질 때도 표본을 남긴다 — 전 건이 여기서 떨어지면 진단이 표본 없이 끝났다', () => {
    const reasons = newGeocodeReasons();
    const picked = pick(
      okBody([
        address({
          addressElements: [
            { types: ['ROAD_NAME'], longName: '상가로1길', shortName: '상가로1길', code: '' },
            { types: ['BUILDING_NUMBER'], longName: '', shortName: '', code: '' },
            { types: ['LAND_NUMBER'], longName: '', shortName: '', code: '' },
          ],
        }),
      ]),
      reasons,
    );
    expect(picked).toBeNull();
    expect(reasons.noBuildingNumber).toBe(1);
    expect(reasons.sample).not.toBeNull();
    expect(reasons.sample.elementKeys).toBe('types|longName|shortName|code');
  });

  it('🔴 모호성을 쌍마다 본다 — 첫 점 기준으로만 재면 지름 180m 가 통과했다', () => {
    // 33.46209 를 가운데 두고 ±0.0008(약 89m)씩. 첫 점 기준 89m·89m 지만 둘 사이는 178m 다.
    const reasons = newGeocodeReasons();
    const picked = pick(
      okBody([address(), address({ y: '33.4612900' }), address({ y: '33.4628900' })]),
      reasons,
    );
    expect(picked).toBeNull();
    expect(reasons.ambiguous).toBe(1);
  });
});

describe('제주 범위 박스 — 두 구간이 서로소여야 스왑 가드가 산다', () => {
  it('⚠️ lat 구간과 lng 구간이 겹치지 않는다 — 겹히면 x/y 스왑이 조용히 통과한다', () => {
    // 이 성질이 스왑 가드의 전부다. 나중에 누가 박스를 넓혀 두 구간이 겹치면 가드가 사라지는데
    // 테스트는 그대로 통과한다 — 그래서 성질 자체를 여기서 못 박는다.
    // 위도 32.9~33.7 · 경도 125.9~127.1 (naverLocal.mjs 의 JEJU_BOUNDS)
    const latInLngRange = pick(okBody([address({ x: '33.4620900', y: '126.3709800' })]));
    expect(latInLngRange).toBeNull(); // 126 은 위도 범위(32.9~33.7) 밖 → 스왑이 반드시 걸린다
    const ok = pick(okBody([address()]));
    expect(ok).not.toBeNull();
  });

  it('단위 이중 해석이 안전한 이유 — 두 해석이 동시에 제주 박스에 들 수 없다', () => {
    // 소수로 보면 126.37(제주) / 정수로 보면 126.37/1e7 = 0.0000126(탈락).
    // 정수 1263709800 은 /1e7 = 126.37(제주) / 그대로 보면 12억(탈락).
    expect(pick(okBody([address({ x: '126.3709800', y: '33.4620900' })]))).not.toBeNull();
    expect(pick(okBody([address({ x: '1263709800', y: '334620900' })]))).not.toBeNull();
    expect(pick(okBody([address({ x: '126', y: '33' })]))).toBeNull(); // 정수 → 0.0000126 → 탈락
  });
});

describe('geocodeAddress — I/O', () => {
  const keys = { clientId: 'id', clientSecret: 'secret' };

  it('query 만 붙이고 키는 헤더로만 보낸다', async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => okBody([address()]) };
    };
    await geocodeAddress('제주특별자치도 서귀포시 안덕면 평화로 486', keys, fetchImpl);
    expect(seen.url.pathname).toBe('/map-geocode/v2/geocode');
    expect(seen.url.host).toBe('maps.apigw.ntruss.com');
    expect(seen.url.searchParams.get('query')).toBe('제주특별자치도 서귀포시 안덕면 평화로 486');
    expect(seen.url.search).not.toContain('secret');
    expect(seen.init.headers['X-NCP-APIGW-API-KEY-ID']).toBe('id');
    expect(seen.init.headers['X-NCP-APIGW-API-KEY']).toBe('secret');
  });

  it('비 2xx 면 status 를 실어 throw 하고, 주소·키는 메시지에 넣지 않는다', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { errorCode: '200', message: 'Authentication Failed', details: '' } }),
    });
    await expect(geocodeAddress('제주 제주시 애월읍 상가로1길 11-15', keys, fetchImpl)).rejects.toMatchObject({ status: 401 });
    const error = await geocodeAddress('제주 제주시 애월읍 상가로1길 11-15', keys, fetchImpl).catch((e) => e);
    expect(error.message).toContain('status=401');
    expect(error.message).toContain('apiHubCode=200'); // 같은 apigw — 꼬리표를 검색 쪽과 같은 함수로 뽑는다
    expect(error.message).not.toContain('상가로1길');
    expect(error.message).not.toContain('secret');
  });

  it('본문이 JSON 이 아니어도 원래 에러를 가리지 않는다', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(geocodeAddress('제주 제주시 애월읍 상가로1길 11-15', keys, fetchImpl)).rejects.toMatchObject({ status: 502 });
  });

  it('🔴 200 인데 본문이 JSON 이 아니면 본문 조각이 메시지로 나가지 않는다', async () => {
    // res.json() 이 그냥 throw 하게 두면 V8 이 `Unexpected token '<', "<!DOCTYPE "...` 처럼
    // **본문 앞부분을 메시지에 담아** 던지고, 그 메시지가 firstFailure 로 요약 줄까지 간다.
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token \'<\', "<!DOCTYPE " is not valid JSON'); },
    });
    const error = await geocodeAddress('제주 제주시 애월읍 상가로1길 11-15', keys, fetchImpl).catch((e) => e);
    expect(error.message).toContain('JSON 이 아니다');
    expect(error.message).not.toContain('DOCTYPE');
    expect(error.message).not.toContain('상가로1길');
  });

  it('결과 0건은 정상 응답이라 던지지 않는다', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => okBody([]) });
    await expect(geocodeAddress('제주 제주시 없는로 1', keys, fetchImpl)).resolves.toMatchObject({ status: 'OK' });
  });
});

describe('formatGeocodeSummary — 첫 실행의 실측 보고', () => {
  it('기회·호출·채택과 호출 전/후 탈락을 갈라 찍는다', () => {
    const reasons = newGeocodeReasons();
    reasons.addressMissing = 7;
    reasons.addressNoBuildingNumber = 2;
    reasons.noResult = 1;
    const line = formatGeocodeSummary({ chance: 12, tried: 3, picked: 2, failed: 0 }, reasons);
    expect(line).toContain('기회 12 · 호출 3 · 채택 2');
    expect(line).toContain('주소 없음 7');
    expect(line).toContain('번호 없음 2');
    expect(line).toContain('결과없음 1');
  });

  it('채택 0건이면 표본 x/y 를 함께 찍는다 — 자릿수를 눈으로 보게', () => {
    const reasons = newGeocodeReasons();
    reasons.sample = { x: '311277', y: '552091' };
    const line = formatGeocodeSummary({ chance: 5, tried: 5, picked: 0, failed: 0 }, reasons);
    expect(line).toContain('x=311277');
    expect(line).toContain('y=552091');
  });

  it('호출이 0이면 표본 경고를 찍지 않는다 — 측정한 것이 없으면 판정도 없다', () => {
    const reasons = newGeocodeReasons();
    reasons.sample = { x: '1', y: '2' };
    expect(formatGeocodeSummary({ chance: 5, tried: 0, picked: 0, failed: 0 }, reasons)).not.toContain('채택 0건이다');
  });

  it('⚠️ 전 건이 요청실패한 실행도 진단된다 — 좌표 표본이 없으므로 첫 실패가 유일한 단서다', () => {
    const reasons = newGeocodeReasons();
    reasons.firstFailure = '네이버 Geocoding 실패: status=429 apiHubCode=400 (호출 한도 초과 — 또는 콘솔에서 그 API 를 체크하지 않았다)';
    const line = formatGeocodeSummary({ chance: 5, tried: 1, picked: 0, failed: 1 }, reasons);
    expect(line).toContain('첫 요청실패');
    expect(line).toContain('apiHubCode=400');
  });

  it('addressElements 를 못 읽은 건수가 있으면 경고를 더한다', () => {
    const reasons = newGeocodeReasons();
    reasons.elementsUnknownShape = 4;
    expect(formatGeocodeSummary({ chance: 4, tried: 4, picked: 4, failed: 0 }, reasons)).toContain('addressElements');
  });
});

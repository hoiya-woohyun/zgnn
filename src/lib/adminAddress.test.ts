import { describe, expect, it } from 'vitest';
import { addressConflictOf, addressUnresolved, addressView } from './adminAddress';

/** 상호 검색이 준 주소 — 이름이 완전 일치한 업체의 등록 주소. */
const local = {
  name: '솔숲펜션',
  address: '제주 제주시 애월읍 상가로1길 11-15',
  addressAi: '제주특별자치도 제주시 애월읍 상가로1길 11-15',
  geoSource: 'local',
};

describe('addressView — 검증된 주소만 verified 다', () => {
  it("상호 검색 축은 verified 고, 접힌 줄에 표식을 달지 않는다", () => {
    const view = addressView(local);
    expect(view.axis).toBe('naverLocal');
    expect(view.verified).toBe(true);
    expect(view.shortLabel).toBeNull();
  });

  /**
   * 이 파일을 만든 이유다. `geocode` 축의 주소는 **원글 주소에서 나왔으므로** 원글과 견줘 '같다' 가 나와도
   * 확인한 것이 없다 — 그 '같다' 를 경보 없는 상태로 그리면 상호 검색으로 확인된 주소와 구별되지 않는다.
   */
  it('주소→좌표 축은 원글과 대조하지 않는다 (순환이다)', () => {
    const view = addressView({ ...local, geoSource: 'geocode' });
    expect(view.axis).toBe('naverGeocode');
    expect(view.verified).toBe(false);
    expect(view.cross).toBeNull();
    expect(view.shortLabel).toBe('원글 주소');
  });

  it('두 축이 다 실패하면 원글 주소 그대로이고, 대조하지 않는다', () => {
    const view = addressView({ ...local, geoSource: null });
    expect(view.axis).toBe('blogOnly');
    expect(view.verified).toBe(false);
    expect(view.cross).toBeNull();
  });

  /** `geoSource` 칸이 생기기 전의 후보. 덜 말하는 쪽으로 틀린다 — '확인됐다' 고 해 놓고 아닌 것보다 낫다. */
  it('geoSource 가 아예 없는 옛 후보도 검증으로 읽지 않는다', () => {
    expect(addressView({ name: local.name, address: local.address, addressAi: local.addressAi }).verified).toBe(false);
  });

  it('주소가 없으면 missing 이고 대조도 없다', () => {
    const view = addressView({ name: '솔숲펜션', address: null, addressAi: null, geoSource: null });
    expect(view.axis).toBe('missing');
    expect(view.address).toBeNull();
    expect(view.cross).toBeNull();
  });
});

describe('addressView — 원글 주소 대조는 sameAddress 가 정한다', () => {
  it('표기만 다르면 조용한 한 줄이다 (실측 43쌍 중 39쌍)', () => {
    expect(addressView(local).cross).toEqual({ tone: 'quiet', text: '원글에 적힌 주소와 같은 곳이에요' });
  });

  it('정말 다르면 경보다 — 동명 오채택이 여기서만 보인다', () => {
    const view = addressView({ ...local, addressAi: '제주 서귀포시 대포로 93' });
    expect(view.cross?.tone).toBe('warn');
    expect(view.cross?.text).toContain('서귀포시 대포로 93');
  });

  it('지번↔도로명은 판단하지 않고 참고로만 적는다', () => {
    const view = addressView({
      ...local,
      address: '제주 제주시 조천읍 함덕27길 18-2',
      addressAi: '제주 제주시 조천읍 함덕리 272-4',
    });
    expect(view.cross).toEqual({ tone: 'quiet', text: '원글 표기 — 제주 제주시 조천읍 함덕리 272-4' });
  });

  it('원글에 주소가 없으면 대조 못 했다고 말한다 (대조 결과를 지어내지 않는다)', () => {
    const view = addressView({ ...local, addressAi: null });
    expect(view.cross?.tone).toBe('quiet');
    expect(view.cross?.text).toContain('대조하지 못했어요');
  });
});

describe('addressView — 운영자가 고친 주소', () => {
  it('저장된 표식을 읽어 operator 로 본다 (geoSource 는 좌표의 출처라 남는다)', () => {
    const view = addressView({ ...local, addressEdited: true });
    expect(view.axis).toBe('operator');
    expect(view.verified).toBe(false);
    expect(view.shortLabel).toBe('직접 고침');
  });

  /** 고치기 폼의 초안. 고치는 가장 흔한 이유가 "동명의 다른 가게를 집었다" 라 대조는 계속 돌아야 한다. */
  it('초안을 넘기면 그 값으로 대조한다', () => {
    const view = addressView(local, '제주 서귀포시 대포로 93');
    expect(view.axis).toBe('operator');
    expect(view.address).toBe('제주 서귀포시 대포로 93');
    expect(view.cross?.tone).toBe('warn');
  });

  it('초안이 저장된 값과 같으면 축이 그대로다 — 폼을 열기만 해도 "고쳤다" 가 되지 않는다', () => {
    expect(addressView(local, local.address).axis).toBe('naverLocal');
  });

  /**
   * 저장된 표식이 초안보다 먼저다. 안 그러면 이미 고쳐진 후보에서 폼을 열기만 했을 때 축이 `naverLocal` 로
   * 되돌아가, 손으로 적은 주소 밑에 초록 '확인된 주소' 가 다시 뜬다.
   */
  it('이미 고친 후보는 주소를 안 건드린 초안에서도 operator 다', () => {
    const view = addressView({ ...local, addressEdited: true }, local.address);
    expect(view.axis).toBe('operator');
    expect(view.verified).toBe(false);
  });

  it('초안을 비우면 missing 이다', () => {
    expect(addressView(local, '   ').axis).toBe('missing');
  });
});

describe('addressView — 네이버 지도 링크', () => {
  /** 브라우저에 네이버 키가 없다(ADR-016) — 다시 확인하는 길은 API 호출이 아니라 링크뿐이다. */
  it('파이프라인이 쓴 것과 같은 검색어로 연다', () => {
    expect(addressView(local).mapUrl).toBe(`https://map.naver.com/p/search/${encodeURIComponent('제주 솔숲펜션')}`);
  });

  it("이미 '제주' 로 시작하면 접두어를 겹쳐 붙이지 않는다", () => {
    const view = addressView({ ...local, name: '제주애견펜션 쉼멍스테이' });
    expect(view.mapUrl).toBe(`https://map.naver.com/p/search/${encodeURIComponent('제주애견펜션 쉼멍스테이')}`);
  });

  it('이름이 없으면 링크도 없다', () => {
    expect(addressView({ ...local, name: '' }).mapUrl).toBeNull();
  });
});

/**
 * `주소 다름` 을 골라야 올릴 수 있다 — 경고만 띄우고 올리기를 평소대로 두던 동안 동명의 다른 가게가
 * 핑크 버튼 한 번에 게시될 수 있었다. 고른 뒤에는 경고가 내려가야 한다(안 내려가면 올리기가 영영 막힌다).
 */
describe('addressUnresolved — 주소 다름은 고르기 전까지 열려 있다', () => {
  const conflict = { ...local, addressAi: '제주 서귀포시 대포로 93' };

  it('상호 검색 주소와 원글 주소가 다르면 열려 있다', () => {
    expect(addressUnresolved(conflict)).toBe(true);
  });

  it('검색 주소를 고르면 닫히고, 무엇과 달랐는지는 남긴다', () => {
    const view = addressView({ ...conflict, addressChosen: 'search' });
    expect(addressUnresolved({ ...conflict, addressChosen: 'search' })).toBe(false);
    expect(view.cross?.tone).toBe('quiet');
    expect(view.cross?.text).toContain('대포로 93');
  });

  it('표기 차이·같은 주소는 처음부터 닫혀 있다', () => {
    expect(addressUnresolved(local)).toBe(false);
  });
});

describe('addressConflictOf — 승인을 멈출 주소 충돌', () => {
  it('정말 다를 때만 두 주소를 돌려준다 — `주소 다름` 뱃지와 같은 판정', () => {
    expect(addressConflictOf({ ...local, addressAi: '제주 서귀포시 대포로 93' })).toEqual({
      address: local.address,
      sourceAddress: '제주 서귀포시 대포로 93',
      edited: false,
    });
  });

  it('표기 차이·원글 주소 없음·원글에서 나온 주소(순환)는 충돌이 아니다', () => {
    expect(addressConflictOf(local)).toBeNull();
    expect(addressConflictOf({ ...local, addressAi: null })).toBeNull();
    expect(addressConflictOf({ ...local, geoSource: 'geocode', addressAi: '제주 서귀포시 대포로 93' })).toBeNull();
  });
});

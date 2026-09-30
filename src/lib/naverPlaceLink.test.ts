import { describe, expect, it } from 'vitest';
import { naverMapSearchUrl, naverPlacePhotoUrl, parseNaverPlaceId } from './naverPlaceLink';

describe('naverPlacePhotoUrl', () => {
  it('플레이스 id 로 사진 탭 주소를 만든다', () => {
    expect(naverPlacePhotoUrl('1118214877')).toBe('https://m.place.naver.com/place/1118214877/photo');
  });

  it('양끝 공백은 걷는다', () => {
    expect(naverPlacePhotoUrl(' 1118214877 ')).toBe('https://m.place.naver.com/place/1118214877/photo');
  });

  it('id 가 없거나 숫자가 아니면 주소를 만들지 않는다', () => {
    expect(naverPlacePhotoUrl(undefined)).toBeUndefined();
    expect(naverPlacePhotoUrl('')).toBeUndefined();
    expect(naverPlacePhotoUrl('https://naver.me/xIgKjUqT')).toBeUndefined();
    expect(naverPlacePhotoUrl('12a34')).toBeUndefined();
  });
});

describe('parseNaverPlaceId', () => {
  it('숫자 id 는 그대로, 빈 값은 지우기다', () => {
    expect(parseNaverPlaceId(' 1118214877 ')).toEqual({ id: '1118214877' });
    expect(parseNaverPlaceId('  ')).toEqual({ id: null });
  });

  it('여러 꼴의 플레이스·지도 주소에서 id 를 뽑는다', () => {
    for (const url of [
      'https://m.place.naver.com/restaurant/1118214877/home',
      'https://m.place.naver.com/place/1118214877/photo?entry=pll',
      'https://pcmap.place.naver.com/accommodation/1118214877/home',
      'https://map.naver.com/p/entry/place/1118214877?c=15.00,0,0,0,dh',
      'map.naver.com/p/search/제주 솔숲펜션/place/1118214877',
    ]) {
      expect(parseNaverPlaceId(url)).toEqual({ id: '1118214877' });
    }
  });

  it('단축 링크·다른 사이트·id 없는 주소는 이유와 함께 거절한다', () => {
    expect(parseNaverPlaceId('https://naver.me/xIgKjUqT')).toHaveProperty('error');
    expect(parseNaverPlaceId('https://example.com/place/1118214877')).toHaveProperty('error');
    expect(parseNaverPlaceId('https://evilnaver.com/place/1118214877')).toHaveProperty('error');
    expect(parseNaverPlaceId('https://map.naver.com/p/search/솔숲펜션')).toHaveProperty('error');
    expect(parseNaverPlaceId('솔숲 펜션')).toHaveProperty('error');
  });
});

describe('naverMapSearchUrl', () => {
  it('제주를 붙여 검색한다', () => {
    expect(naverMapSearchUrl(' 솔숲펜션 ')).toBe(`https://map.naver.com/p/search/${encodeURIComponent('제주 솔숲펜션')}`);
  });
});

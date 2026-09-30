import { describe, expect, it } from 'vitest';
import { naverPlacePhotoUrl } from './naverPlaceLink';

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

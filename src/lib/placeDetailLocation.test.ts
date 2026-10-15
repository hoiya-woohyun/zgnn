import { describe, expect, it } from 'vitest';
import { PLACES } from './places';
import { naverDirectionsUrl, naverPlaceUrlOf } from './naverPlaceLink';
import { placeDetailAddressNote, placeDetailLocationOf } from './placeDetailLocation';

const byName = (name: string) => {
  const place = PLACES.find((entry) => entry.name === name);
  if (!place) throw new Error(`${name} 이 데이터에 없다`);
  return place;
};

describe('placeDetailLocationOf', () => {
  it('주소·좌표가 다 있으면 full — 주소 줄 자리에 안내가 없다', () => {
    const place = byName('더클리프');
    expect(placeDetailLocationOf(place)).toBe('full');
    expect(placeDetailAddressNote(place)).toBeNull();
  });

  it('좌표만 있으면 주소 글자만 모른다고 말하고, 지도는 아래에 있다고 한다(서울앵무새 제주)', () => {
    const place = byName('서울앵무새 제주');
    expect(placeDetailLocationOf(place)).toBe('noAddress');
    expect(placeDetailAddressNote(place)).toBe('주소는 아직 확인하지 못했어요 · 위치는 아래 지도에서 볼 수 있어요');
  });

  it('좌표가 없으면 길찾기 대신 네이버 플레이스인 이유를 같은 줄에서 말한다(요호르기 스테이)', () => {
    const place = byName('요호르기 스테이');
    expect(placeDetailLocationOf(place)).toBe('noGeo');
    expect(placeDetailAddressNote(place)).toBe('주소와 위치를 아직 확인하지 못해 길찾기 대신 네이버 플레이스로 이어 드려요');
  });

  it('네이버 플레이스 칸이 서지 않으면 네이버 플레이스를 말하지 않는다', () => {
    expect(placeDetailAddressNote({ address: undefined, geo: undefined, naverUrl: undefined })).toBe(
      '주소와 위치를 아직 확인하지 못했어요',
    );
  });

  it('주소는 있고 좌표만 없으면 주소 줄은 그대로 두고 지도 위치만 모른다고 한다', () => {
    expect(
      placeDetailAddressNote({ address: '제주 제주시 구좌읍 1', geo: undefined, naverPlaceId: '1268585477' }),
    ).toBe('지도 위치를 아직 확인하지 못해 길찾기 대신 네이버 플레이스로 이어 드려요');
  });

  // 액션 줄은 `naverDirectionsUrl` 로 '길찾기' 칸을 세운다 — 이 줄이 말하는 이유와 칸이 같은 축이어야 한다.
  it('모든 장소에서 noGeo ⇔ 길찾기 칸이 없다', () => {
    for (const place of PLACES) {
      expect(placeDetailLocationOf(place) === 'noGeo', place.name).toBe(naverDirectionsUrl(place) === undefined);
    }
  });

  // 문장이 '네이버 플레이스로' 를 말하는 곳 ⇔ 액션 줄에 그 칸이 선다 — 둘 다 `naverPlaceUrlOf` 를 읽는다.
  it('좌표 없는 곳에서 "네이버 플레이스로" 를 말하면 그 칸의 주소가 있다', () => {
    for (const place of PLACES.filter((entry) => placeDetailLocationOf(entry) === 'noGeo')) {
      expect(placeDetailAddressNote(place)?.includes('네이버 플레이스로'), place.name).toBe(naverPlaceUrlOf(place) !== undefined);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { locateMe } from './myLocation';

/** 성공 또는 실패 하나를 곧바로 돌려주는 가짜 geolocation. */
function fakeGeolocation(
  outcome: { lat: number; lng: number } | { code: number },
): Geolocation {
  return {
    getCurrentPosition: (onSuccess, onError) => {
      if ('code' in outcome) onError?.({ code: outcome.code } as GeolocationPositionError);
      else
        onSuccess({
          coords: { latitude: outcome.lat, longitude: outcome.lng },
        } as GeolocationPosition);
    },
  } as Geolocation;
}

describe('locateMe', () => {
  it('어디든 좌표를 돌려준다 — 제주 밖도 거르지 않는다(v14)', async () => {
    await expect(locateMe(fakeGeolocation({ lat: 33.5, lng: 126.53 }))).resolves.toEqual({
      kind: 'ok',
      lat: 33.5,
      lng: 126.53,
    });
    await expect(locateMe(fakeGeolocation({ lat: 37.57, lng: 126.98 }))).resolves.toEqual({
      kind: 'ok',
      lat: 37.57,
      lng: 126.98,
    });
  });

  it('권한 거절(code 1)은 denied, 나머지 실패는 unavailable', async () => {
    await expect(locateMe(fakeGeolocation({ code: 1 }))).resolves.toEqual({ kind: 'denied' });
    await expect(locateMe(fakeGeolocation({ code: 2 }))).resolves.toEqual({ kind: 'unavailable' });
    await expect(locateMe(fakeGeolocation({ code: 3 }))).resolves.toEqual({ kind: 'unavailable' });
  });

  it('geolocation 이 없으면 unsupported — HTTP 로 연 개발 서버가 이 경우다', async () => {
    await expect(locateMe(undefined)).resolves.toEqual({ kind: 'unsupported' });
  });
});

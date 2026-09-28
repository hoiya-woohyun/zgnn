import { describe, expect, it } from 'vitest';
import { locateMe, serviceAreaOf } from './myLocation';

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

describe('serviceAreaOf', () => {
  it('제주 본섬과 딸린 섬들은 제주다', () => {
    expect(serviceAreaOf(33.4996, 126.5312)?.id).toBe('jeju'); // 제주시청
    expect(serviceAreaOf(33.4588, 126.9425)?.id).toBe('jeju'); // 성산일출봉
    expect(serviceAreaOf(33.5064, 126.9530)?.id).toBe('jeju'); // 우도
    expect(serviceAreaOf(33.1180, 126.2670)?.id).toBe('jeju'); // 마라도
    expect(serviceAreaOf(33.9620, 126.2990)?.id).toBe('jeju'); // 추자도
  });

  it('육지는 제주가 아니다', () => {
    expect(serviceAreaOf(37.5665, 126.978)).toBeNull(); // 서울
    expect(serviceAreaOf(34.8118, 126.3922)).toBeNull(); // 목포 — 경도는 제주 안
    expect(serviceAreaOf(35.1796, 129.0756)).toBeNull(); // 부산
  });
});

describe('locateMe', () => {
  it('제주 안이면 좌표를 돌려준다', async () => {
    await expect(locateMe(fakeGeolocation({ lat: 33.5, lng: 126.53 }))).resolves.toEqual({
      kind: 'ok',
      lat: 33.5,
      lng: 126.53,
    });
  });

  it('제주 밖이면 좌표 없이 outside', async () => {
    await expect(locateMe(fakeGeolocation({ lat: 37.57, lng: 126.98 }))).resolves.toEqual({
      kind: 'outside',
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

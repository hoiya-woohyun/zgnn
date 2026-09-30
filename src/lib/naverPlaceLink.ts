/**
 * 네이버 플레이스의 **사진 탭** 주소. 사진은 가져오지 않고 그곳으로 보낸다(ADR-002 v2).
 *
 * 왜 가져오지 않나 — 플레이스 사진은 업주·방문자가 올린 것이고 네이버가 받은 이용 허락은 네이버 서비스 안에서만이다.
 * 공식 API 로도 받을 수 없어 긁어야 하는데, 그건 약관(자동 수집 금지)에 걸린다. 링크는 둘 다 피한다.
 *
 * `naverUrl` 로 만들지 않는 이유 — 시드 86곳의 `naverUrl` 은 전부 `naver.me` 단축 링크라 경로를 붙일 수 없다.
 * 숫자가 아닌 id 는 버린다: 잘못된 id 로 만든 주소는 네이버의 빈 화면으로 가고, 버튼이 없는 편이 낫다.
 */
export function naverPlacePhotoUrl(naverPlaceId?: string): string | undefined {
  const id = naverPlaceId?.trim();
  if (!id || !/^\d+$/.test(id)) return undefined;
  return `https://m.place.naver.com/place/${id}/photo`;
}

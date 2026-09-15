/**
 * 지도 타일 출처.
 *
 * CARTO Voyager 가 이 앱의 원래 선택이지만, 2026-09 기준 CARTO 는 API 키 없이 받은 타일에
 * 'API KEY REQUIRED' 워터마크를 찍어서 그대로는 쓸 수 없다.
 * 그래서 키가 있으면 CARTO Voyager 를, 없으면 키가 필요 없는 OpenStreetMap 기본 타일을 쓴다.
 *
 * CARTO 키를 받았다면 프로젝트 루트에 .env.local 을 만들고 아래 한 줄을 넣으면 된다.
 *   VITE_CARTO_API_KEY=발급받은_키
 */

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TILE_SOURCE = CARTO_KEY
  ? {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${CARTO_KEY}`,
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 19,
    }
  : {
      // OSM 기본 타일은 {s} 서브도메인과 {r} 레티나 접미사를 지원하지 않는다.
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    };

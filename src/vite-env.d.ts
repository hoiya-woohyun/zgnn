/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CARTO Voyager 타일용 API 키. 없으면 OpenStreetMap 기본 타일을 쓴다. */
  readonly VITE_CARTO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

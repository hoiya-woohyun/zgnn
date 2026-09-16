export type TPlaceType = 'stay' | 'restaurant' | 'cafe';

export type TDirection = 'east' | 'west' | 'south' | 'north' | 'udo' | 'unknown';

export type TRegion = {
  direction: TDirection;
  town: string;
  detail?: string;
  raw: string;
};

export type TGeo = { lat: number; lng: number };

export type TStayPrice = {
  text: string;
  min?: number;
  max?: number;
  note?: string;
};

export type TStayInfo = {
  price: TStayPrice;
  amenitiesText: string;
};

export type TPlace = {
  id: string;
  type: TPlaceType;
  name: string;
  region: TRegion;
  features: string;
  petPolicyText: string;
  reviewUrl?: string;
  naverUrl?: string;
  naverPlaceId?: string;
  geo?: TGeo;
  address?: string;
  category?: string;
  cover?: string;
  images: string[];
  stay?: TStayInfo;
};

// ─────────────────────────────────────────────────────────────────────────────
// 강아지 프로필 — src/lib/eligibility.ts 의 입력
// ─────────────────────────────────────────────────────────────────────────────

export type TDogSize = 'small' | 'medium' | 'large';

/** 이동 수단. 'none' 이면 케이지·이동가방·유모차가 전혀 없다는 뜻. */
export type TCarrier = 'none' | 'bag' | 'cage' | 'stroller';

export type TDogProfile = {
  /** 여러 마리여도 이름은 하나("두부와 친구들" 처럼 사용자가 직접 적는다). */
  name: string;
  /** 마리별 몸무게. 1~3마리. 판정은 최댓값으로, 마릿수는 length 로 본다. */
  weightsKg: number[];
  carrier: TCarrier;
  /** 자동 계산된 크기(최댓값 기준)를 사용자가 고친 값. 없으면 자동 계산을 그대로 쓴다. */
  sizeOverride?: TDogSize;
};

export type TSeason = '사계절' | '여름' | '겨울';

export type TItem = {
  id: string;
  name: string;
  emoji: string;
  seasons: TSeason[];
  reason: string;
  linkUrl?: string;
};

export type TMeta = {
  author: string;
  sourceUrl: string;
  intro: string;
  itemsIntro: string;
  itemsAdvice: string;
  disclosure: string;
};

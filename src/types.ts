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

/** 강아지 한 마리. 이름은 문구("두부는 갈 수 있어요")와 요금 줄에, 몸무게는 판정에 쓴다. */
export type TDogEntry = {
  name: string;
  weightKg: number;
};

export type TDogProfile = {
  /**
   * 마리별 이름·몸무게. 1~3마리. 판정은 최대 몸무게로, 마릿수는 length 로 본다.
   * 이동 수단은 한 벌이다 — 보호자가 들고 다니는 것이라 마리마다 갈리지 않는다.
   */
  dogs: TDogEntry[];
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
  /**
   * 같은 물건인데 고를 갈래가 있는 경우(기내용 가방의 몸무게 구간). 원본 데이터에서는
   * 갈래마다 따로 한 줄이지만, 챙기는 사람 입장에서는 **하나를 사는** 일이라 한 줄로 합친다.
   * 합쳐진 항목은 `linkUrl` 대신 이 목록을 들고 있다 — `lib/places.ts` 의 ITEM_VARIANTS 참고.
   */
  variants?: { label: string; linkUrl: string }[];
};

export type TMeta = {
  author: string;
  sourceUrl: string;
  intro: string;
  itemsIntro: string;
  itemsAdvice: string;
  disclosure: string;
};

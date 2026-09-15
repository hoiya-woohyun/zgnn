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

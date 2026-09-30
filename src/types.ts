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

/**
 * AI(data:analyze)가 petPolicyText 를 읽고 판단한 구조화 값. 블로그 경로에만 있고 시드 86곳엔 없다(DB null → JSON 에 키 없음).
 * 앱은 이것이 있으면 정규식 파서(parsePetPolicy)의 같은 필드를 이 값으로 덮는다(withPolicyFacts). null 은 "언급 없음" 이다.
 */
export type TPetPolicyFacts = {
  indoor: 'free' | 'cage' | 'outdoorOnly' | 'unknown';
  leash: boolean;
  largeDogOk: boolean | null;
  smallDogOnly: boolean;
  callFirst: boolean;
  feeFree: boolean | null;
  /**
   * 요금 기준마다 한 줄(원문 표기). **한 문장으로 접을 수 없다** — 시드 18줄의 실측만으로도 기준이 넷이다:
   * 마리당("1마리당 3만원") · 무게 구간("1~5kg 1만원" + "6~10kg 1.5만원") · 정액 부대비("청소비 5만원") ·
   * 조건부("2마리 또는 10kg 이상 4만원"). `feeText` 한 칸이던 동안 구간 요금표의 **둘째 줄이 조용히 사라졌다**.
   */
  feeLines?: string[];
  /**
   * 옛 모양(요금 문장 하나). 2026-09-30 이전에 분석된 후보·장소에만 있다 — 읽는 쪽은 `feeLinesOf`
   * (`scripts/lib/petPolicyFacts.mjs`)로 `feeLines` 와 합쳐 본다. 새로 뽑는 값에는 이 칸을 만들지 않고
   * (`shapePetPolicy`), 보정을 거친 값에는 `null` 로 남는다 — 그것이 보정의 멱등성을 지키는 장치다
   * (남겨 두면 `feeLinesOf` 가 뺀 줄을 다시 주워 온다).
   */
  feeText?: string | null;
  weightLimitKg: number | null;
  maxDogs: number | null;
  notes: string | null;
};

export type TPlaceHomepage = {
  url: string;
  name?: string;
  image?: string;
};

export type TPlace = {
  id: string;
  type: TPlaceType;
  name: string;
  region: TRegion;
  features: string;
  petPolicyText: string;
  /** AI 가 판단한 구조화 조건(블로그 경로만). 원문은 petPolicyText 에 그대로 있다. */
  petPolicy?: TPetPolicyFacts;
  reviewUrl?: string;
  naverUrl?: string;
  naverPlaceId?: string;
  geo?: TGeo;
  address?: string;
  category?: string;
  /**
   * 업체 공식 홈페이지 링크 카드(ADR-002 v2). `image` 는 업체가 공유용으로 내놓은 `og:image` 의 **URL** 이다 —
   * 파일을 갖고 있지 않으므로 카드(사진 + 출처 + 링크)로만 그리고, 못 받으면 사진 없이 그린다.
   */
  homepage?: TPlaceHomepage;
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

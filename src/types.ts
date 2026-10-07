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
  /** AI 가 원문에서 읽은 숙소 환경(`places.stay_environment`, 10 F6). 시드는 없다 — 앱이 정규식으로 읽은 값과 합친다(`TPlaceEntry.environment`). */
  environment?: TStayEnvironment;
};

/** 숙소 환경 — 칸마다 true · false · null(원문에 없음). 판정에는 쓰지 않는다(선호). `scripts/lib/stayEnvironment.mjs`. */
export type TStayEnvironment = {
  standalone: boolean | null;
  yard: boolean | null;
  fencedYard: boolean | null;
  stairs: boolean | null;
};

/**
 * 요금 기준 한 줄의 **구조**(AI 가 뽑는다, ADR-017 v5). 앱은 `label` 을 정규식으로 다시 읽지 않고 이 칸들로 계산한다 —
 * 줄 모양을 정규식으로 읽던 동안 `19kg 이하 1마리당 2만원` 처럼 예시 밖의 모양은 전부 "원문 요금" 으로 물러났다.
 *
 * 칸으로 표현이 안 되는 기준(`2마리 또는 10kg 이상 4만원` 의 '또는', `주말 5만원` 의 요일)은 `amountWon: null` 이다 —
 * 그러면 앱은 계산하지 않고 원문 줄을 보여 준다(지어내지 않는다).
 */
export type TFeeRule = {
  /** 표시용 한 줄 — 기준 + 금액, 20자 이내(옛 `feeLines` 한 줄과 같은 모양). 배지·검수 화면이 이것을 쓴다 */
  label: string;
  /** 금액(원). 범위("1~2만원")·칸으로 표현 못 하는 조건이면 null */
  amountWon: number | null;
  /** 'perDog' 마리마다 붙는다 · 'flat' 한 번 붙는다(청소비) */
  basis: 'perDog' | 'flat';
  /** 이 금액이 붙는 몸무게 하한(포함, "20kg 이상" → 20). 없으면 null */
  minKg: number | null;
  /** 이 금액이 붙는 몸무게 상한(포함, "19kg 이하" → 19). 없으면 null */
  maxKg: number | null;
  /** N번째 마리부터 붙는다("두 마리부터 1마리당 2만원" → 2). 첫 마리부터면 null */
  fromDog: number | null;
  /** 1박마다 붙으면 true(`1박당 2만원`). 한 번이거나 원문이 말하지 않으면 false */
  perNight: boolean;
};

/**
 * AI(pnpm data analyze)가 petPolicyText 를 읽고 판단한 구조화 값. 블로그 경로에만 있고 시드 86곳엔 없다(DB null → JSON 에 키 없음).
 * 앱은 이것이 있으면 **판정 필드를 이 값만으로** 정한다(withPolicyFacts, ADR-017 v5). 스키마가 모든 칸을 요구하므로
 * null 은 "모름" 이 아니라 "읽어 봤는데 그런 조건이 없다" 이다 — 정규식 값으로 메우지 않는다.
 */
export type TPetPolicyFacts = {
  indoor: 'free' | 'cage' | 'outdoorOnly' | 'unknown';
  leash: boolean;
  largeDogOk: boolean | null;
  smallDogOnly: boolean;
  callFirst: boolean;
  /**
   * 예방접종을 마쳐야(또는 접종 증명서를 내야) 들어갈 수 있다. **AI 만 읽는다** — 정규식 파서에는 대응 규칙이 없다(ADR-017 v6).
   * 2026-10-01 이전에 분석된 판단에는 칸이 없다(없으면 false 로 읽는다 — 그때 그 조건은 `notes` 에 들어가 있다).
   */
  vaccineRequired?: boolean;
  feeFree: boolean | null;
  /**
   * 요금 기준마다 한 줄(원문 표기). **한 문장으로 접을 수 없다** — 시드 18줄의 실측만으로도 기준이 넷이다:
   * 마리당("1마리당 3만원") · 무게 구간("1~5kg 1만원" + "6~10kg 1.5만원") · 정액 부대비("청소비 5만원") ·
   * 조건부("2마리 또는 10kg 이상 4만원"). `feeText` 한 칸이던 동안 구간 요금표의 **둘째 줄이 조용히 사라졌다**.
   */
  feeLines?: string[];
  /**
   * 요금 기준마다 구조 하나(v5, 새로 뽑는 값은 이것만 채운다). 있으면 앱이 이 칸들로 우리 강아지 기준 금액을 계산한다(`dogFee.ts`).
   * 옛 값(`feeLines`·`feeText`)만 있거나 운영자가 `/admin` 에서 요금 줄을 고치면 없다 — 그때는 줄을 정규식으로 읽던 길로 물러난다.
   */
  fees?: TFeeRule[];
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
  /** 사람이 마지막으로 확인한 날(`YYYY-MM-DD`). 없으면 확인 기록이 없다 — 상세는 날짜를 그리지 않는다(ADR-021 R5). */
  verifiedAt?: string;
  cover?: string;
  images: string[];
  stay?: TStayInfo;
  /**
   * 열린 폐업 제보(`closed`·`replaced`)가 있다 — 빌드 때 `pnpm data pull` 이 `place_report_flags()` 로 얹는다(ADR-021 R5).
   * 있으면 상세가 "최근 확인" 날짜를 그리지 않는다. 내용·건수는 싣지 않는다.
   */
  openReportKinds?: string[];
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

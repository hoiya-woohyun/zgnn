/**
 * 검수 화면에서 **후보를 고치는** 일의 순수 부분 — 초안 만들기 · 검증 · 고친 `extracted` 조립.
 * 쓰는 쪽은 `src/lib/adminApply.ts` 의 `saveEdit`(DB)과 `src/screens/adminPageEditForm.tsx`(화면)다.
 *
 * 고치는 것은 **승인 전 후보(`candidates.extracted`)뿐**이다. 이미 게시된 `places` 행은 건드리지 않는다 —
 * 그쪽은 되돌릴 길이 없고(트리거가 곧 재빌드를 부른다), 여기는 승인하기 전이라 실수의 값이 작다.
 *
 * **동반 정보는 구조값(`petPolicy`)과 조건 원문(`petPolicyText`)을 같이 고친다.** 둘을 갈라 놓을 수 없어서다 —
 * `correctPetPolicyFacts`(ADR-017 v2 "지어내지 않는다")가 **원문에 근거 단어가 없는 판단을 지우고**, 그 보정은
 * 분석 시점뿐 아니라 **사이트가 그릴 때마다**(`places.ts` 의 `withPolicyFacts`) 다시 돈다. 사람이 넣은 값도 예외가
 * 아니다. 게다가 원문이 비면 `toNewPlaceRow`·`mergeIntoExisting` 이 `pet_policy` 를 아예 쓰지 않는다.
 * 그래서 구조값만 고치게 두면 "고쳤는데 사이트에 안 나간다" 가 조용히 일어난다 — 원문을 같이 고칠 수 있어야
 * 근거가 생긴다. 규칙 자체는 그대로 둔다(사람이 넣었다고 보정을 면제하지 않는다).
 *
 * 폼은 그래서 **보정을 미리 돌려 보여 준다**(`editPreview`) — 무엇이 칩이 되고 무엇이 원문에 없어 빠지는지.
 */

import { resolveRegionRaw } from '../../scripts/analyze/analyzeCandidates.mjs';
import { matchPlace, normalizeName, THRESHOLD } from '../../scripts/analyze/matchPlace.mjs';
import { toMatchablePlace } from '../../scripts/lib/placeFields.mjs';
import { previewFor, TYPE_LABEL, type TCandidateExtracted, type TCandidateRow, type TCandidateTier, type TCandidateType, type TPlaceRow } from './adminCandidates';
import { feeLinesOf } from '../../scripts/lib/petPolicyFacts.mjs';
import { policyCell, type TPolicyCell } from './adminPreview';
import type { TAddressChoice } from './adminAddress';
import { parseNaverPlaceId } from './naverPlaceLink';
import { PLACES } from './places';
import type { TFeeRule, TPetPolicyFacts, TPlace } from '../types';

/** 사람이 고를 수 있는 종류. `other` 가 빠진 것은 의도다 — `toNewPlaceRow` 가 영구 오류로 막는다(applyApproved.mjs:99). */
export const EDITABLE_TYPES: TCandidateType[] = ['stay', 'restaurant', 'cafe'];

/**
 * 폼이 들고 있는 값. **전부 문자열이다** — `<input>` 이 그렇고, 숫자로 들고 있으면 "지우는 중"(`''`)과
 * "0" 을 구별할 수 없다. 숫자·null 로 바꾸는 것은 저장 직전 한 곳(`buildEdited`)에서만 한다.
 */
export type TCandidateEditDraft = {
  name: string;
  type: TCandidateType;
  address: string;
  lat: string;
  lng: string;
  /**
   * 네이버 플레이스 주소나 숫자 id — 붙여 넣은 **그대로**다. id 로 바꾸는 것은 `parseNaverPlaceId` 한 곳이다.
   * 이 칸이 차야 상세에 '네이버 사진'·'네이버 지도' 가 생긴다(ADR-002 v2) — 블로그 후보는 AI 가 채우지 못한다.
   */
  naverPlace: string;
  /**
   * 공식 홈페이지 카드(분석이 찾은 것). 주소를 비우면 카드째, 사진만 비우면 사진만 빠진다 —
   * 업체가 사진을 내려 달라고 할 때 승인 전이면 여기서 끝난다(ADR-002 v2).
   */
  homepageUrl: string;
  homepageImage: string;
  features: string;
  /** 블로그 본문에서 뽑은 조건 문장. 여기가 비면 구조값은 반영 단계에서 통째로 버려진다(ADR-017). */
  petPolicyText: string;
  policy: TPolicyDraft;
};

/**
 * 구조값의 폼 모양. 삼항(`largeDogOk`·`feeFree`)은 `'yes' | 'no' | 'unknown'` 으로 든다 —
 * 체크박스 하나로 두면 `false`("불가" 라고 읽었다)와 `null`("언급 없음")이 같은 칸이 되고,
 * 그 둘은 판정이 정반대다(BUG-009 가 정확히 그 혼동이었다).
 */
export type TPolicyDraft = {
  indoor: TPetPolicyFacts['indoor'];
  leash: boolean;
  largeDogOk: TTriState;
  smallDogOnly: boolean;
  callFirst: boolean;
  vaccineRequired: boolean;
  feeFree: TTriState;
  /**
   * 요금 줄 — **줄바꿈으로 나눈 한 문자열**이다. 배열로 들고 있으면 "줄을 지우는 중"(빈 줄)이 저장 대상에서
   * 사라져 커서가 튀고, 폼의 다른 값과 달리 문자열이 아니게 된다(이 타입의 규칙: 전부 문자열).
   * 배열로 바꾸는 것은 저장 직전 한 곳(`policyFactsFrom`)에서만 한다.
   */
  feeLines: string;
  weightLimitKg: string;
  maxDogs: string;
  notes: string;
  /**
   * AI 가 뽑은 요금 **구조**(`fees`) — 폼에 칸이 없고, 저장할 때 되돌려 싣기 위해 들고만 있다(이 타입에서 유일하게 문자열이 아니다).
   * 운영자가 `feeLines` 를 고치지 않았으면 그대로 싣고, 고쳤으면 버린다 — 구조가 새 줄을 모르므로 싣으면 계산이 옛 줄로 돈다.
   * 버리면 앱은 요금 줄을 정규식으로 읽던 길로 물러난다(ADR-017 v5).
   */
  fees?: TFeeRule[];
};

export type TTriState = 'yes' | 'no' | 'unknown';

const triFrom = (value: boolean | null | undefined): TTriState => (value === true ? 'yes' : value === false ? 'no' : 'unknown');
const triTo = (value: TTriState): boolean | null => (value === 'yes' ? true : value === 'no' ? false : null);

const EMPTY_POLICY: TPolicyDraft = {
  indoor: 'unknown',
  leash: false,
  largeDogOk: 'unknown',
  smallDogOnly: false,
  callFirst: false,
  vaccineRequired: false,
  feeFree: 'unknown',
  feeLines: '',
  weightLimitKg: '',
  maxDogs: '',
  notes: '',
};

export function draftFromExtracted(extracted: TCandidateExtracted): TCandidateEditDraft {
  return {
    name: extracted.name ?? '',
    type: (EDITABLE_TYPES as string[]).includes(extracted.type) ? extracted.type : 'cafe',
    address: extracted.address ?? '',
    lat: extracted.geo ? String(extracted.geo.lat) : '',
    lng: extracted.geo ? String(extracted.geo.lng) : '',
    naverPlace: typeof extracted.naverPlaceId === 'string' ? extracted.naverPlaceId : '',
    homepageUrl: extracted.homepage?.url ?? '',
    homepageImage: extracted.homepage?.image ?? '',
    features: extracted.features ?? '',
    petPolicyText: extracted.petPolicyText ?? '',
    policy: policyDraftFrom(extracted.petPolicy),
  };
}

export function policyDraftFrom(facts: TPetPolicyFacts | null | undefined): TPolicyDraft {
  if (!facts) return { ...EMPTY_POLICY };
  return {
    indoor: facts.indoor ?? 'unknown',
    leash: Boolean(facts.leash),
    largeDogOk: triFrom(facts.largeDogOk),
    smallDogOnly: Boolean(facts.smallDogOnly),
    callFirst: Boolean(facts.callFirst),
    vaccineRequired: Boolean(facts.vaccineRequired),
    feeFree: triFrom(facts.feeFree),
    feeLines: feeLinesOf(facts).join('\n'),
    weightLimitKg: facts.weightLimitKg == null ? '' : String(facts.weightLimitKg),
    maxDogs: facts.maxDogs == null ? '' : String(facts.maxDogs),
    notes: facts.notes ?? '',
    // 빈 배열도 싣는다 — "요금 없음" 인 새 판단이고, 칸이 사라지면 저장 뒤 옛 판단으로 읽힌다.
    fees: Array.isArray(facts.fees) ? facts.fees : undefined,
  };
}

/** 폼 → `TPetPolicyFacts`. **아무것도 안 적혔으면 `null`** — 빈 판단 객체는 '판단 있음' 으로 세어져 뱃지를 거짓말하게 한다. */
export function policyFactsFrom(draft: TPolicyDraft): TPetPolicyFacts | null {
  const facts: TPetPolicyFacts = {
    indoor: draft.indoor,
    leash: draft.leash,
    largeDogOk: triTo(draft.largeDogOk),
    smallDogOnly: draft.smallDogOnly,
    callFirst: draft.callFirst,
    vaccineRequired: draft.vaccineRequired,
    feeFree: triTo(draft.feeFree),
    feeLines: toLines(draft.feeLines),
    weightLimitKg: toNumber(draft.weightLimitKg),
    maxDogs: toNumber(draft.maxDogs),
    notes: draft.notes.trim() || null,
  };
  /*
   * 요금 구조는 **원래 구조가 있던 판단에만** 싣는다. 줄이 label 과 그대로면 구조로 되돌려 싣고(줄은 `feeLinesOf` 가 label 에서
   * 다시 만든다), 고쳤으면 `fees: []` — 운영자가 적은 줄이 정본이라는 표시다.
   * **옛 판단(구조 없음)에는 `fees` 칸을 만들지 않는다.** 저장은 필드 하나만 고쳐도 이 함수를 거치는데, 빈 배열이 붙으면 앱이 새 판단으로
   * 보고 옛 판단의 잔여 병합을 끈다 — 캄 `1마리당 3만원. (2마리 또는 10kg 이상 4만원)` 이 이름만 고친 뒤 2마리 "6만원" 이 된다(원문은 4만원).
   */
  if (draft.fees) {
    const labels = draft.fees.map((rule) => rule.label);
    const lines = facts.feeLines ?? [];
    const unchanged = labels.length === lines.length && labels.every((label, i) => label === lines[i]);
    facts.fees = unchanged ? draft.fees : [];
    if (unchanged) facts.feeLines = [];
  }
  const empty =
    facts.indoor === 'unknown' &&
    !facts.leash &&
    facts.largeDogOk === null &&
    !facts.smallDogOnly &&
    !facts.callFirst &&
    !facts.vaccineRequired &&
    facts.feeFree === null &&
    // `feeLines` 는 타입상 optional(옛 후보엔 없다) 이지만 위에서 늘 배열로 채운다 — 그래도 `?.` 를 붙여
    // 타입이 말하는 대로 읽는다. `undefined.length` 한 번이 이 함수를 던지게 만들고, 그러면 저장이 통째로 막힌다.
    (facts.feeLines?.length ?? 0) === 0 &&
    (facts.fees?.length ?? 0) === 0 &&
    facts.weightLimitKg === null &&
    facts.maxDogs === null &&
    facts.notes === null;
  return empty ? null : facts;
}

/** 여러 줄 입력 → 요금 줄 배열. 빈 줄·앞뒤 공백·중복을 턴다(`feeLinesOf` 와 같은 규칙). */
const toLines = (raw: string): string[] => [...new Set(raw.split('\n').map((line) => line.trim()).filter(Boolean))];

const toNumber = (raw: string): number | null => {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/**
 * 제주를 넉넉히 감싸는 사각형. **정확한 경계가 목적이 아니라 자리를 바꿔 넣은 실수를 잡는 것이 목적**이다 —
 * 위·경도를 뒤집으면 (126, 33) 이 되어 둘 다 한눈에 범위 밖이다. 시드 81곳의 실측 범위는
 * lat 33.2218~33.5596 · lng 126.1759~126.9614 이고, 추자도(위쪽)까지 들어오도록 늘려 잡았다.
 */
const JEJU_BOUNDS = { lat: [33.0, 34.1], lng: [126.0, 127.0] } as const;

/** 좌표 한 칸. 빈 문자열은 `null`(좌표 없음), 숫자로 못 읽으면 `NaN`. */
const toCoord = (raw: string): number | null => {
  const text = raw.trim();
  if (!text) return null;
  return Number(text);
};

/**
 * 저장할 수 없는 이유 한 줄. `null` 이면 저장해도 된다.
 *
 * 여기서 막는 것은 **반영 단계에서 영구 오류가 되거나 조용히 틀리는 것**뿐이다(`toNewPlaceRow` 의 검사와 같은 줄).
 * 지역(`regionRaw`)은 이 폼이 다루지 않는다 — 이미 '지역 고르기' 가 그 일을 하고, 선택지를 기존 86곳 표기로
 * 묶어 두는 것이 그쪽의 요점이다.
 */
export function editProblem(draft: TCandidateEditDraft): string | null {
  if (!draft.name.trim()) return '이름을 적어 주세요.';
  if (!(EDITABLE_TYPES as string[]).includes(draft.type)) return '종류를 골라 주세요.';

  const lat = toCoord(draft.lat);
  const lng = toCoord(draft.lng);
  // 한 칸만 채우면 `validGeo` 가 통째로 버려 좌표가 조용히 사라진다 — 반쯤 지운 상태를 저장하지 않게 여기서 막는다.
  if ((lat === null) !== (lng === null)) return '위도와 경도는 둘 다 적거나 둘 다 비워 주세요.';
  if (lat !== null && lng !== null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '좌표는 숫자로 적어 주세요.';
    if (lat < JEJU_BOUNDS.lat[0] || lat > JEJU_BOUNDS.lat[1] || lng < JEJU_BOUNDS.lng[0] || lng > JEJU_BOUNDS.lng[1]) {
      return '제주 밖 좌표예요 — 위도와 경도가 바뀌지 않았는지 봐 주세요.';
    }
  }

  const naverPlace = parseNaverPlaceId(draft.naverPlace);
  if ('error' in naverPlace) return naverPlace.error;

  // 반영기(`homepageColumns`)와 같은 줄 — 거기서 조용히 버려질 값을 여기서 먼저 말한다.
  if (draft.homepageUrl.trim() && !/^https?:\/\//i.test(draft.homepageUrl.trim())) return '홈페이지 주소는 http(s):// 로 시작해야 해요.';
  if (draft.homepageImage.trim() && !/^https:\/\//i.test(draft.homepageImage.trim())) return '홈페이지 사진은 https:// 주소만 쓸 수 있어요.';
  if (draft.homepageImage.trim() && !draft.homepageUrl.trim()) return '홈페이지 주소 없이 사진만 둘 수 없어요 — 사진은 그 홈페이지 카드의 일부예요.';

  /*
   * 숫자 칸은 **비었거나 양수**다. `toNumber` 가 못 읽으면 `null` 을 돌려주므로 여기서 막지 않으면
   * "10kg" 이라고 적은 것이 조용히 '제한 없음' 이 된다 — 없는 제한만큼이나 사라진 제한도 해롭다.
   */
  for (const [label, raw] of [['무게 상한', draft.policy.weightLimitKg], ['마릿수 상한', draft.policy.maxDogs]] as const) {
    if (!raw.trim()) continue;
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n <= 0) return `${label}은 숫자로 적어 주세요(단위 없이).`;
  }
  return null;
}

/**
 * 고친 값이 **실제로 사이트에 어떻게 나가는지.** 폼이 이것을 옆에 띄우는 것이 이 기능의 핵심이다.
 *
 * `correctPetPolicyFacts`(ADR-017 v2)가 원문에 근거 없는 판단을 지우고 그 보정은 사이트가 그릴 때마다 다시 돈다 —
 * 그래서 구조값만 고치면 "고쳤는데 안 나간다" 가 조용히 일어난다. 미리 돌려 보여 주면 그 침묵이 사라지고,
 * 운영자는 조건 원문을 같이 고쳐 근거를 만들 수 있다(그러라고 원문 칸이 있다).
 *
 * `previewFor` 를 쓰는 이유: 표의 동반 정보 칸과 **같은 함수**여야 미리보기와 저장 뒤 화면이 어긋나지 않는다.
 */
export function editPreview(draft: TCandidateEditDraft): { cell: TPolicyCell; corrections: string[] } {
  const petPolicyText = draft.petPolicyText.trim() || null;
  const preview = previewFor({ petPolicyText, petPolicy: policyFactsFrom(draft.policy) } as TCandidateExtracted);
  return { cell: policyCell(preview, petPolicyText), corrections: preview.corrections };
}

/** 폼의 플레이스 칸 → id. 못 읽으면 null — 저장은 `editProblem` 이 이미 막았다. */
const placeIdOf = (draft: TCandidateEditDraft): string | null => {
  const parsed = parseNaverPlaceId(draft.naverPlace);
  return 'id' in parsed ? parsed.id : null;
};

/**
 * 짝짓기에 쓰이는 값이 바뀌었는가. 바뀌었으면 저장할 때 **짝을 다시 계산해야 한다**(아래 주석).
 * 플레이스 id 도 여기 든다 — `matchPlace` 는 id 가 같으면 그것만으로 1.0 짝을 낸다. 붙여 넣은 꼴(주소 ↔ 숫자)만
 * 바뀐 것은 바뀐 게 아니므로 id 로 비교한다.
 */
export function identityChanged(draft: TCandidateEditDraft, extracted: TCandidateExtracted): boolean {
  const before = draftFromExtracted(extracted);
  return (
    before.name.trim() !== draft.name.trim() ||
    before.type !== draft.type ||
    before.address.trim() !== draft.address.trim() ||
    before.lat.trim() !== draft.lat.trim() ||
    before.lng.trim() !== draft.lng.trim() ||
    placeIdOf(before) !== placeIdOf(draft)
  );
}

const tierOf = (confidence: number, hasMatch: boolean): TCandidateTier => {
  if (!hasMatch) return 'new';
  if (confidence >= THRESHOLD.AUTO_MERGE) return 'auto';
  if (confidence >= THRESHOLD.ASK) return 'ask';
  return 'new';
};

/** 고친 결과 한 벌 — `extracted` 와, 함께 바뀌어야 하는 `candidates` 의 두 칸. */
export type TCandidateEdit = {
  extracted: TCandidateExtracted;
  match_place_id: string | null;
  match_confidence: number | null;
};

/**
 * 고친 값으로 `extracted` 를 다시 만든다. **이름·종류·주소·좌표가 바뀌면 짝을 다시 계산한다.**
 *
 * 다시 계산하지 않으면 이 폼의 주된 쓸모가 그대로 깨진다. `match`·`match_place_id`·`match_confidence`·`nameKey` 는
 * **고치기 전 값으로** 구해진 것이고, `decideTarget` 은 tier 가 `new` 가 아니면 `match_place_id` 를 그대로 믿어
 * 재대조를 하지 않는다(`adminApply.ts:116-119`). 그래서 `주소 다름` 뱃지를 보고 "네이버가 동명의 다른 가게를
 * 집었구나" 하고 주소를 고쳐도, 승인은 **여전히 그 엉뚱한 장소로 합쳐진다.**
 *
 * 대조 corpus 는 `approveGroup` 이 쓰는 것과 **같아야** 한다 — `toMatchablePlace` 로 만들어 `status` 를 싣는다
 * (동점일 때 내린 곳보다 살아 있는 곳을 고르는 규칙이 그 칸을 본다). 한쪽만 `fromPlaceRow` 면 저장 때와
 * 승인 때가 다른 짝을 낸다.
 *
 * `features` 만 고쳤으면 짝은 손대지 않는다 — 소개 문장은 대조에 쓰이지 않는다.
 */
export function buildEdit(row: TCandidateRow, draft: TCandidateEditDraft, places: TPlaceRow[], now = new Date()): TCandidateEdit {
  const prev = row.extracted;
  const name = draft.name.trim();
  const address = draft.address.trim() || null;
  const lat = toCoord(draft.lat);
  const lng = toCoord(draft.lng);
  const geo = lat !== null && lng !== null ? { lat, lng } : null;
  const naverPlaceId = placeIdOf(draft);
  const homepageUrl = draft.homepageUrl.trim();

  const extracted: TCandidateExtracted = {
    ...prev,
    name,
    type: draft.type,
    address,
    geo,
    // 사람이 확인한 id 다 — 검색이 준 `naverLink` 와 달리 반영기가 `naver_place_id`·`naver_url` 로 옮긴다(applyApproved.mjs).
    naverPlaceId,
    // 주소가 그대로면 사이트 이름을 물려받는다. 사람이 주소를 바꿨으면 옛 이름은 다른 사이트의 것이라 버린다.
    homepage: homepageUrl
      ? {
          url: homepageUrl,
          siteName: prev.homepage?.url === homepageUrl ? (prev.homepage?.siteName ?? null) : null,
          image: draft.homepageImage.trim() || null,
        }
      : null,
    features: draft.features.trim() || null,
    petPolicyText: draft.petPolicyText.trim() || null,
    /* 원문이 비면 구조값도 비운다 — 반영기가 어차피 안 쓰고(ADR-017), 남겨 두면 화면만 '판단 있음' 으로 읽는다. */
    petPolicy: draft.petPolicyText.trim() ? policyFactsFrom(draft.policy) : null,
    nameKey: normalizeName(name),
    /*
     * 사람이 고쳤다는 표식. `meta`(어느 프롬프트로 뽑았나)를 지우지 않고 **옆에** 둔다 — 지우면 재분석 대상을
     * 고르는 키가 사라지고, 덮어쓰면 "AI 가 이렇게 뽑았다" 가 거짓이 된다. 반영기는 칸을 명시해 읽으므로
     * 이 칸은 `places` 로 새지 않는다(`toNewPlaceRow`).
     */
    editedAt: now.toISOString(),
    aiOriginal: aiOriginalOf(prev),
    /*
     * **주소를 고쳤다는 표식은 따로 둔다.** `geoSource` 는 좌표가 어느 축에서 왔는지라 주소를 고쳐도 남고,
     * 그러면 검수 화면이 손으로 적은 주소를 '상호 검색으로 확인된 주소' 로 그린다(`adminAddress.ts`).
     * `editedAt` 으로는 갈릴 수 없다 — 소개 문장만 고쳐도 그 칸이 찍힌다.
     * 한 번 참이면 되돌리지 않는다: 네이버가 줬던 값은 이미 덮여서 다시 확인할 길이 없다.
     */
    addressEdited: Boolean(prev.addressEdited) || (prev.address?.trim() || null) !== address,
  };

  if (!identityChanged(draft, prev)) {
    return { extracted, match_place_id: row.match_place_id, match_confidence: row.match_confidence };
  }

  const existing = places.map(toMatchablePlace) as TPlace[];
  const rechecked = matchPlace(
    { name, type: draft.type, naverPlaceId: naverPlaceId ?? undefined, geo: geo ?? undefined, address: address ?? undefined, regionRaw: prev.regionRaw ?? undefined },
    existing,
  ) as {
    match: { id: string } | null;
    confidence: number;
    reason: string;
  };
  const tier = tierOf(rechecked.confidence, Boolean(rechecked.match));
  return {
    extracted: {
      ...extracted,
      match: { confidence: rechecked.confidence, reason: rechecked.reason, tier },
    },
    // `new` 는 짝을 비운다 — `toCandidateRow` 와 같은 규칙이다(analyzeCandidates.mjs).
    match_place_id: tier === 'new' ? null : (rechecked.match?.id ?? null),
    match_confidence: rechecked.confidence,
  };
}

/**
 * `주소 다름` 에서 **어느 주소가 맞는지 고른다** — 레일의 [원글 주소로] [검색 주소로].
 *
 * - `search` — 값은 그대로 두고 고른 표식만 남긴다(`addressChosen`). 경고가 내려가 올리기가 열린다(`addressView`).
 * - `blog` — 주소를 원글 것으로 바꾼다. **좌표를 버리는 것이 요점이다**: 그 좌표는 검색이 집은 동명의 다른 가게의 것이라
 *   남겨 두면 주소는 애월인데 마커는 서귀포에 선다. 좌표가 필요하면 고치기에서 넣는다(브라우저에는 네이버 키가 없다, ADR-016).
 *   고치기와 같은 `buildEdit` 을 지나므로 짝 재계산·`addressEdited`·AI 원본 스냅샷이 그대로 따라온다.
 *
 * **지역도 고른 주소를 따라간다.** 분석기(`resolveRegionRaw`)가 지역을 검색 주소에서 뽑았으므로, 원글 주소를 고르면
 * 같은 함수로 다시 뽑는다 — 못 뽑으면(안덕면처럼 방향이 갈리는 곳) 비워서 '지역 고르기' 로 보낸다. 옛 지역을 남기면
 * "주소는 애월인데 지역은 남쪽 (서귀포시)" 가 된다.
 */
export function chooseAddress(row: TCandidateRow, choice: TAddressChoice, places: TPlaceRow[], now = new Date()): TCandidateEdit {
  const prev = row.extracted;
  if (choice === 'search') {
    return { extracted: { ...prev, addressChosen: 'search' }, match_place_id: row.match_place_id, match_confidence: row.match_confidence };
  }
  const blog = (prev.addressAi ?? '').trim();
  const edit = buildEdit(row, { ...draftFromExtracted(prev), address: blog, lat: '', lng: '' }, places, now);
  return {
    ...edit,
    extracted: {
      ...edit.extracted,
      addressChosen: 'blog',
      regionRaw: resolveRegionRaw(blog || null, prev.regionRawAi ?? null, PLACES) ?? null,
    },
  };
}

/**
 * 고치기 전·후의 한 칸. 화면은 이것을 **"무엇이었는데 → 무엇으로"** 한 줄로 그린다.
 *
 * `editSummary`(칸 이름만 나열 — `이름 · 동반 정보`)이던 자리다. 이름만으로는 운영자가 저장 버튼 앞에서
 * "원문이 무엇이었고 내가 무엇으로 바꾸려는가" 를 볼 수 없었고, 특히 동반 정보는 한 단어(`동반 정보`)로 뭉개져
 * 실내·무게·요금 중 무엇을 건드렸는지가 화면 어디에도 없었다. 그래서 구조값도 **칸마다** 가른다.
 *
 * 값은 전부 사람이 읽는 문자열이다(빈 값은 `EMPTY_VALUE`). 비교는 `trim` 뒤에 한다 — 공백만 바뀐 것은
 * 저장해도 같은 값이 되므로(`buildEdit` 가 턴다) 바뀐 것으로 세면 저장 버튼이 빈 저장을 허락한다.
 */
export type TEditChange = {
  key: string;
  label: string;
  before: string;
  after: string;
  /** 동반 정보(구조값)의 한 칸인가 — 화면이 조건 원문 아래에 한 무리로 모은다. */
  policy?: boolean;
};

/** 빈 값의 표기. `—` 한 글자는 "→" 옆에서 거의 안 보여 "지웠다" 가 읽히지 않는다. */
export const EMPTY_VALUE = '(비어 있음)';

const INDOOR_TEXT: Record<TPolicyDraft['indoor'], string> = {
  unknown: '언급 없음',
  free: '실내 자유',
  cage: '실내는 케이지',
  outdoorOnly: '야외만',
};

const triText = (value: TTriState, yes: string, no: string) => (value === 'yes' ? yes : value === 'no' ? no : '언급 없음');
const flagText = (on: boolean) => (on ? '예' : '아니요');
const textOf = (raw: string) => raw.trim() || EMPTY_VALUE;
const linesOf = (raw: string) => toLines(raw).join(' / ') || EMPTY_VALUE;
const coordOf = (draft: TCandidateEditDraft) =>
  draft.lat.trim() || draft.lng.trim() ? `${draft.lat.trim() || '?'}, ${draft.lng.trim() || '?'}` : EMPTY_VALUE;

/** 칸 순서 = 폼의 칸 순서. 여기서 순서를 바꾸면 폼을 훑는 눈과 "바뀌는 것" 목록을 훑는 눈이 엇갈린다. */
const FIELDS: { key: string; label: string; policy?: boolean; read: (draft: TCandidateEditDraft) => string }[] = [
  { key: 'name', label: '이름', read: (d) => textOf(d.name) },
  { key: 'type', label: '종류', read: (d) => TYPE_LABEL[d.type] ?? d.type },
  { key: 'address', label: '주소', read: (d) => textOf(d.address) },
  { key: 'geo', label: '좌표', read: coordOf },
  // 붙여 넣은 꼴(주소 ↔ 숫자)만 바뀐 것은 바뀐 게 아니다 — id 로 읽는다(`identityChanged` 와 같은 규칙).
  { key: 'naverPlace', label: '네이버 플레이스', read: (d) => placeIdOf(d) ?? textOf(d.naverPlace) },
  { key: 'homepageUrl', label: '홈페이지', read: (d) => textOf(d.homepageUrl) },
  { key: 'homepageImage', label: '홈페이지 사진', read: (d) => textOf(d.homepageImage) },
  { key: 'features', label: 'AI 요약', read: (d) => textOf(d.features) },
  { key: 'petPolicyText', label: '조건 원문', read: (d) => textOf(d.petPolicyText) },
  { key: 'indoor', label: '실내', policy: true, read: (d) => INDOOR_TEXT[d.policy.indoor] },
  { key: 'largeDogOk', label: '대형견', policy: true, read: (d) => triText(d.policy.largeDogOk, '가능', '불가') },
  { key: 'feeFree', label: '추가 요금', policy: true, read: (d) => triText(d.policy.feeFree, '없음', '있음') },
  { key: 'feeLines', label: '강아지 요금', policy: true, read: (d) => linesOf(d.policy.feeLines) },
  { key: 'weightLimitKg', label: '무게 상한', policy: true, read: (d) => (d.policy.weightLimitKg.trim() ? `${d.policy.weightLimitKg.trim()}kg` : EMPTY_VALUE) },
  { key: 'maxDogs', label: '마릿수 상한', policy: true, read: (d) => (d.policy.maxDogs.trim() ? `${d.policy.maxDogs.trim()}마리` : EMPTY_VALUE) },
  { key: 'leash', label: '리드줄', policy: true, read: (d) => flagText(d.policy.leash) },
  { key: 'smallDogOnly', label: '소형견만', policy: true, read: (d) => flagText(d.policy.smallDogOnly) },
  { key: 'callFirst', label: '전화 확인', policy: true, read: (d) => flagText(d.policy.callFirst) },
  { key: 'vaccineRequired', label: '예방접종', policy: true, read: (d) => flagText(d.policy.vaccineRequired) },
  { key: 'notes', label: '그 밖의 조건', policy: true, read: (d) => textOf(d.policy.notes) },
];

/** 한 칸의 사람이 읽는 값 — 폼이 입력 옆에 "원래 값" 을 적을 때도 같은 표기를 쓴다(두 자리의 말이 갈리지 않게). */
export function editFieldText(draft: TCandidateEditDraft, key: string): string {
  return FIELDS.find((field) => field.key === key)?.read(draft) ?? '';
}

export function editChanges(draft: TCandidateEditDraft, before: TCandidateEditDraft): TEditChange[] {
  return FIELDS.flatMap((field) => {
    const was = field.read(before);
    const now = field.read(draft);
    return was === now ? [] : [{ key: field.key, label: field.label, before: was, after: now, ...(field.policy ? { policy: true } : {}) }];
  });
}

/**
 * AI 가 처음 뽑은 값 — **처음 고칠 때 한 번만** 떠 둔다(`buildEdit`). 저장이 `extracted` 를 덮어쓰므로 이것이 없으면
 * 한 번 고친 후보는 "원래 무엇이었는데 무엇으로 바꿨나" 를 영영 말할 수 없다. 두 번째 저장부터는 옛 스냅샷을
 * 그대로 들고 간다 — 매번 새로 뜨면 그것은 AI 의 값이 아니라 **직전 손질**이 된다.
 *
 * 반영기는 칸을 이름으로 골라 읽으므로(`toNewPlaceRow`·`mergeIntoExisting`) 이 칸은 `places` 로 새지 않는다.
 */
export type TAiOriginal = Pick<
  TCandidateExtracted,
  'name' | 'type' | 'address' | 'geo' | 'naverPlaceId' | 'homepage' | 'features' | 'petPolicyText' | 'petPolicy'
>;

export function aiOriginalOf(extracted: TCandidateExtracted): TAiOriginal {
  const kept = extracted.aiOriginal as TAiOriginal | undefined;
  if (kept && typeof kept === 'object') return kept;
  return {
    name: extracted.name,
    type: extracted.type,
    address: extracted.address ?? null,
    geo: extracted.geo ?? null,
    naverPlaceId: extracted.naverPlaceId ?? null,
    homepage: extracted.homepage ?? null,
    features: extracted.features ?? null,
    petPolicyText: extracted.petPolicyText ?? null,
    petPolicy: extracted.petPolicy ?? null,
  };
}

/**
 * 사람이 고친 후보면 **AI 가 뽑은 값 → 지금 값** 목록, 아니면 빈 배열. 펼친 상세가 "무엇을 고쳤나" 를 말한다.
 * 고친 적이 없거나(스냅샷 없음) 고쳤다가 되돌려 같아졌으면 빈 배열이다.
 */
export function aiEdits(extracted: TCandidateExtracted): TEditChange[] {
  if (!extracted.aiOriginal) return [];
  const ai = { ...extracted, ...(extracted.aiOriginal as TAiOriginal) } as TCandidateExtracted;
  return editChanges(draftFromExtracted(extracted), draftFromExtracted(ai));
}

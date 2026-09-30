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

import { matchPlace, normalizeName, THRESHOLD } from '../../scripts/analyze/matchPlace.mjs';
import { toMatchablePlace } from '../../scripts/lib/placeFields.mjs';
import { previewFor, TYPE_LABEL, type TCandidateExtracted, type TCandidateRow, type TCandidateTier, type TCandidateType, type TPlaceRow } from './adminCandidates';
import { policyCell, type TPolicyCell } from './adminPreview';
import type { TPetPolicyFacts, TPlace } from '../types';

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
  feeFree: TTriState;
  feeText: string;
  weightLimitKg: string;
  maxDogs: string;
  notes: string;
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
  feeFree: 'unknown',
  feeText: '',
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
    feeFree: triFrom(facts.feeFree),
    feeText: facts.feeText ?? '',
    weightLimitKg: facts.weightLimitKg == null ? '' : String(facts.weightLimitKg),
    maxDogs: facts.maxDogs == null ? '' : String(facts.maxDogs),
    notes: facts.notes ?? '',
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
    feeFree: triTo(draft.feeFree),
    feeText: draft.feeText.trim() || null,
    weightLimitKg: toNumber(draft.weightLimitKg),
    maxDogs: toNumber(draft.maxDogs),
    notes: draft.notes.trim() || null,
  };
  const empty =
    facts.indoor === 'unknown' &&
    !facts.leash &&
    facts.largeDogOk === null &&
    !facts.smallDogOnly &&
    !facts.callFirst &&
    facts.feeFree === null &&
    facts.feeText === null &&
    facts.weightLimitKg === null &&
    facts.maxDogs === null &&
    facts.notes === null;
  return empty ? null : facts;
}

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

/** 짝짓기에 쓰이는 값이 바뀌었는가. 바뀌었으면 저장할 때 **짝을 다시 계산해야 한다**(아래 주석). */
export function identityChanged(draft: TCandidateEditDraft, extracted: TCandidateExtracted): boolean {
  const before = draftFromExtracted(extracted);
  return (
    before.name.trim() !== draft.name.trim() ||
    before.type !== draft.type ||
    before.address.trim() !== draft.address.trim() ||
    before.lat.trim() !== draft.lat.trim() ||
    before.lng.trim() !== draft.lng.trim()
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

  const extracted: TCandidateExtracted = {
    ...prev,
    name,
    type: draft.type,
    address,
    geo,
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
  };

  if (!identityChanged(draft, prev)) {
    return { extracted, match_place_id: row.match_place_id, match_confidence: row.match_confidence };
  }

  const existing = places.map(toMatchablePlace) as TPlace[];
  const rechecked = matchPlace({ name, type: draft.type, geo: geo ?? undefined, address: address ?? undefined, regionRaw: prev.regionRaw ?? undefined }, existing) as {
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

/** 고친 내용을 한 줄로 — 저장 뒤 화면이 "무엇이 바뀌었는지" 를 말한다. */
export function editSummary(draft: TCandidateEditDraft, before: TCandidateEditDraft): string[] {
  const changed: string[] = [];
  if (before.name.trim() !== draft.name.trim()) changed.push('이름');
  if (before.type !== draft.type) changed.push(`종류(${TYPE_LABEL[before.type]}→${TYPE_LABEL[draft.type]})`);
  if (before.address.trim() !== draft.address.trim()) changed.push('주소');
  if (before.lat.trim() !== draft.lat.trim() || before.lng.trim() !== draft.lng.trim()) changed.push('좌표');
  if (before.features.trim() !== draft.features.trim()) changed.push('AI 요약');
  if (before.petPolicyText.trim() !== draft.petPolicyText.trim()) changed.push('조건 원문');
  // 구조값은 칸이 열이라 무엇이 바뀌었는지 일일이 세지 않는다 — 결과는 옆의 미리보기가 보여 준다.
  if (JSON.stringify(policyFactsFrom(before.policy)) !== JSON.stringify(policyFactsFrom(draft.policy))) changed.push('동반 정보');
  return changed;
}

/**
 * 이미 올린 장소(`places` 행)를 **칸 전부** 고치는 일 — 초안 · 검사 · 바뀐 칸만 담는 쓰기 · 전·후 목록 · 쓰기 하나.
 * 화면은 `src/screens/adminPagePlaceEditForm.tsx`, 쓰기를 부르는 쪽은 `adminPage` 의 `savePlace` 다.
 *
 * 사용자 결정(2026-10-04): **검수 대기는 판단만 하고, 값 수정은 등록 완료에서 한다.** 그 첫 단계로 주소·좌표 셋만 고치던
 * 폼(v25)을 이 폼이 흡수했다 — 입구가 둘이면 같은 칸의 규칙이 두 벌이 된다.
 *
 * **후보 고치기(`adminEdit.ts`)의 모양과 검사를 그대로 쓴다.** 초안 타입은 후보 초안을 넓힌 것이라 `editProblem`(이름·종류·좌표·
 * 플레이스 id·홈페이지·숫자 칸)과 `editChanges`(지금 값 → 고칠 값의 표기)가 손대지 않고 돈다. 두 폼의 말이 갈리면
 * 같은 칸이 검수 대기와 등록 완료에서 다른 값처럼 읽힌다. 여기서 더하는 것은 장소에만 있는 칸(지역·홈페이지 이름·카테고리·
 * 숙소 두 칸)과 `places` 의 칸 규칙(NOT NULL·짝 칸·칸이 없는 원격)뿐이다.
 *
 * 고치지 않는 칸: `status`(내리기·되살리기의 몫) · `source` · `sort` · `review_url` · `stay_environment`(AI 판단 jsonb — 폼 칸이 없다) ·
 * `pet_policy_guide`(AI 이용 안내 — 판단을 고치면 지문이 어긋나 저절로 숨는다, 지우거나 다시 찍지 않는다) ·
 * `archive_note`(게시 **상태**의 이력이라 고친 기록을 섞으면 내린 곳의 접힌 줄이 엉뚱한 말을 한다).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { naverPlaceHomeUrl } from '../../scripts/analyze/applyApproved.mjs';
import { normalizePhone } from '../../scripts/lib/phone.mjs';
import { correctPetPolicyFacts, type TCorrectionDrop } from '../../scripts/lib/petPolicyFacts.mjs';
import { regionUsable, type TPlaceRow } from './adminCandidates';
import {
  editChanges,
  editFieldText,
  editProblem,
  EDITABLE_TYPES,
  EMPTY_VALUE,
  policyDraftFrom,
  policyFactsFrom,
  type TCandidateEditDraft,
  type TEditChange,
} from './adminEdit';
import { placeBadges } from './adminPlaces';
import { parseNaverPlaceId } from './naverPlaceLink';
import type { TPetBadge } from './petPolicy';
import type { TPetPolicyFacts, TVerifiedMethod } from '../types';

/**
 * 폼이 들고 있는 값 — 후보 초안 + 장소에만 있는 칸. **전부 문자열**이라는 규칙도 그대로다(`policy` 만 예외, 후보와 같다 — 장소 쪽은 체크 하나 `petPolicyTextPublic` 도).
 * `features` 는 후보 폼에선 'AI 요약' 이지만 여기서는 사이트의 **소개** 다(표기만 다르고 칸은 같다).
 */
export type TPlaceEditDraft = TCandidateEditDraft & {
  /** 기존 장소들이 쓰는 표기 중 하나(`REGION_OPTIONS`) — 새 표기를 만들면 그 장소 혼자 다른 읍·면 칩을 단다. */
  regionRaw: string;
  homepageName: string;
  /** 가게 전화번호(`places.phone`) — 손으로 적은 그대로. 저장 때 `normalizePhone` 으로 한 번 접는다. 칸이 없는 원격에서는 폼에 서지 않고 늘 ''. */
  phone: string;
  category: string;
  /** 숙소일 때만 폼에 서고 쓰기에 실린다. */
  stayPriceText: string;
  stayAmenitiesText: string;
  /**
   * 조건 원문을 사이트에 그대로 내보내나(`pet_policy_text_public`, ADR-017 결정 13) — 가족이 쓴 문장만 켠다. **운영자가 정한다**:
   * 원문을 고쳤다고 저절로 바뀌지 않는다(고친 원문이 누구의 문장인지는 고친 사람만 안다).
   */
  petPolicyTextPublic: boolean;
  /**
   * 이 저장이 확인 날짜를 찍을 때(`patchVerifies`) 그 확인을 **무엇으로** 했나 — 운영자가 고른다. '' = 모른다(null 로 쓴다).
   * 저장된 값을 고치는 칸이 아니라 **저장하는 순간의 한 번 답**이라 늘 ''로 시작한다(옛 방법을 물려받으면 새 날짜에 거짓이 붙는다).
   */
  verifiedMethod: '' | TVerifiedMethod;
};

export function placeEditDraft(place: TPlaceRow): TPlaceEditDraft {
  return {
    name: place.name ?? '',
    // DB check 가 셋으로 묶어 두므로 'cafe' 로 떨어질 일은 없다 — 후보 초안(`draftFromExtracted`)과 같은 안전망.
    type: (EDITABLE_TYPES as string[]).includes(place.type) ? (place.type as TPlaceEditDraft['type']) : 'cafe',
    regionRaw: place.region_raw ?? '',
    address: place.address ?? '',
    lat: place.lat == null ? '' : String(place.lat),
    lng: place.lng == null ? '' : String(place.lng),
    // 붙여 넣는 칸은 id 다. 시드의 `naver.me` 단축 링크(`naver_url` 만 있음)는 여기 오지 않는다 — 고치지 않으면 그대로 남는다.
    naverPlace: place.naver_place_id ?? '',
    homepageUrl: place.homepage_url ?? '',
    homepageName: place.homepage_name ?? '',
    homepageImage: place.homepage_image ?? '',
    phone: place.phone ?? '',
    category: place.category ?? '',
    features: place.features ?? '',
    petPolicyText: place.pet_policy_text ?? '',
    policy: policyDraftFrom(place.pet_policy),
    stayPriceText: place.stay_price_text ?? '',
    stayAmenitiesText: place.stay_amenities_text ?? '',
    petPolicyTextPublic: place.pet_policy_text_public === true,
    verifiedMethod: '',
  };
}

/** 원격에 홈페이지 세 칸이 있나(마이그레이션 `20260930120000`) — 없는 칸을 쓰면 update 전체가 실패한다. */
const hasHomepageColumns = (place: TPlaceRow): boolean => 'homepage_url' in place;

/** 원격에 전화번호 칸이 있나(마이그레이션 `20261027120000`) — 같은 이유. 없으면 폼에 줄도 세우지 않는다. */
export const hasPhoneColumn = (place: TPlaceRow): boolean => 'phone' in place;

/** 원격에 확인 방법 칸이 있나(마이그레이션 `20261028120000`) — 같은 이유. 날짜 칸이 없으면 방법만 쓸 일이 없으니 둘 다 본다. */
export const hasVerifiedMethodColumn = (place: TPlaceRow): boolean => 'verified_at' in place && 'verified_method' in place;

/** 원격에 원문 공개 칸이 있나(마이그레이션 `20261012120000`) — 같은 이유. 없으면 폼에 체크도 세우지 않는다. */
const hasTextPublicColumn = (place: TPlaceRow): boolean => 'pet_policy_text_public' in place;

/**
 * 저장할 수 없는 이유 한 줄 — 순수. 후보 고치기와 같은 검사(`editProblem`)에 장소의 칸 규칙을 더한다.
 * 지역은 **형식**을 본다(`regionUsable` — 반영기 `toNewPlaceRow` 와 같은 줄). 비거나 방향을 못 읽으면 읍·면 칩과 방향 필터에서 빠진다.
 */
export function placeEditProblem(draft: TPlaceEditDraft): string | null {
  const base = editProblem(draft);
  if (base) return base;
  if (!regionUsable(draft.regionRaw)) return '지역을 골라 주세요.';
  // 이름은 카드의 일부라 주소 없이 혼자 남지 않는다(`homepageColumns` 와 같은 한 벌) — 조용히 버리지 않고 말한다.
  if (draft.homepageName.trim() && !draft.homepageUrl.trim()) return '홈페이지 주소 없이 이름만 둘 수 없어요.';
  const phone = normalizePhone(draft.phone);
  if ('error' in phone) return phone.error;
  return null;
}

/** 동반 정보(구조값)의 칸이 하나라도 바뀌었나 — 표기(`editChanges` 의 `policy` 줄)로 본다. 폼이 보여 주는 것과 같은 기준이다. */
const policyTouched = (draft: TPlaceEditDraft, before: TPlaceEditDraft): boolean =>
  editChanges(draft, before).some((change) => change.policy);

/**
 * 저장하면 나갈 동반 짝(원문 + 판단) — 순수.
 *
 * - 구조값을 **안 건드렸으면 판단은 원래 객체 그대로**다. 폼 모양(`policyDraftFrom` → `policyFactsFrom`)을 한 번 지나면 옛 판단의
 *   `feeText` 가 빠지고 `vaccineRequired: false` 가 생겨, 원문만 고쳐도 판단이 다른 객체가 된다(요금 계산이 옛 문장을 잃는다).
 * - 원문이 비면 판단도 비운다 — 반영기(`toNewPlaceRow`)와 같은 규칙이고, 남겨 두면 근거 없는 판단이 화면만 '판단 있음' 으로 만든다.
 * 원문 칸은 NOT NULL 이라 빈 값은 `''` 다.
 */
function petPolicyPair(place: TPlaceRow, draft: TPlaceEditDraft): { text: string; policy: TPetPolicyFacts | null } {
  const text = draft.petPolicyText.trim();
  if (!text) return { text, policy: null };
  const policy = policyTouched(draft, placeEditDraft(place)) ? policyFactsFrom(draft.policy) : (place.pet_policy ?? null);
  return { text, policy };
}

export type TPlaceEditPatch = Partial<
  Pick<
    TPlaceRow,
    | 'name'
    | 'type'
    | 'region_raw'
    | 'address'
    | 'lat'
    | 'lng'
    | 'naver_place_id'
    | 'naver_url'
    | 'homepage_url'
    | 'homepage_name'
    | 'homepage_image'
    | 'phone'
    | 'category'
    | 'features'
    | 'pet_policy_text'
    | 'pet_policy'
    | 'pet_policy_text_public'
    | 'stay_price_text'
    | 'stay_amenities_text'
    | 'verified_method'
  >
>;

const orNull = (raw: string): string | null => raw.trim() || null;
const toCoord = (raw: string): number | null => (raw.trim() ? Number(raw.trim()) : null);
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * 바뀐 칸만 담은 쓰기 — 순수. 아무것도 안 바뀌었으면 `null` 이다(빈 update 를 보내면 재빌드만 한 번 헛돈다 —
 * 트리거는 값이 같아도 UPDATE 면 부른다). 검사(`placeEditProblem`)를 통과한 초안을 받는다고 본다.
 *
 * **짝 칸은 짝으로 쓴다**(`overwriteWithLatest` 의 `OVERWRITE_PAIRS` 와 같은 묶음) — 한쪽만 바뀐 쓰기를 만들지 않는다:
 * 위도+경도 · 조건 원문+판단 · 플레이스 id+링크 · 홈페이지 세 칸.
 * - 플레이스 id 를 넣으면 링크는 그 id 의 플레이스 홈(`naverPlaceHomeUrl`)이 된다. **id 를 지우면 그 id 로 만든 링크만 함께 지운다** —
 *   지우는 이유가 "엉뚱한 가게였다" 이고 그 링크도 그 가게로 간다. 사람이 넣은 단축 링크(`naver.me`)는 남긴다. id 칸을 안 건드리면 링크는 그대로다.
 * - 홈페이지 주소를 비우면 이름·사진도 함께 빈다(카드째 빠진다).
 * - 숙소 두 칸은 **고친 종류가 숙소일 때만** 싣는다. 숙소에서 다른 종류로 바꿔도 옛 값은 지우지 않는다(사이트는 숙소일 때만 읽는다).
 * - NOT NULL 칸(`name`·`region_raw`·`features`·`pet_policy_text`)의 빈 값은 `''` 이고, 나머지는 `null` 이다.
 */
export function placeEditPatch(place: TPlaceRow, draft: TPlaceEditDraft): TPlaceEditPatch | null {
  const patch: TPlaceEditPatch = {};

  const name = draft.name.trim();
  if (name !== (place.name ?? '').trim()) patch.name = name;
  if (draft.type !== place.type) patch.type = draft.type;
  const regionRaw = draft.regionRaw.trim();
  if (regionRaw !== (place.region_raw ?? '').trim()) patch.region_raw = regionRaw;

  const address = orNull(draft.address);
  if (address !== (place.address ?? null)) patch.address = address;
  const lat = toCoord(draft.lat);
  const lng = toCoord(draft.lng);
  if (lat !== (place.lat ?? null) || lng !== (place.lng ?? null)) {
    patch.lat = lat;
    patch.lng = lng;
  }

  // 붙여 넣은 꼴(주소 ↔ 숫자)만 바뀐 것은 바뀐 게 아니다 — id 로 비교한다(`identityChanged` 와 같은 규칙).
  const parsed = parseNaverPlaceId(draft.naverPlace);
  if ('id' in parsed && parsed.id !== orNull(place.naver_place_id ?? '')) {
    patch.naver_place_id = parsed.id;
    if (parsed.id) patch.naver_url = naverPlaceHomeUrl(parsed.id);
    // id 를 지울 때 링크는 **그 id 로 만든 것일 때만** 지운다 — 사람이 넣은 단축 링크(`naver.me`)는 확인해서 넣은 값이라 남긴다.
    else if (place.naver_url && place.naver_place_id && place.naver_url === naverPlaceHomeUrl(place.naver_place_id)) patch.naver_url = null;
  }

  if (hasHomepageColumns(place)) {
    const url = orNull(draft.homepageUrl);
    const card = {
      homepage_url: url,
      homepage_name: url ? orNull(draft.homepageName) : null,
      homepage_image: url ? orNull(draft.homepageImage) : null,
    };
    if ((Object.keys(card) as (keyof typeof card)[]).some((col) => card[col] !== (place[col] ?? null))) Object.assign(patch, card);
  }

  // 번호는 저장 때 한 번 접는다(`normalizePhone`). 칸이 없는 원격에는 싣지 않는다 — 없는 칸을 쓰면 update 전체가 실패한다.
  // 사실 칸이 아니다: 확인 날짜를 찍지 않는다(`VERIFYING_COLUMNS` 에 없다).
  if (hasPhoneColumn(place)) {
    const phone = normalizePhone(draft.phone);
    const next = 'phone' in phone ? phone.phone : null;
    if (next !== (place.phone ?? null)) patch.phone = next;
  }

  const category = orNull(draft.category);
  if (category !== (place.category ?? null)) patch.category = category;
  const features = draft.features.trim();
  if (features !== (place.features ?? '').trim()) patch.features = features;

  const textTouched = draft.petPolicyText.trim() !== (place.pet_policy_text ?? '').trim();
  if (textTouched || policyTouched(draft, placeEditDraft(place))) {
    const pair = petPolicyPair(place, draft);
    // 원문이 빈 채로 구조값만 만진 경우 — 원문이 없으면 판단은 어차피 비므로 실제로 바뀌는 것이 없다.
    if (pair.text !== (place.pet_policy_text ?? '') || !sameJson(pair.policy, place.pet_policy)) {
      patch.pet_policy_text = pair.text;
      patch.pet_policy = pair.policy;
    }
  }
  // 원문 공개는 체크만 본다 — 원문을 고쳐도 저절로 끄거나 켜지 않는다(초안 타입 주석).
  if (hasTextPublicColumn(place) && draft.petPolicyTextPublic !== (place.pet_policy_text_public === true)) {
    patch.pet_policy_text_public = draft.petPolicyTextPublic;
  }

  if (draft.type === 'stay') {
    const price = orNull(draft.stayPriceText);
    if (price !== (place.stay_price_text ?? null)) patch.stay_price_text = price;
    const amenities = orNull(draft.stayAmenitiesText);
    if (amenities !== (place.stay_amenities_text ?? null)) patch.stay_amenities_text = amenities;
  }

  // 확인 날짜가 찍히는 저장이면 그 방법도 **같은 쓰기에** 싣는다(`updatePlace`). 모르면 null — 옛 날짜의 방법이 새 날짜에 남지 않게 지운다.
  if (hasVerifiedMethodColumn(place) && patchVerifies(patch)) patch.verified_method = draft.verifiedMethod || null;

  return Object.keys(patch).length ? patch : null;
}

const textOf = (raw: string): string => raw.trim() || EMPTY_VALUE;

/** 장소에만 있는 칸의 표기. 후보 칸의 표기는 `editFieldText` 가 정본이다. */
const EXTRA_FIELDS: Record<string, { label: string; read: (draft: TPlaceEditDraft) => string }> = {
  regionRaw: { label: '지역', read: (d) => textOf(d.regionRaw) },
  homepageName: { label: '홈페이지 이름', read: (d) => textOf(d.homepageName) },
  // 접힌 꼴로 보인다 — 저장되는 값과 같은 말이어야 "고친 값" 이 거짓말이 아니다. 읽을 수 없으면 적은 그대로(검사가 저장을 막는다).
  phone: {
    label: '전화번호',
    read: (d) => {
      const phone = normalizePhone(d.phone);
      return textOf('phone' in phone ? (phone.phone ?? '') : d.phone);
    },
  },
  category: { label: '카테고리', read: (d) => textOf(d.category) },
  stayPriceText: { label: '숙박 요금', read: (d) => textOf(d.stayPriceText) },
  stayAmenitiesText: { label: '숙소 시설', read: (d) => textOf(d.stayAmenitiesText) },
  petPolicyTextPublic: { label: '원문 공개', read: (d) => (d.petPolicyTextPublic ? '그대로 내보냄' : '숨김') },
};

/**
 * 한 칸의 **지금 값** 표기 — 폼의 왼쪽 열과 전·후 목록의 '전' 이 같은 말을 하게 한 곳에서 만든다.
 * 플레이스 칸만 행을 직접 본다: 시드는 id 없이 `naver.me` 링크만 있는데, 초안(id 칸)만 읽으면 '(비어 있음)' 이라는 **거짓말**이 된다.
 */
export function placeCurrentText(place: TPlaceRow, key: string): string {
  if (key === 'naverPlace' && !place.naver_place_id?.trim() && place.naver_url?.trim()) {
    return `id 없음 · 링크만 ${place.naver_url.trim()}`;
  }
  return placeFieldText(placeEditDraft(place), key);
}

/** 초안 한 칸의 사람이 읽는 값 — 장소 칸이면 여기서, 나머지는 후보 표기(`editFieldText`). */
export function placeFieldText(draft: TPlaceEditDraft, key: string): string {
  const extra = EXTRA_FIELDS[key];
  return extra ? extra.read(draft) : editFieldText(draft, key);
}

/**
 * 고치기 전·후 목록 — 순수. 칸 순서 = 폼의 칸 순서다(`adminEdit.ts` 의 `FIELDS` 와 같은 이유).
 * 쓰기(`placeEditPatch`)에 실리지 않는 칸은 목록에도 없다: 원격에 없는 홈페이지·원문 공개 칸 · 숙소가 아닌 종류의 숙소 칸.
 */
export function placeEditChanges(place: TPlaceRow, draft: TPlaceEditDraft): TEditChange[] {
  const before = placeEditDraft(place);
  const base = new Map(editChanges(draft, before).map((change) => [change.key, change]));
  const out: TEditChange[] = [];
  const take = (key: string) => {
    const extra = EXTRA_FIELDS[key];
    const change = extra
      ? extra.read(before) === extra.read(draft)
        ? undefined
        : { key, label: extra.label, before: extra.read(before), after: extra.read(draft) }
      : base.get(key);
    if (!change) return;
    // '전' 은 왼쪽 열과 같은 표기로(플레이스 칸의 `naver.me` 링크). 칸 이름은 이 화면의 말로 — 사이트에서는 소개다.
    out.push({ ...change, before: placeCurrentText(place, key), ...(key === 'features' ? { label: '소개' } : {}) });
  };

  for (const key of ['name', 'type', 'regionRaw', 'address', 'geo', 'naverPlace']) take(key);
  if (hasPhoneColumn(place)) take('phone');
  if (hasHomepageColumns(place)) for (const key of ['homepageUrl', 'homepageName', 'homepageImage']) take(key);
  for (const key of ['category', 'features', 'petPolicyText']) take(key);
  if (hasTextPublicColumn(place)) take('petPolicyTextPublic');
  out.push(...[...base.values()].filter((change) => change.policy));
  if (draft.type === 'stay') for (const key of ['stayPriceText', 'stayAmenitiesText']) take(key);
  return out;
}

/**
 * 사이트의 동반 배지 — 지금 · 저장하면. **사이트와 같은 길**(`placeBadges`)이다. 후보 폼의 `editPreview`(`previewFor`) 를 쓰지 않는 이유는
 * 접힌 줄과 같다: 이 칸이 보여 줄 것은 "지금 나가 있는 것" 과 "저장하면 나갈 것" 이고, 두 길이 어긋나면 미리보기가 거짓말을 한다.
 * `corrections` 는 판단 중 원문에 근거가 없어 사이트가 빼고 보는 것(`correctPetPolicyFacts` — 사이트가 그릴 때마다 같은 보정이 돈다).
 * `dropped` 는 같은 줄에 원문의 무엇과 대 봤는지를 붙인 것이고, `policyText` 는 그 보정이 읽은 원문 — 폼이 `correctionView` 로
 * 칠할 문자열이 **보정이 읽은 것과 같아야** 구간이 맞는다(입력란 값이 아니라 다듬은 값).
 */
export function placeEditPreview(
  place: TPlaceRow,
  draft: TPlaceEditDraft,
): { before: TPetBadge[]; after: TPetBadge[]; corrections: string[]; dropped: TCorrectionDrop[]; policyText: string } {
  const pair = petPolicyPair(place, draft);
  const { corrections, dropped } = correctPetPolicyFacts(pair.policy, pair.text);
  return {
    before: placeBadges(place),
    after: placeBadges({ ...place, pet_policy_text: pair.text, pet_policy: pair.policy }),
    corrections,
    dropped,
    policyText: pair.text,
  };
}

/**
 * **고쳐도 사이트에 안 나가는 동반 칸** — 순수(todo/14 W261010.25). 칸 이름(`editChanges` 의 label)을 돌려준다.
 *
 * 사이트는 그릴 때마다 판단을 원문에 대 보고 근거 없는 값을 뺀다(`correctPetPolicyFacts`). 그래서 원문에 "10kg" 이 없는데
 * 무게 상한에 10 을 적으면 **저장은 되는데 사이트에는 안 나간다** — 미리보기의 "원문에 없어서 사이트가 빼고 보는 것" 에만 조용히 서서,
 * 운영자는 고친 줄 알고 저장했다(parttime-14). 저장 버튼 곁에서 그 칸을 이름으로 말하려고 여기서 센다.
 *
 * 운영자가 **만진 칸만** 본다 — 손대지 않은 옛 판단이 원래 빠져 있던 것은 이 저장의 일이 아니다.
 * 보정이 낸 단서(`cue`)로 칸을 짚지 않고 **보정 전후의 칸 값**을 견준다: 단서와 칸은 1:1 이 아니다(모순 정리는 `smallDogOnly`
 * 단서로 대형견 가능을, `amount` 단서로 추가 요금 없음을 뺀다). 원문이 비면 판단째 비우므로(`petPolicyPair`) 만진 칸이 전부다.
 */
export function placeEditIneffective(place: TPlaceRow, draft: TPlaceEditDraft): string[] {
  const touched = editChanges(draft, placeEditDraft(place)).filter((change) => change.policy);
  if (!touched.length) return [];
  const pair = petPolicyPair(place, draft);
  if (!pair.text) return touched.map((change) => change.label);
  // 칸을 전부 비운 판단(`null`)은 뺄 것이 없다 — 비운 것 자체가 효과다.
  if (!pair.policy) return [];
  const kept = correctPetPolicyFacts(pair.policy, pair.text).facts;
  const raw = { ...draft, policy: policyDraftFrom(pair.policy) };
  const shown = { ...draft, policy: policyDraftFrom(kept) };
  return touched.filter((change) => editFieldText(raw, change.key) !== editFieldText(shown, change.key)).map((change) => change.label);
}

/**
 * 저장하면 **사라지고 생기는 사이트 배지** — 순수(todo/14 W261010.25). `placeEditPreview` 의 지금 · 저장하면(같은 `placeBadges` 길)을 이름으로 견준다.
 * 원문 한 줄을 고치면 손대지 않은 배지('추가요금 없음 · 최대 2마리')가 근거를 잃어 함께 빠지고, '대형견 OK' 가 '중형견 OK' 로 내려간다 —
 * 그 변화가 미리보기 칩에만 있고 저장 전 요약(바뀌는 칸 목록)에 없어 아무도 못 봤다(manager-43·44 · parttime-14b). 순서는 배지 순서 그대로다.
 */
export function placeEditBadgeShift(before: readonly TPetBadge[], after: readonly TPetBadge[]): { gone: string[]; added: string[] } {
  const was = new Set(before.map((badge) => badge.label));
  const now = new Set(after.map((badge) => badge.label));
  return { gone: [...was].filter((label) => !now.has(label)), added: [...now].filter((label) => !was.has(label)) };
}

/**
 * **사실 칸** — 고치면 "이 장소의 조건을 이날 확인했다" 가 되는 칸(조건 원문·판단 · 주소·좌표 · 숙박 요금·시설).
 * 이름·소개·카테고리·홈페이지·플레이스만 고친 저장은 확인이 아니다: 확인 날짜는 사이트에 보이고 분석이 그보다 옛 글을 `stale` 로 거르므로,
 * 소개 오타를 고친 것으로 찍히면 손님에게 거짓말이 되고 조건이 바뀌었다는 글이 걸러진다.
 */
const VERIFYING_COLUMNS = ['pet_policy_text', 'pet_policy', 'address', 'lat', 'lng', 'stay_price_text', 'stay_amenities_text'] as const;

/** 이 쓰기가 확인 날짜를 찍나 — 순수. */
export const patchVerifies = (patch: TPlaceEditPatch): boolean => VERIFYING_COLUMNS.some((col) => col in patch);

/**
 * 좌표도 플레이스 id 도 없는 장소의 이름을 바꾸나 — 순수. 그때만 쌍둥이 위험이 있다: 옛 이름으로 쓴 새 글이 짝을 못 찾아 '신규' 로 들어온다.
 * 둘 중 하나라도 있으면 `matchPlace` 가 그쪽으로 짝을 잡는다 — 늘 경고하면 정작 이 경우에 안 읽힌다.
 */
export function renameRisksTwin(place: TPlaceRow, draft: TPlaceEditDraft): boolean {
  if (draft.name.trim() === (place.name ?? '').trim()) return false;
  const parsed = parseNaverPlaceId(draft.naverPlace);
  const hasId = 'id' in parsed && Boolean(parsed.id);
  return !hasId && !(draft.lat.trim() && draft.lng.trim());
}

/**
 * 고친 칸을 쓴다. 돌려주는 행은 **서버가 준 그 행**이다 — 목록의 그 줄이 이것으로 바뀐다.
 *
 * - 확인 날짜(`verified_at`)는 **사실 칸을 고쳤을 때만**(`patchVerifies`), 칸이 있을 때만 **같은 쓰기에** 싣는다(ADR-021 R5). 따로 쓰면 재빌드 훅이 두 번 돈다.
 * - `archive_note` 에는 적지 않는다(파일 머리 주석).
 * - 재빌드는 부르지 않는다 — `places` UPDATE 라 내리기와 같은 트리거가 `published` 가 끼는 변경에서 부른다(ADR-018 결정 9).
 * - `.select().single()` 은 `setPlaceStatus` 와 같은 이유(0행을 성공으로 읽지 않는다).
 */
export async function updatePlace(
  client: SupabaseClient,
  place: TPlaceRow,
  patch: TPlaceEditPatch,
  nowIso: string = new Date().toISOString(),
): Promise<TPlaceRow> {
  const write = 'verified_at' in place && patchVerifies(patch) ? { ...patch, verified_at: nowIso } : patch;
  const { data, error } = await client.from('places').update(write).eq('id', place.id).select().single();
  if (error)
    throw new Error(`장소를 고치지 못했어요 — 다시 눌러 보고, 안 되면 로그아웃하고 다시 로그인해 주세요. (${error.message})`);
  return (data ?? { ...place, ...write }) as TPlaceRow;
}

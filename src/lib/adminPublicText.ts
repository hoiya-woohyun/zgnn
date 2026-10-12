/**
 * `/admin` 의 「사이트에 나갈 문장」 미리보기(docs/todo/21 S6).
 *
 * 공개 상세는 블로그 원문 대신 판단에서 만든 문장(`policyEvidence`)을 그리는데, 운영자는 그 문장을 `/admin` 에서 볼 수 없었다 —
 * 검수 카드는 원문과 칩만, 사이트 비교는 칸 값만 보여 줬다. 승인·덮어쓰기·고치기가 나갈 문장을 어떻게 바꾸는지 눌러 보기 전엔 몰랐다.
 *
 * 규칙 둘:
 * - **같은 함수로 만든다.** 행을 `fromPlaceRow`(`pull-db` 와 같은 변환) → `toPlaceEntry`(사이트와 같은 정책 조립) → `policyEvidence`
 *   로 지나므로 미리보기 = 사이트다. 여기서 정책을 다시 조립하면 둘이 갈린다.
 * - **"뒤" 값은 쓰기 경로가 만든다.** 등록 뒤 행은 `toNewPlaceRow`, 덮은 뒤 행은 `latestPlan` 의 patch, 고친 뒤 행은 `placeEditPatch` 의
 *   patch 를 그대로 받는다. 손으로 조립하면 본 것과 쓴 것이 갈린다.
 *
 * 안 나가는 안내·notes 와 그 이유(`hidden`)는 `policyEvidence` 옆에서 같은 인자로 다시 모은다 — `policyEvidence` 는 이유를 버린다.
 */

import { toNewPlaceRow } from '../../scripts/analyze/applyApproved.mjs';
import { fromPlaceRow } from '../../scripts/lib/placeFields.mjs';
import type { TPlace } from '../types';
import type { TCandidateExtracted, TCandidateRow, TPlaceRow } from './adminCandidates';
import { latestPlan } from './adminLatest';
import { policyEvidence, publicGuide, publicNotes, type TPolicyEvidence } from './petPolicyPublic';
import { toPlaceEntry } from './places';

export type TPublicTextHidden = { key: 'guide' | 'notes'; label: string; text: string; reasons: string[] };
export type TPublicTextPreview = { evidence: TPolicyEvidence; hidden: TPublicTextHidden[] };
export type TPublicTextChange = { before: TPublicTextPreview; after: TPublicTextPreview; changed: boolean };

const RAW_REASON = '원문을 그대로 내보내는 곳이라 안 나가요';

/** 장소(앱 타입) → 사이트가 그릴 문장 + 안 나가는 안내·notes. 사이트의 `policyEvidence` 와 같은 인자를 쓴다(지문은 저장된 `petPolicy`, 가드 대조군은 원문). */
export function publicTextPreview(place: TPlace): TPublicTextPreview {
  const entry = toPlaceEntry(place);
  const evidence = policyEvidence(entry);
  const guideText = place.petPolicyGuide?.text?.trim() ?? '';
  const notesText = place.petPolicy?.notes?.trim() ?? '';
  const hidden: TPublicTextHidden[] = [];

  if (evidence.kind === 'raw') {
    if (guideText) hidden.push({ key: 'guide', label: '이용 안내', text: guideText, reasons: [RAW_REASON] });
    if (notesText) hidden.push({ key: 'notes', label: '그 밖의 조건', text: notesText, reasons: [RAW_REASON] });
    return { evidence, hidden };
  }

  const guide = publicGuide(place.petPolicyGuide, place.petPolicy, place.petPolicyText);
  if (guideText && guide.text === null) hidden.push({ key: 'guide', label: '이용 안내', text: guideText, reasons: guide.reasons });
  if (notesText) {
    if (guide.text !== null) {
      hidden.push({ key: 'notes', label: '그 밖의 조건', text: notesText, reasons: ['이용 안내가 대신 나가요'] });
    } else {
      const notes = publicNotes(notesText, place.petPolicyText);
      if (notes.text === null) hidden.push({ key: 'notes', label: '그 밖의 조건', text: notesText, reasons: notes.reasons });
    }
  }
  return { evidence, hidden };
}

/** 사이트 행(`places` 테이블) → 미리보기. `pull-db` 와 같은 변환을 지난다. */
export const rowPublicText = (row: TPlaceRow): TPublicTextPreview => publicTextPreview(fromPlaceRow(row) as TPlace);

/**
 * 신규 묶음 — 등록하면 나갈 문장. 승인 쓰기(`toNewPlaceRow`)가 원문·판단·안내 규칙을 정하게 두고 다시 쓰지 않는다.
 * 그런데 `toNewPlaceRow` 는 종류 'other'·이름 없음·지역 없음/형식 틀림이면 던진다 — 검수 대기엔 그런 후보가 흔하다(운영자가 지역을 고른 뒤 등록).
 * 그 세 칸은 문장과 무관하므로 그 칸만 무해한 값으로 바꿔 같은 길로 다시 만든다.
 */
export function newPlacePublicText(candidate: TCandidateRow): TPublicTextPreview {
  const extracted = candidate.extracted;
  const type = extracted.type === 'stay' || extracted.type === 'restaurant' || extracted.type === 'cafe' ? extracted.type : 'cafe';
  const row = toNewPlaceRow(
    { ...candidate, extracted: { ...extracted, type, name: extracted.name?.trim() || '미리보기', regionRaw: '동쪽 (구좌읍)' } },
    { id: 'preview', guideColumn: true },
  );
  return rowPublicText(row as unknown as TPlaceRow);
}

/** 고치기·덮어쓰기의 전후. `patch` 가 null(바뀌는 칸 없음)이면 뒤 = 앞. */
export function patchPublicText(place: TPlaceRow, patch: Record<string, unknown> | null): TPublicTextChange {
  const before = rowPublicText(place);
  if (!patch) return { before, after: before, changed: false };
  const after = rowPublicText({ ...place, ...patch } as TPlaceRow);
  return { before, after, changed: JSON.stringify(before.evidence) !== JSON.stringify(after.evidence) };
}

/** 사이트 비교의 「덮으면」 — 고른 칸(`picked`, 없으면 전부)만 `latestPlan` 이 patch 로 만든 그대로. */
export const overwritePublicText = (place: TPlaceRow, extracted: TCandidateExtracted, picked?: string[]): TPublicTextChange =>
  patchPublicText(place, latestPlan(place, extracted, picked).patch);

/**
 * 사이트 값 칸의 목소리. 칸 하나(`pet_policy_text_public`)가 정본이다 — `source` 는 기본값이 'notion' 이고 블로그 값으로 덮어써도 그대로라
 * 믿을 수 없다. 블로거 문장을 짱구누나 문장처럼 보이게 하지 않는다.
 */
export const siteTextVoice = (place: Pick<TPlaceRow, 'pet_policy_text_public'>): 'family' | 'blog' =>
  place.pet_policy_text_public === true ? 'family' : 'blog';

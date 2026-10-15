/**
 * 공개 상세의 **조건 문장** — 블로그 원문 대신 판단에서 만든다(ADR-017 결정 13 D1, docs/todo/21 S2).
 *
 * 조건 원문(`petPolicyText`)은 블로그 문장을 글자 그대로 옮긴 대조군이라 사이트에 내보내지 않는다(레포도 PUBLIC). 대신
 * 1. 판단 칸마다 해요체 한 줄(`publicPolicyLines`) — 배지와 같은 판단(`TPetPolicy`)에서 만들어 판정과 갈릴 수 없다.
 * 2. 그 밑에 AI 가 자기 말로 쓴 안내(`publicGuide`), 없으면 notes 한 줄(`publicNotes`) — 둘 다 가드를 지난 것만.
 *
 * 가드·지문은 분석 시점에도 돌아야 해서 `scripts/lib/petPolicyGuide.mjs` 에 있다. 이 파일은 그것을 화면 쪽 모양으로 감싼다.
 */

import { normalizeFeeLines } from '../../scripts/lib/feeLine.mjs';
import { guardPublicText, POLICY_TOPICS, policyFingerprint, topicReasons } from '../../scripts/lib/petPolicyGuide.mjs';
import type { TPetPolicyFacts, TPetPolicyGuide, TPlace } from '../types';
import { cageGear, dogCountTiers, type TPetPolicy } from './petPolicy';

export type TPolicyTopic = keyof typeof POLICY_TOPICS;

/** 템플릿 한 줄 — `key` 는 그 줄을 만든 판단 칸(React key · `/admin` 미리보기가 칸과 줄을 잇는다). */
export type TPublicLine = { key: TPolicyTopic; text: string };

/** 가드를 거친 AI 문장. 못 지나면 `text` 가 null 이고 `reasons` 에 왜 숨었는지(`/admin` 미리보기용). */
export type TPublicText = { text: string | null; reasons: string[] };

/**
 * `indoor: 'cage'` 의 말 — 근거 문장(+ 다음 문장)이 가방·유모차를 직접 적었으면 그 말로. 배지(`cageBadge`)·판정 C2·C3 과 같은 `cageGear` 를 봐야
 * 칩은 "이동가방 필요" 인데 문장은 "케이지에 넣어야" 라고 말하는 일이 없다.
 */
const cageLine = (policy: TPetPolicy): string => {
  const { bag, stroller } = cageGear(policy);
  if (bag && stroller) return '실내에서는 이동가방이나 유모차가 있어야 해요';
  if (bag) return '실내에서는 이동가방에 넣어야 해요';
  if (stroller) return '실내에서는 유모차에 태워야 해요';
  return '실내에서는 케이지에 넣어야 해요';
};

/**
 * 판단 칸마다 한 줄. **선언 순서가 화면 순서**이고 배지(`toPetBadges`)와 같다 — 실내 · 요금 · 요일 · 크기 · 무게 · 마릿수 · 목줄 · 접종 · 전화.
 * 고르는 규칙도 배지와 같다(크기는 한 줄 · 요금은 무료 > 줄 > '있음' · 전화는 정보 없음/못 읽음이 아닐 때). 같은 판단을 칩과 문장이 다르게 말하면
 * 사용자는 어느 쪽을 믿을지 모른다.
 *
 * `satisfies Record<TPolicyTopic, …>` 가 칸 짝을 강제한다 — `POLICY_TOPICS` 에 칸을 더하고 여기를 빠뜨리면 타입이 깨진다.
 */
const TEMPLATES = {
  indoor: (p) => {
    if (p.indoor === 'free') return '실내에도 같이 들어갈 수 있어요';
    if (p.indoor === 'cage') return cageLine(p);
    if (p.indoor === 'outdoorOnly') return '야외 자리에서만 같이 있을 수 있어요';
    // 실내 언급은 없고 '실외는 자유' 만 읽힌 곳(정규식 단서) — 배지는 없지만 판정(outdoorFree)이 쓰는 말이다.
    return p.outdoorFree ? '야외에서는 자유롭게 같이 있을 수 있어요' : null;
  },
  feeFree: (p) => {
    if (p.feeFree) return '반려견 추가 요금은 없어요';
    // 요금이 있다고만 읽고 금액 줄은 못 뽑은 곳 — 배지 '추가요금 있음' 과 같은 자리.
    return p.feeLines.length === 0 && p.feeCharged ? '반려견 요금이 따로 붙어요(금액은 적혀 있지 않아요)' : null;
  },
  // 요금 줄은 배지와 같은 정규화를 거친 label 이다(20자 이내 · 이미 칩으로 공개된다) — 블로그 문장이 아니다.
  fees: (p) => (!p.feeFree && p.feeLines.length ? `반려견 요금이 따로 있어요 — ${normalizeFeeLines(p.feeLines).join(' · ')}` : null),
  petDays: (p) => (p.petDays?.length ? `반려견 동반은 ${p.petDays.join('·')}요일에만 돼요` : null),
  // 크기는 배지처럼 한 줄만: 대형견 불가 > 대형견 OK > 중형견 OK > 소형견만. 큰 쪽이 되면 작은 쪽은 말할 필요가 없다.
  largeDogOk: (p) => {
    if (p.largeDogNo) return '대형견은 같이 갈 수 없어요';
    if (p.largeDogOk) return '대형견도 같이 갈 수 있어요';
    return p.mediumDogOk ? '중형견까지 같이 갈 수 있어요' : null;
  },
  smallDogOnly: (p) => (p.smallDogOnly && !p.largeDogNo && !p.largeDogOk && !p.mediumDogOk ? '소형견만 같이 갈 수 있어요' : null),
  // 경계는 배지와 같은 tier 에서 읽는다 — '이하' 와 '미만' 을 칩과 문장이 다르게 말하면 경계에 선 강아지에게 두 답이 된다(14 W261007.8).
  weightLimitKg: (p) => {
    if (p.weightLimitKg === undefined) return null;
    const tier = p.tiers.find((t) => t.maxWeightKg === p.weightLimitKg);
    return `${p.weightLimitKg}kg ${tier?.weightInclusive ? '이하' : '미만'}인 강아지만 같이 갈 수 있어요`;
  },
  maxDogs: (p) => {
    // 구간마다 마릿수가 다르면 배지처럼 구간마다 말한다 — '최대 2마리' 로 접으면 20kg 미만 1마리와 반대로 읽힌다(14 W261013.1b).
    const tiers = dogCountTiers(p);
    if (tiers) {
      const parts = tiers.map((t) => `${t.maxWeightKg}kg ${t.weightInclusive ? '이하는' : '미만은'} ${t.maxDogs}마리`);
      return `${parts.join(', ')}까지 같이 갈 수 있어요`;
    }
    if (p.maxDogs !== undefined) return `최대 ${p.maxDogs}마리까지 같이 갈 수 있어요`;
    return p.unlimitedDogs ? '마릿수 제한은 없어요' : null;
  },
  leash: (p) => (p.leash ? '리드줄을 꼭 해 주세요' : null),
  vaccineRequired: (p) => (p.vaccineRequired ? '예방접종을 마친 강아지만 들어갈 수 있어요' : null),
  callFirst: (p) => (p.callFirst && !p.noInfo && !p.unread ? '가기 전에 전화로 동반 조건을 확인해 주세요' : null),
} satisfies Record<TPolicyTopic, (p: TPetPolicy) => string | null>;

/**
 * 판단에서 만든 조건 문장들. `policy` 는 배지·판정이 쓰는 것과 **같은 값**(`TPlaceEntry.policy`)을 넘긴다 — AI 판단이 있으면
 * `withPolicyFacts` 가 이미 원문 대조(`correctPetPolicyFacts`)를 거친 값이라, 원문에 근거 없는 숫자는 여기 오지 않는다.
 */
export const publicPolicyLines = (policy: TPetPolicy): TPublicLine[] =>
  (Object.keys(TEMPLATES) as TPolicyTopic[]).flatMap((key) => {
    const text = TEMPLATES[key](policy);
    return text ? [{ key, text }] : [];
  });

const HIDDEN: TPublicText = { text: null, reasons: [] };

/**
 * AI notes(판정 칸이 못 담은 조건) 한 줄 — 가드를 지나면 그대로, 아니면 null. 판단 주제 검사는 하지 않는다: notes 는 판단이 못 담은
 * **조건**을 적는 칸이라 주제가 겹치는 것이 정상이다. 베낌·없는 숫자·없는 조건만 본다.
 */
export const publicNotes = (notes: string | null | undefined, rawText: string): TPublicText => {
  const text = notes?.trim();
  if (!text) return HIDDEN;
  const { ok, reasons } = guardPublicText(text, rawText, { topics: false });
  return ok ? { text, reasons: [] } : { text: null, reasons };
};

/**
 * AI 가 쓴 이용 안내 — 쓴 시점의 판단(`basis`)이 **저장된 지금 판단**과 같고 판단 주제를 말하지 않을 때만.
 * `facts` 는 저장된 값 그대로(`place.petPolicy`) 넘긴다 — 런타임 대조를 다시 돌린 값이 아니다(`policyFingerprint` 주석).
 *
 * 베낌·없는 숫자·없는 조건은 **여기서 보지 않는다**(21 S7) — 안내의 재료는 본문이고 앱에는 본문이 없다. 조건 원문에 대 보면
 * "2층 창가 자리가 조용해요" 같은 멀쩡한 안내가 다 숨는다. 그 검사는 안내를 실을 때 본문에 대 보고 끝냈다(`storableGuide`).
 */
export const publicGuide = (guide: TPetPolicyGuide | null | undefined, facts: TPetPolicyFacts | null | undefined): TPublicText => {
  const text = guide?.text?.trim();
  if (!guide || !text) return HIDDEN;
  const reasons = guide.basis === policyFingerprint(facts) ? [] : ['판단이 바뀌어 숨겼어요'];
  reasons.push(...topicReasons(text));
  return reasons.length ? { text: null, reasons } : { text, reasons: [] };
};

/**
 * 근거 칸 밑 AI 한 줄 — 안내가 나가면 안내, 아니면 notes(가드를 지난 것만). **"안내 > notes" 를 정하는 곳은 이 하나다** —
 * 조립(`derivePlace`)은 `text` 만 싣고(빌드에서 비공개 행), `/admin` 미리보기는 `guide`·`notes` 의 이유를 쓴다.
 * 안내의 지문은 **저장된** `petPolicy` 에 대고(대조를 다시 돌린 정책을 넘기면 지문이 늘 어긋난다), notes 가드의 대조군은 원문이다.
 */
export const policyNoteOf = (
  place: Pick<TPlace, 'petPolicyText' | 'petPolicy' | 'petPolicyGuide'>,
): { guide: TPublicText; notes: TPublicText; text: string | null } => {
  const guide = publicGuide(place.petPolicyGuide, place.petPolicy);
  const notes = guide.text !== null ? HIDDEN : publicNotes(place.petPolicy?.notes, place.petPolicyText ?? '');
  return { guide, notes, text: guide.text ?? notes.text };
};

/**
 * 템플릿 줄이 하나도 안 나온 곳의 한 줄. `TEMPLATES` 는 **조건 칸**만 말해서 판정이 따로 세우는 상태 — 동반 불가(H1) · 못 읽음(C7) ·
 * 일반 허용 문장뿐(C9) · 원문 없음(U1) — 에는 줄이 없다. 비워 두면 판정은 "어려움"·"확인" 인데 근거 칸이 텅 빈다.
 * 못 읽음이 "원문" 을 가리키는 것은 판정 C7("원문을 확인해 주세요")과 같은 말을 하려는 것 — 원문은 밑의 「후기에서 원문 보기」 링크다.
 */
const emptyLine = (policy: TPetPolicy): string => {
  if (policy.notAllowed) return '반려견 동반이 안 된다고 적혀 있어요';
  if (policy.unread) return '조건을 자동으로 정리하지 못했어요. 원문에서 확인해 주세요';
  if (policy.noInfo) return '동반 조건이 적혀 있지 않아요';
  return '반려견과 같이 갈 수 있다고만 적혀 있어요';
};

/**
 * 상세 「반려동물 이용」 근거 칸에 무엇을 그리나(21 S5). 원문 공개(시드 — 가족이 쓴 문장)면 원문 그대로,
 * 아니면 판단에서 만든 줄 + 안내(없으면 notes) 한 줄. **키가 없으면 숨김**이다(`TPlace.petPolicyTextPublic`).
 */
export type TPolicyEvidence =
  | { kind: 'raw'; text: string }
  | { kind: 'derived'; lines: string[]; note: string | null };

/** 근거 칸이 보는 것 — 화면 항목(`TPlaceEntry`)의 칸들이다. 원문은 공개 행의 `publicPolicyText` 뿐이다(21 S8). */
type TEvidencePlace = { petPolicyTextPublic?: boolean; publicPolicyText?: string; policy: TPetPolicy; policyNote: string | null };

/**
 * 템플릿은 배지와 같은 `policy`, 그 밑 한 줄은 조립이 `policyNoteOf` 로 이미 고른 `policyNote`(안내의 지문·notes 가드는 원문·판단이 있는 곳에서 돈다).
 */
export const policyEvidence = (place: TEvidencePlace): TPolicyEvidence => {
  if (place.petPolicyTextPublic === true) return { kind: 'raw', text: place.publicPolicyText ?? '' };
  const lines = publicPolicyLines(place.policy).map((line) => line.text);
  return { kind: 'derived', lines: lines.length ? lines : [emptyLine(place.policy)], note: place.policyNote };
};

/**
 * 화면에 실제로 나가는 글. 배지(`PetBadges sourceText`)는 이 글에 요금 줄이 이미 있으면 칩을 숨기는데, 원문을 넘기면
 * **화면에 없는 글**을 보고 숨긴다 — 비공개 행에서 요금이 칩에도 문장에도 안 보이게 된다(테스트는 통과한다).
 */
export const evidenceText = (evidence: TPolicyEvidence): string =>
  evidence.kind === 'raw' ? evidence.text : [...evidence.lines, evidence.note ?? ''].filter(Boolean).join('\n');

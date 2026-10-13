/**
 * 판정 스냅숏(`placesVerdicts.test.ts`)이 장소 한 곳에서 보는 칸 — 앱 코드는 import 하지 않는다(테스트 전용 모듈).
 * 테스트 파일에 두지 않는 이유: 다른 테스트(`placeDerive.test.ts`)가 같은 비교를 쓰는데, `.test.ts` 를 import 하면 그 파일의
 * `describe`·`it` 이 두 번 등록된다.
 *
 * **원문 조각은 넣지 않는다**(PUBLIC 레포, 21 S8) — 정책의 근거 문장(`sources`·`tiers[].source`·`indoorGearText`·`feeText`)과
 * 판정 이유의 인용(`quote`)은 블로그 문장 그대로다. 공개 행의 근거 칸도 `raw` 한 단어로만 적는다.
 */

import type { TDogProfile } from '../types';
import { feeUnitNote } from './dogFee';
import { judgeEligibility } from './eligibility';
import { cageGear, toPetBadges } from './petPolicy';
import { policyEvidence } from './petPolicyPublic';
import type { TPlaceEntry } from './places';

/**
 * 강아지 다섯 — `scripts/analyze/evalExtract.mjs` 의 `DOG_PROFILES` 와 같은 값이다. import 하지 않는 이유: 이 파일은 `src/` 의 비테스트 모듈이라
 * 사이트 번들 검사(`browserBundleRegex.test.ts`)의 대상이고, 그 모듈엔 브라우저가 못 읽는 정규식(lookbehind)이 있다.
 */
export const PROFILES: { id: string; dog: TDogProfile }[] = [
  { id: 'small4', dog: { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag' } },
  { id: 'medium12', dog: { dogs: [{ name: '보리', weightKg: 12 }], carrier: 'none' } },
  { id: 'large28', dog: { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' } },
  { id: 'two5and8', dog: { dogs: [{ name: '콩', weightKg: 5 }, { name: '팥', weightKg: 8 }], carrier: 'stroller' } },
  { id: 'small6none', dog: { dogs: [{ name: '초코', weightKg: 6 }], carrier: 'none' } },
];

/** 원문에서 오는 칸 + 조립이 얹는 판독 칸(`indoorGear`) — 판정이 아니라 판정의 재료라 비교에서 뺀다. */
const RAW_KEYS = new Set(['sources', 'indoorGearText', 'feeText', 'indoorGear']);

const policyLine = (entry: TPlaceEntry): string =>
  JSON.stringify(entry.policy, (key, value) => {
    if (RAW_KEYS.has(key)) return undefined;
    // 근거 문장 — tier 안쪽 칸이라 키 이름으로 가린다(`source` 는 정책의 다른 자리에 없다).
    if (key === 'source') return undefined;
    return value;
  });

const evidenceLine = (entry: TPlaceEntry): string => {
  const evidence = policyEvidence(entry);
  return evidence.kind === 'raw' ? 'raw' : JSON.stringify({ lines: evidence.lines, note: evidence.note });
};

const verdictLines = (entry: TPlaceEntry): string[] =>
  PROFILES.flatMap(({ id, dog }) =>
    [false, true].map((needsIndoor) => {
      const e = judgeEligibility(dog, entry.policy, { needsIndoor });
      const reasons = e.reasons.map((r) => `${r.rule}:${r.level}:${r.text}`).join(' / ');
      const unit = feeUnitNote(entry.type, entry.feeUnitStated, entry.policy, e.fee);
      return `${id}${needsIndoor ? '+indoor' : ''} ${e.level} | ${reasons} | ${e.fee ?? ''} | ${unit ?? ''}`;
    }),
  );

/** 장소 한 곳의 덩어리 — 칸마다 한 줄. */
export const placesVerdictView = (entry: TPlaceEntry): string =>
  [
    `## ${entry.id}`,
    `public ${entry.petPolicyTextPublic === true}`,
    `policy ${policyLine(entry)}`,
    `gear ${JSON.stringify(cageGear(entry.policy))}`,
    `badges ${toPetBadges(entry.policy).map((b) => `${b.tone}:${b.label}`).join(' · ')}`,
    `evidence ${evidenceLine(entry)}`,
    `env ${JSON.stringify(entry.environment ?? null)}`,
    ...verdictLines(entry),
  ].join('\n');

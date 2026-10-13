/**
 * 장소 원문 → 판정 입력. **원문(`petPolicyText`)·AI 판단(`petPolicy`)·안내(`petPolicyGuide`)를 읽는 곳은 이 파일 하나다**(21 S8, ADR-017 결정 13 D5).
 *
 * 세 곳이 같은 `derivePlace` 를 부른다 — 입력이 다를 뿐 조립은 하나다(S6 메모: 길이 갈리면 `/admin` 미리보기만 조용히 사이트와 다르다).
 * - 빌드(`scripts/pull-db.mjs` → `toSnapshotRow`): 블로그 출처(비공개) 행. 원문 대신 계산 결과(`derived`)만 `places.json` 에 싣는다 —
 *   레포가 PUBLIC 이고 webpack 은 JSON 을 통째로 번들에 넣어서, 화면에서만 숨기면 원문이 git 과 번들에 그대로 남는다.
 * - 사이트 런타임(`places.ts` → `toPlaceEntry`): 원문 공개(시드) 행 — 원문이 어차피 화면에 나간다.
 * - `/admin`(`adminPublicText.ts`): DB 행(원문이 있다).
 *
 * 장소 칸에서 오는 얹기(`withVerifiedAt`·`withPlaceType`)는 런타임 `toPlaceEntry` 에 남긴다 — 미리 계산이 낡는 범위를 줄이려고.
 * **`places.json` 을 import 하지 않는다**: `pull-db` 가 이 모듈을 부르는데, 불러오는 순간 옛 스냅샷을 읽게 된다.
 * `pull-db` 가 node `--experimental-strip-types` 로 이 파일을 그대로 부른다 — 지울 수 있는 TS 문법만 쓰고(`enum` 없음), `@/` 별칭을 쓰지 않는다.
 */

import { mergeStayEnvironment, parseStayEnvironment } from '../../scripts/lib/stayEnvironment.mjs';
import type { TPlace, TStayEnvironment } from '../types';
import { mentionsFeeUnit } from './dogFee';
import { cageGear, parsePetPolicy, withPlaceType, withPolicyFacts, withVerifiedAt, type TPetPolicy } from './petPolicy';
import { policyNoteOf } from './petPolicyPublic';

/** 원문을 읽어야 나오는 것 전부. */
export type TPlaceDerived = {
  /** 정규식 + AI 판단(원문 대조) + 가방/유모차 판독(`indoorGear`). 장소 칸 얹기(`verified`·`seating`) 전 */
  policy: TPetPolicy;
  /** 숙소만 */
  environment?: TStayEnvironment;
  /** 원문·요금 줄이 요금 단위(1박마다·한 번)를 말한다 — 상세 요금 줄 밑 "1박 기준인지는…" 을 끈다(`feeUnitNote`) */
  feeUnitStated: boolean;
  /** 비공개 행 근거 칸 밑 한 줄(안내 > notes, 가드 통과분 — `policyNoteOf`). 공개 행은 원문이 나가므로 null */
  policyNote: string | null;
};

type TRawKey = 'petPolicyText' | 'petPolicy' | 'petPolicyGuide';

/** `places.json` 의 비공개 행 — 원문·판단·안내 대신 `derived` 하나. */
export type TPlacePrecomputed = Omit<TPlace, TRawKey | 'petPolicyTextPublic'> & { derived: TPlaceDerived };
export type TPlaceSnapshotRow = TPlace | TPlacePrecomputed;

/** 화면이 쓰는 항목. **원문이 없다** — 공개 행의 원문은 `publicPolicyText` 로만 나간다(런타임에 원문을 새로 읽는 코드는 컴파일이 깨진다). */
export type TPlaceEntry = Omit<TPlace, TRawKey> & {
  publicPolicyText?: string;
  policy: TPetPolicy;
  environment?: TStayEnvironment;
  feeUnitStated: boolean;
  policyNote: string | null;
};

/**
 * 숙소 환경(10 F6) — AI 가 읽은 값(`stay.environment`)이 칸마다 정본이고, 없는 칸은 소개·용품·조건 원문을 정규식으로 읽는다(시드의 대조군).
 * 판정에는 넣지 않는다(선호다) — 숙소 필터와 상세의 한 줄만 쓴다.
 */
const environmentOf = (place: TPlace): TStayEnvironment | undefined =>
  place.stay
    ? (mergeStayEnvironment(
        parseStayEnvironment([place.features, place.stay.amenitiesText, place.petPolicyText].join('\n')),
        place.stay.environment ?? null,
      ) as TStayEnvironment)
    : undefined;

/** 유일한 원문 읽기. 블로그 경로의 장소는 AI 판단(petPolicy)이 정규식 결과를 덮는다. 시드는 petPolicy 가 없어 정규식 그대로(ADR-017). */
export function derivePlace(place: TPlace): TPlaceDerived {
  const text = place.petPolicyText ?? '';
  const parsed = withPolicyFacts(parsePetPolicy(text), place.petPolicy, text);
  // 가방·유모차는 근거 문장을 읽어야 안다 — 그 문장은 비공개 행에서 지워지므로 답을 칸으로 얹는다(판정 C2·C3·배지·템플릿이 이 칸을 먼저 본다).
  const policy: TPetPolicy = { ...parsed, indoorGear: cageGear(parsed) };
  return {
    policy,
    environment: environmentOf(place),
    feeUnitStated: mentionsFeeUnit([text, ...policy.feeLines].join(' ')),
    policyNote: place.petPolicyTextPublic === true ? null : policyNoteOf(place).text,
  };
}

/** 원문 조각(근거 문장·다음 문장·요금 첫 줄)을 지운다 — 판정은 `indoorGear`·`feeLines` 로 같고, 인용(quote)만 사라진다. */
export function redactDerived(derived: TPlaceDerived): TPlaceDerived {
  const policy: TPetPolicy = {
    ...derived.policy,
    sources: {},
    tiers: derived.policy.tiers.map((tier) => {
      const copy = { ...tier };
      delete copy.source;
      return copy;
    }),
  };
  delete policy.indoorGearText;
  delete policy.feeText;
  return { ...derived, policy };
}

/**
 * DB 에서 온 장소 한 건 → `places.json` 의 행. 공개 행은 **같은 객체 그대로**(바이트가 안 바뀐다), 비공개 행은 원문 자리에 `derived`.
 * 키 순서는 원래 행을 따른다(`toPlace` 가 정한 순서 — diff 가 읽히게).
 */
export function toSnapshotRow(place: TPlace): TPlaceSnapshotRow {
  if (place.petPolicyTextPublic === true) return place;
  const derived = redactDerived(derivePlace(place));
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(place)) {
    if (key === 'petPolicyText') row.derived = derived;
    else if (key !== 'petPolicyTextPublic' && key !== 'petPolicy' && key !== 'petPolicyGuide') row[key] = value;
  }
  if (!('derived' in row)) row.derived = derived;
  return row as TPlacePrecomputed;
}

const RAW_KEYS: readonly string[] = ['petPolicyText', 'petPolicy', 'petPolicyGuide', 'derived'];

/**
 * `places.json` 의 행(또는 DB 행) → 화면이 쓰는 항목. 미리 계산된 행은 `derived` 를, 원문이 있는 행은 `derivePlace` 를 쓴다 —
 * 옛 모양(원문이 있고 `derived` 가 없는 비공개 행)도 받으므로 데이터와 코드 중 어느 쪽이 먼저 바뀌어도 사이트가 안 깨진다.
 * 원문도 `derived` 도 없는 행은 빈 원문(= 정보 없음)으로 조립된다 — 던지면 사이트 전체가 죽는다. 그런 행은 구조 테스트가 막는다.
 */
export function toPlaceEntry(row: TPlaceSnapshotRow): TPlaceEntry {
  const derived = 'derived' in row ? row.derived : derivePlace(row);
  const rest: Record<string, unknown> = { ...row };
  for (const key of RAW_KEYS) delete rest[key];
  const place = rest as Omit<TPlace, TRawKey>;
  return {
    ...place,
    ...('petPolicyText' in row && row.petPolicyTextPublic === true ? { publicPolicyText: row.petPolicyText } : {}),
    // 확인 기록(verifiedAt)은 여기서 얹는다 — 일반 허용 문장뿐인 곳의 판정(C9)이 그것을 본다. 종류(식당·카페냐)는 C12 가 본다.
    policy: withPlaceType(withVerifiedAt(derived.policy, place.verifiedAt), place.type),
    environment: derived.environment,
    feeUnitStated: derived.feeUnitStated,
    policyNote: derived.policyNote,
  };
}

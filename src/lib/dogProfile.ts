/**
 * localStorage 에서 읽은 강아지 프로필을 스펙에 맞게 검증·변환한다.
 *
 * 스토어(`useAppStore`)가 아니라 여기 두는 이유는 순수 함수라 테스트가 zustand 와 장소 데이터
 * 없이 돌아야 해서다.
 */

import type { TCarrier, TDogEntry, TDogProfile, TDogSize } from '../types';
import { dogCallNames, withJosa } from './korean';

export const MAX_DOGS = 3;
export const DOG_NAME_MAX_LENGTH = 12;

/**
 * 이 몸무게를 **넘으면 저장 전에 한 번 묻는다**(12 U3.6). "7.0" 을 "70" 으로 잘못 쳐도 형식은 맞아서 조용히 대형견이 되고,
 * 식당 대부분이 '어려움' 으로 뒤집힌다. 막지는 않는다 — 실제로 50kg 이 넘는 개도 있다(그레이트 피레니즈·마스티프).
 * 처음엔 80 이었다 — 그러면 정작 그 예(70)를 못 잡는다. 묻기만 하므로 큰 개에게 드는 값은 탭 한 번이다.
 */
export const HEAVY_DOG_CONFIRM_KG = 50;

/** 확인이 필요한 몸무게의 강아지만. 경계값(50kg)은 묻지 않는다. */
export const heavyDogs = (dogs: TDogEntry[]): TDogEntry[] => dogs.filter((d) => d.weightKg > HEAVY_DOG_CONFIRM_KG);

/**
 * 라디오 그룹에서 화살표 키가 가리키는 다음 칸(처음↔끝은 이어진다). 방향 키가 아니면 `null`.
 * 직접 만든 `role="radio"` 는 브라우저가 화살표를 처리해 주지 않아 우리가 한다(12 U3.6).
 */
export const radioIndexAfterKey = (key: string, index: number, count: number): number | null => {
  if (key === 'ArrowDown' || key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (index - 1 + count) % count;
  return null;
};

/** 판정·요금이 함께 쓰는 최대 몸무게. 빈 배열이면 0 — `Math.max()` 의 -Infinity 가 조용히 '소형' 으로 새는 것을 막는다. */
export const maxWeightKg = (dog: TDogProfile): number =>
  dog.dogs.length > 0 ? Math.max(...dog.dogs.map((d) => d.weightKg)) : 0;

/** 설정 카드의 몸무게 요약. 한 마리에게 "1마리 · 최대 5kg" 은 '최대' 가 무엇과 견준 말인지 없다 — 그때는 몸무게만. */
export const dogWeightSummary = (dog: TDogProfile): string =>
  dog.dogs.length > 1 ? `${dog.dogs.length}마리 · 최대 ${maxWeightKg(dog)}kg` : `${maxWeightKg(dog)}kg`;

const CARRIERS: TCarrier[] = ['none', 'bag', 'cage', 'stroller'];
const SIZES: TDogSize[] = ['small', 'medium', 'large'];

/** 둘째·셋째에 임시로 붙이는 이름 — 옛 프로필에서 올려 변환할 때만 쓴다(아래 `liftLegacy`). */
const LEGACY_EXTRA_NAMES = ['둘째', '셋째'];

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isDogEntry = (value: unknown): value is TDogEntry => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TDogEntry>;
  return typeof candidate.name === 'string' && candidate.name.trim() !== '' && isPositiveNumber(candidate.weightKg);
};

/**
 * 옛 모양 `{ name, weightsKg: number[] }` 을 새 모양으로 올린다.
 *
 * 마리별 이름이 생기기 전에 등록한 프로필을 버리면, 사용자는 이유도 모른 채 판정이 사라진
 * 화면을 본다. 한 마리면 이름·몸무게가 그대로라 손실이 없고, 여러 마리면 첫 마리에 그 이름을
 * 주고 나머지는 '둘째'·'셋째' 로 둔다 — 설정에서 고칠 수 있는 자리표시자라 지어낸 정보가 아니다.
 * 새 모양 검사가 먼저 돌므로 이미 변환된 값에 다시 걸리진 않는다(멱등).
 */
const liftLegacy = (candidate: { name?: unknown; weightsKg?: unknown }): TDogEntry[] | null => {
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') return null;
  const weights = candidate.weightsKg;
  if (!Array.isArray(weights) || weights.length < 1 || weights.length > MAX_DOGS) return null;
  if (!weights.every(isPositiveNumber)) return null;
  return weights.map((weightKg, index) => ({
    name: index === 0 ? (candidate.name as string).trim() : LEGACY_EXTRA_NAMES[index - 1],
    weightKg,
  }));
};

/**
 * 값이 스펙과 어긋나면(수동 편집 등) 조용히 잘못 판정하는 대신 프로필을 통째로 비운다 —
 * 절반만 맞는 강아지 정보가 더 위험하다. 옛 모양만은 예외로 올려 변환한다(`liftLegacy`).
 */
export const sanitizeDog = (value: unknown): TDogProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TDogProfile> & { name?: unknown; weightsKg?: unknown };

  let dogs: TDogEntry[] | null = null;
  if (Array.isArray(candidate.dogs)) {
    if (candidate.dogs.length < 1 || candidate.dogs.length > MAX_DOGS) return null;
    if (!candidate.dogs.every(isDogEntry)) return null;
    dogs = candidate.dogs.map((dog) => ({ name: dog.name.trim(), weightKg: dog.weightKg }));
  } else {
    dogs = liftLegacy(candidate);
  }
  if (!dogs) return null;

  if (!CARRIERS.includes(candidate.carrier as TCarrier)) return null;
  const sizeOverride = SIZES.includes(candidate.sizeOverride as TDogSize)
    ? (candidate.sizeOverride as TDogSize)
    : undefined;
  return { dogs, carrier: candidate.carrier as TCarrier, sizeOverride };
};

/**
 * 프로필을 저장하고 보던 화면으로 돌아왔을 때 뜨는 한 줄("보리 기준으로 바꿨어요").
 * 돌아온 화면의 판정이 방금 적은 강아지 기준이라는 것을 말한다 — 말없이 돌아오면 저장이 됐는지,
 * 판정이 바뀐 건지 알 수 없다. 이름은 상세 카드와 같은 애칭 규칙(`dogCallNames`).
 */
export const dogProfileSavedMessage = (dogs: TDogEntry[]): string =>
  `${dogCallNames(dogs.map((d) => d.name))} 기준으로 바꿨어요`;

/**
 * 강아지 행을 ✕ 로 뺐을 때의 한 줄(14 W261010.7a). 폼 안의 일이라 아직 저장된 것은 없다 — 그래도 말없이 사라지면
 * 손이 떨려 잘못 누른 사람은 한 마리가 빠진 줄 모르고 '고치기' 까지 누른다(tremor-04b). 이름을 아직 안 적었으면 몇 번째인지로.
 */
export const dogRowRemovedMessage = (name: string, index: number): string => {
  const trimmed = name.trim();
  return `${trimmed ? withJosa(trimmed, '을/를') : `${index + 1}번째 강아지를`} 뺐어요`;
};

/**
 * 주 버튼 줄(`/dog` 맨 아래 고정)에 서는 한 줄 — 아직 안 된 것(14 W261013.5). 줄은 늘 화면에 있으므로 여기 적은 말은
 * 어디까지 내려와 있든 보인다. 그 칸들(이동 수단 선택지·그 오류)은 줄 뒤에 가려질 수 있다.
 *
 * - 저장을 눌러 막혔으면(`rowsFailed`·`carrierFailed`) 빠진 것을 모두 — **오류 요약**이다. 칸마다의 오류는 칸 밑에 그대로.
 * - 누르기 전엔 이동 수단을 안 골랐을 때만 "N가지 중 하나" — 줄이 첫 선택지를 덮어 고를 게 있는 줄 모르고 누를 뻔했다(youngja-02).
 *   이름·몸무게는 맨 위라 가려지지 않으므로 누르기 전엔 말하지 않는다.
 * - 다 됐으면 `null`(줄이 버튼만큼만 남는다 — 고치기 화면은 늘 이쪽이다).
 */
export const dogProfileActionNote = ({
  rowsFailed,
  carrierFailed,
  carrierChosen,
  carrierCount,
}: {
  rowsFailed: boolean;
  carrierFailed: boolean;
  carrierChosen: boolean;
  carrierCount: number;
}): { text: string; failed: boolean } | null => {
  if (rowsFailed && carrierFailed) return { text: '이름·몸무게를 확인하고 이동 수단을 골라 주세요', failed: true };
  if (rowsFailed) return { text: '이름과 몸무게를 확인해 주세요', failed: true };
  if (carrierFailed) return { text: '이동 수단을 골라 주세요', failed: true };
  if (!carrierChosen) return { text: `이동 수단 ${carrierCount}가지 중 하나를 골라야 등록돼요`, failed: false };
  return null;
};

/**
 * localStorage 에서 읽은 강아지 프로필을 스펙에 맞게 검증·변환한다.
 *
 * 스토어(`useAppStore`)가 아니라 여기 두는 이유는 순수 함수라 테스트가 zustand 와 장소 데이터
 * 없이 돌아야 해서다.
 */

import type { TCarrier, TDogEntry, TDogProfile, TDogSize } from '../types';
import { dogCallNames } from './korean';

export const MAX_DOGS = 3;
export const DOG_NAME_MAX_LENGTH = 12;

/**
 * 이 몸무게를 **넘으면 저장 전에 한 번 묻는다**(12 U3.6). "7.0" 을 "70" 으로 잘못 쳐도 형식은 맞아서 조용히 대형견이 되고,
 * 식당 대부분이 '어려움' 으로 뒤집힌다. 막지는 않는다 — 실제로 80kg 이 넘는 개도 있다(그레이트 데인·마스티프).
 */
export const HEAVY_DOG_CONFIRM_KG = 80;

/** 확인이 필요한 몸무게의 강아지만. 경계값(80kg)은 묻지 않는다. */
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

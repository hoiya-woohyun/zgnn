'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/base/button';
import { HintText } from '../components/base/hint-text';
import { PageHeader } from '../components/layout/pageHeader';
import { DOG_NAME_MAX_LENGTH, MAX_DOGS } from '../lib/dogProfile';
import { dogSize } from '../lib/eligibility';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useDog } from '../store/useAppStore';
import { DogProfileCarrierPicker } from './dogProfileCarrierPicker';
import { DogProfileDogRows, type TDogRowDraft, type TDogRowError } from './dogProfileDogRows';
import { DogProfileSizeOverride } from './dogProfileSizeOverride';
import type { TCarrier, TDogEntry, TDogProfile, TDogSize } from '../types';

const EMPTY_ROW: TDogRowDraft = { name: '', weightKg: '' };

const parseWeight = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** 이름·몸무게가 모두 유효한 행만 강아지로 읽는다. 빈 행·잘못 입력된 행은 걸러진다. */
const parseValidDogs = (rows: TDogRowDraft[]): TDogEntry[] =>
  rows.flatMap((row) => {
    const name = row.name.trim();
    const weightKg = parseWeight(row.weightKg);
    return name && name.length <= DOG_NAME_MAX_LENGTH && weightKg !== undefined ? [{ name, weightKg }] : [];
  });

/**
 * 입력 중 보여주는 행 에러. 채워는 넣었는데 0 이하거나 숫자가 아닌 몸무게에만 붙는다.
 * 빈 칸은 "아직 안 채운 것" 이라 에러가 아니다 — 빈 이름은 저장을 눌렀을 때만(`submitErrors`) 잡는다.
 */
const liveRowError = (row: TDogRowDraft): TDogRowError => {
  const error: TDogRowError = {};
  if (row.weightKg.trim() !== '' && parseWeight(row.weightKg) === undefined) {
    error.weightKg = '0보다 큰 숫자를 입력해 주세요';
  }
  if (row.name.trim().length > DOG_NAME_MAX_LENGTH) error.name = `${DOG_NAME_MAX_LENGTH}자 이내로 적어 주세요`;
  return error;
};

/** 저장 시점의 행 에러. 여기서는 빈 칸도 에러다 — 모든 행이 이름과 몸무게를 가져야 저장된다. */
const submitRowError = (row: TDogRowDraft): TDogRowError => {
  const error = liveRowError(row);
  if (row.name.trim() === '') error.name = '이름을 입력해 주세요';
  if (row.weightKg.trim() === '') error.weightKg = '몸무게를 입력해 주세요';
  return error;
};

const hasRowError = (error: TDogRowError) => Boolean(error.name || error.weightKg);

/*
 * 폼을 하이드레이션 뒤로 미루는 이유 — `useAppStore` 가 `skipHydration: true` 라 첫 렌더는
 * 항상 `dog: null` 이다(providers/storeHydration.tsx). 그 상태로 폼을 먼저 그리면 이미
 * 등록해 둔 사용자에게 "삭제" 버튼이 없다가 뒤늦게 나타나고(깜빡임), 그 틈에 저장을 누르면
 * 기존 프로필을 빈 값으로 덮어쓴다.
 *
 * 기다리는 기준은 **"읽기가 끝났나"** 지 "성공했나" 가 아니다. 예전에는 이 화면이
 * `persist.hasHydrated()` 를 보는 자기 훅을 따로 갖고 있었는데, 저장된 값이 깨지면 그 값이
 * 영원히 false 라 "불러오는 중이에요…" 에서 멈췄다(BUG-002). 공용 훅 하나만 쓴다.
 */

export function DogProfilePage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const dog = useDog();
  const setDog = useAppStore((state) => state.setDog);
  const clearDog = useAppStore((state) => state.clearDog);

  const [rows, setRows] = useState<TDogRowDraft[]>([EMPTY_ROW]);
  const [carrier, setCarrier] = useState<TCarrier>('none');
  const [sizeOverride, setSizeOverride] = useState<TDogSize | undefined>(undefined);
  /** 저장을 눌렀을 때 잡힌 행 에러. 입력을 고치면 `liveRowError` 가 대신한다. */
  const [submitErrors, setSubmitErrors] = useState<TDogRowError[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  /**
   * 하이드레이션이 끝난 시점의 dog 로 폼을 한 번만 채운다. 이펙트 대신 "렌더 중 상태 조정"
   * 패턴(React 문서: 이전 렌더의 값을 기억해 두고 달라졌을 때만 setState)을 쓴다 —
   * 이펙트로 하면 빈 폼이 한 프레임 보였다가 채워지는 깜빡임이 생긴다.
   */
  const [seededFor, setSeededFor] = useState<'pending' | TDogProfile | null>('pending');
  if (hydrated && seededFor === 'pending') {
    setSeededFor(dog);
    if (dog) {
      setRows(dog.dogs.map((d) => ({ name: d.name, weightKg: String(d.weightKg) })));
      setCarrier(dog.carrier);
      setSizeOverride(dog.sizeOverride);
    }
  }

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(timer);
  }, [banner]);

  const validDogs = parseValidDogs(rows);
  const rowErrors = submitErrors ?? rows.map(liveRowError);
  const computedSize = validDogs.length > 0 ? dogSize({ dogs: validDogs, carrier }) : undefined;

  const updateRows = (next: (prev: TDogRowDraft[]) => TDogRowDraft[]) => {
    setRows(next);
    setSubmitErrors(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const errors = rows.map(submitRowError);
    if (errors.some(hasRowError)) {
      setSubmitErrors(errors);
      return;
    }

    setDog({ dogs: parseValidDogs(rows), carrier, sizeOverride });
    router.push('/');
  };

  const handleDelete = () => {
    clearDog();
    setRows([EMPTY_ROW]);
    setCarrier('none');
    setSizeOverride(undefined);
    setSubmitErrors(null);
    setBanner('프로필을 삭제했어요');
  };

  return (
    <div>
      <PageHeader
        title={dog ? '강아지 프로필 수정' : '우리 강아지 등록'}
        description="한 번 등록하면 목록·지도·상세가 우리 강아지 기준으로 보여요."
      />

      <div className="px-4 pt-4 pb-10 md:px-6">
        {banner && (
          <p role="status" className="mb-4 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-brand-secondary">
            {banner}
          </p>
        )}

        {!hydrated ? (
          <p className="py-10 text-center text-sm text-tertiary">불러오는 중이에요…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <DogProfileDogRows
                values={rows}
                errors={rowErrors}
                onChange={(index, patch) =>
                  updateRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
                }
                onAdd={() => updateRows((prev) => (prev.length < MAX_DOGS ? [...prev, EMPTY_ROW] : prev))}
                onRemove={(index) => updateRows((prev) => prev.filter((_, i) => i !== index))}
              />
              {submitErrors?.some(hasRowError) && <HintText isInvalid>이름과 몸무게를 모두 채워 주세요</HintText>}
            </div>

            <DogProfileCarrierPicker value={carrier} onChange={setCarrier} />

            <DogProfileSizeOverride computedSize={computedSize} value={sizeOverride} onChange={setSizeOverride} />

            <div className="space-y-3 pt-2">
              <Button type="submit" size="lg" className="w-full">
                저장
              </Button>
              {dog && (
                <Button
                  type="button"
                  color="secondary-destructive"
                  size="lg"
                  className="w-full"
                  onClick={handleDelete}
                >
                  프로필 삭제
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

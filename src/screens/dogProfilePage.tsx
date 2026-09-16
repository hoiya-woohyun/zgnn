'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../components/base/button';
import { HintText } from '../components/base/hint-text';
import { Input } from '../components/base/input';
import { PageHeader } from '../components/layout/pageHeader';
import { dogSize } from '../lib/eligibility';
import { useAppStore, useDog } from '../store/useAppStore';
import { DogProfileCarrierPicker } from './dogProfileCarrierPicker';
import { DogProfileSizeOverride } from './dogProfileSizeOverride';
import { DogProfileWeightRows } from './dogProfileWeightRows';
import type { TCarrier, TDogProfile, TDogSize } from '../types';

const NAME_MAX_LENGTH = 12;

/** 문자열 행 중 숫자로 읽히는 양수만. 빈 칸·잘못 입력된 값은 걸러진다. */
const parseValidWeights = (rows: string[]): number[] =>
  rows.map(Number).filter((n) => Number.isFinite(n) && n > 0);

/** 채워는 넣었는데 0 이하거나 숫자가 아닌 행에만 에러를 붙인다. 빈 행은 "아직 안 채운 것" 이라 에러가 아니다. */
const rowError = (raw: string): string | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? undefined : '0보다 큰 숫자를 입력해 주세요';
};

/**
 * `useAppStore` 가 `skipHydration: true` 라 첫 렌더는 항상 `dog: null` 이다(providers/storeHydration.tsx).
 * 하이드레이션이 끝나기 전에 폼 초기값을 비워 둔 채로 보여주면, 이미 등록해 둔 프로필이 있는
 * 사용자에게 "삭제" 버튼이 없다가 잠깐 뒤에 나타나거나(깜빡임), 그 틈에 저장을 누르면 기존
 * 프로필을 빈 값으로 덮어써 버릴 수 있다. 그래서 하이드레이션이 끝날 때까지 폼을 그리지 않는다.
 */
function useStoreHydrated(): boolean {
  // 정적 내보내기라 이 컴포넌트는 빌드 시점에 Node 에서도 한 번 렌더된다(프리렌더).
  // 그 렌더 중에 `useAppStore.persist` 를 곧바로 만지면(예: useState 의 lazy 이니셜라이저)
  // 브라우저 전용 가정이 깨질 수 있어, 초기값은 항상 false 로 두고 useEffect 안에서만
  // 접근한다 — providers/storeHydration.tsx 와 같은 원칙.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsubscribe = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    // 클라이언트 라우팅으로 들어온 경우 하이드레이션이 이미 오래전에 끝나 있어
    // onFinishHydration 이벤트가 다시 오지 않는다. 마이크로태스크로 한 번 더 확인한다
    // (setState 를 이펙트 본문에서 곧장 부르면 린트에 걸려 콜백 안에서 부른다).
    Promise.resolve().then(() => {
      if (useAppStore.persist.hasHydrated()) setHydrated(true);
    });
    return unsubscribe;
  }, []);

  return hydrated;
}

export function DogProfilePage() {
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const dog = useDog();
  const setDog = useAppStore((state) => state.setDog);
  const clearDog = useAppStore((state) => state.clearDog);

  const [name, setName] = useState('');
  const [weights, setWeights] = useState<string[]>(['']);
  const [carrier, setCarrier] = useState<TCarrier>('none');
  const [sizeOverride, setSizeOverride] = useState<TDogSize | undefined>(undefined);
  const [nameError, setNameError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);
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
      setName(dog.name);
      setWeights(dog.weightsKg.map(String));
      setCarrier(dog.carrier);
      setSizeOverride(dog.sizeOverride);
    }
  }

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(timer);
  }, [banner]);

  const validWeights = parseValidWeights(weights);
  const rowErrors = weights.map(rowError);
  const computedSize = validWeights.length > 0 ? dogSize({ name: '', weightsKg: validWeights, carrier }) : undefined;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();
    let hasError = false;

    if (!trimmedName) {
      setNameError('이름을 입력해 주세요');
      hasError = true;
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`${NAME_MAX_LENGTH}자 이내로 적어 주세요`);
      hasError = true;
    } else {
      setNameError(null);
    }

    if (validWeights.length === 0 || rowErrors.some(Boolean)) {
      setWeightError('몸무게를 1kg 이상 입력해 주세요');
      hasError = true;
    } else {
      setWeightError(null);
    }

    if (hasError) return;

    setDog({ name: trimmedName, weightsKg: validWeights, carrier, sizeOverride });
    router.push('/');
  };

  const handleDelete = () => {
    clearDog();
    setName('');
    setWeights(['']);
    setCarrier('none');
    setSizeOverride(undefined);
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
              <Input
                label="이름"
                isRequired
                placeholder="예: 두부"
                value={name}
                onChange={setName}
                isInvalid={Boolean(nameError)}
                maxLength={NAME_MAX_LENGTH}
                wrapperClassName="h-11"
              />
              {nameError && <HintText isInvalid>{nameError}</HintText>}
            </div>

            <div>
              <DogProfileWeightRows
                values={weights}
                errors={rowErrors}
                onChange={(index, value) =>
                  setWeights((prev) => prev.map((v, i) => (i === index ? value : v)))
                }
                onAdd={() => setWeights((prev) => (prev.length < 3 ? [...prev, ''] : prev))}
                onRemove={(index) => setWeights((prev) => prev.filter((_, i) => i !== index))}
              />
              {weightError && <HintText isInvalid>{weightError}</HintText>}
            </div>

            <DogProfileCarrierPicker value={carrier} onChange={setCarrier} />

            <DogProfileSizeOverride computedSize={computedSize} value={sizeOverride} onChange={setSizeOverride} />

            <div className="space-y-3 pt-2">
              <Button type="submit" size="lg" className="h-11 w-full">
                저장
              </Button>
              {dog && (
                <Button
                  type="button"
                  color="secondary-destructive"
                  size="lg"
                  className="h-11 w-full"
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

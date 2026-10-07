'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/base/button';
import { HintText } from '../components/base/hint-text';
import { PageHeader } from '../components/layout/pageHeader';
import { parentRouteOf } from '../lib/appRoutes';
import { goBackInApp } from '../components/layout/appShellStack';
import { showAppStatus } from '../lib/appStatus';
import { DOG_NAME_MAX_LENGTH, HEAVY_DOG_CONFIRM_KG, MAX_DOGS, dogProfileSavedMessage, heavyDogs } from '../lib/dogProfile';
import { dogSize } from '../lib/eligibility';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useDog } from '../store/useAppStore';
import { DogProfileCarrierPicker } from './dogProfileCarrierPicker';
import { DogProfileDogRows, dogRowFieldId, type TDogRowDraft, type TDogRowError } from './dogProfileDogRows';
import { DogProfileSizeOverride } from './dogProfileSizeOverride';
import type { TCarrier, TDogEntry, TDogProfile, TDogSize } from '../types';
import { CARD_SURFACE } from '../components/cardSurface';

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
  const hydrated = useStoreHydrated();
  const dog = useDog();
  const setDog = useAppStore((state) => state.setDog);
  const clearDog = useAppStore((state) => state.clearDog);

  const [rows, setRows] = useState<TDogRowDraft[]>([EMPTY_ROW]);
  /**
   * 이동 수단은 **미리 고르지 않는다**(`null` = 아직 안 고름). 기본값 '없어요' 로 두었더니
   * 가방이 있는 사람도 그대로 저장해 식당 대부분이 "어려움" 으로 뒤집혔다 — 식당 판정은 이 값
   * 하나로 결판난다. `null` 은 폼 안에만 산다(저장 타입 `TDogProfile.carrier` 는 그대로).
   */
  const [carrier, setCarrier] = useState<TCarrier | null>(null);
  const [carrierError, setCarrierError] = useState(false);
  const carrierFirstOptionRef = useRef<HTMLButtonElement>(null);
  const [sizeOverride, setSizeOverride] = useState<TDogSize | undefined>(undefined);
  /** 저장을 눌렀을 때 잡힌 행 에러. 입력을 고치면 `liveRowError` 가 대신한다. */
  const [submitErrors, setSubmitErrors] = useState<TDogRowError[] | null>(null);
  /** 저장을 눌렀을 때 몸무게가 너무 커 한 번 되물은 강아지들(12 U3.6). 입력을 고치면 사라진다. */
  const [heavyAsk, setHeavyAsk] = useState<TDogEntry[] | null>(null);

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

  const validDogs = parseValidDogs(rows);
  const rowErrors = submitErrors ?? rows.map(liveRowError);
  // 크기는 몸무게만 본다 — 이동 수단을 아직 안 골랐어도 크기 표시는 미룰 이유가 없다.
  const computedSize = validDogs.length > 0 ? dogSize({ dogs: validDogs, carrier: carrier ?? 'none' }) : undefined;

  const updateRows = (next: (prev: TDogRowDraft[]) => TDogRowDraft[]) => {
    setRows(next);
    setSubmitErrors(null);
    setHeavyAsk(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    save(false);
  };

  /** `heavyConfirmed` — 이상하리만큼 큰 몸무게를 되물었고 "맞아요" 를 눌렀다. */
  const save = (heavyConfirmed: boolean) => {

    const errors = rows.map(submitRowError);
    const rowsInvalid = errors.some(hasRowError);
    if (rowsInvalid) {
      setSubmitErrors(errors);
      // 포커스가 저장 버튼에 남으면 오류가 어디인지 모른다 — 첫 오류 칸(위에서 아래로, 이름 → 몸무게)으로 옮긴다.
      const index = errors.findIndex(hasRowError);
      const field = errors[index].name ? 'name' : 'weightKg';
      document.getElementById(dogRowFieldId(index, field))?.focus();
    }
    if (carrier === null) {
      setCarrierError(true);
      // 행 에러가 함께 있으면 위쪽(행)이 먼저 눈에 들어오므로 포커스는 이동 수단만 없을 때 옮긴다.
      if (!rowsInvalid) carrierFirstOptionRef.current?.focus();
      return;
    }
    if (rowsInvalid) return;

    const dogs = parseValidDogs(rows);
    // 형식은 맞지만 "7.0" → "70" 같은 오타일 수 있다 — 막지 않고 한 번만 묻는다.
    if (!heavyConfirmed && heavyDogs(dogs).length > 0) {
      setHeavyAsk(heavyDogs(dogs));
      return;
    }
    setDog({ dogs, carrier, sizeOverride });

    /*
     * 보던 화면으로 돌아간다(D3). 예전엔 무조건 홈으로 push 해서, 상세의 "등록하면…" 으로 온 사람이
     * 보던 장소를 잃고, 뒤로가기를 누르면 방금 저장한 폼이 다시 나왔다. 되감으면 폼 항목을 지나
     * 온 곳으로 가고, 딥링크로 폼에 바로 들어왔으면 되감을 곳이 없어 부모(설정)로 갈아 끼운다 —
     * 셸의 뒤로가기(`AppBar`)와 같은 규칙이다. 알림은 셸이 그리므로 화면이 바뀌어도 남는다.
     */
    showAppStatus(dogProfileSavedMessage(dogs));
    // 헤더의 뒤로가기와 같은 문 — 되감기 · 딥링크면 갈아 끼우기 · 한 장 걷는 그림까지 셸이 맡는다.
    goBackInApp(parentRouteOf('/dog'));
  };

  /** 폼을 프로필 하나(또는 빈 폼)로 다시 채운다 — 삭제와 그 되돌리기가 같은 모양을 쓴다. */
  const seedForm = (profile: TDogProfile | null) => {
    setRows(profile ? profile.dogs.map((d) => ({ name: d.name, weightKg: String(d.weightKg) })) : [EMPTY_ROW]);
    setCarrier(profile?.carrier ?? null);
    setCarrierError(false);
    setSizeOverride(profile?.sizeOverride);
    setSubmitErrors(null);
  };

  /*
   * 삭제는 버튼 한 번이라 **되돌리기**를 준다(12 U2.1). 알림은 셸 토스트다 — 화면 안 배너는 폼 맨 위라
   * 맨 아래 버튼을 누른 사람에게 안 보였고, 조건부로 끼워지는 `role="status"` 라 낭독도 불확실했다.
   * 지운 프로필은 이 클로저가 붙잡는다(저장하지 않는다) — 화면을 떠났다가 눌러도 스토어는 되돌아온다.
   */
  const handleDelete = () => {
    if (!dog) return;
    const removed = dog;
    clearDog();
    seedForm(null);
    showAppStatus('프로필을 지웠어요', {
      action: {
        label: '되돌리기',
        onPress: () => {
          setDog(removed);
          seedForm(removed);
        },
      },
      durationMs: 6000,
    });
  };

  return (
    <div>
      <PageHeader
        title={dog ? '강아지 프로필 수정' : '우리 강아지 등록'}
        description="한 번 등록하면 목록·지도·상세가 우리 강아지 기준으로 보여요."
      />

      <div className="px-4 pt-4 pb-10 md:px-6">
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

            <DogProfileCarrierPicker
              value={carrier}
              onChange={(next) => {
                setCarrier(next);
                setCarrierError(false);
              }}
              error={carrierError ? '외출할 때 어떻게 데리고 다니는지 골라 주세요' : undefined}
              firstOptionRef={carrierFirstOptionRef}
            />

            <DogProfileSizeOverride
              computedSize={computedSize}
              value={sizeOverride}
              onChange={setSizeOverride}
              multiDog={validDogs.length > 1}
            />

            <div className="space-y-3 pt-2">
              {heavyAsk && (
                <div role="alert" className={`${CARD_SURFACE} p-4`}>
                  <p className="text-sm font-semibold text-primary">
                    {/* 조사를 붙이지 않는다 — 끝 글자가 'kg' 라 `withJosa` 가 받침을 못 읽어 "60kg가" 가 된다. */}
                    {heavyAsk.map((d) => `${d.name} ${d.weightKg}kg`).join(' · ')}, 맞나요?
                  </p>
                  <p className="mt-1 text-sm text-tertiary">
                    {HEAVY_DOG_CONFIRM_KG}kg 이 넘으면 대형견 기준으로 판정해요. 소수점을 빼고 쓰지 않았는지 확인해 주세요.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" color="primary" className="h-11" onClick={() => save(true)}>
                      맞아요, {dog ? '고치기' : '등록하기'}
                    </Button>
                    <Button type="button" size="sm" color="secondary" className="h-11" onClick={() => setHeavyAsk(null)}>
                      다시 볼게요
                    </Button>
                  </div>
                </div>
              )}
              {/* 화면 제목과 같은 동사 — `저장` 은 장소 저장(하트)의 낱말이라 핵심 명사가 둘로 갈렸다(디자인 리뷰 §10). */}
              <Button type="submit" size="lg" className="w-full">
                {dog ? '고치기' : '등록하기'}
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

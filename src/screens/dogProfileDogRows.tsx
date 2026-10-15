import { useEffect, useRef } from 'react';
import { Plus, XClose } from '@untitledui/icons';
import { Input } from '../components/base/input';
import { NO_AUTOFILL } from '../components/noAutofill';
import { Label } from '../components/base/label';
import { HintText } from '../components/base/hint-text';
import { DOG_NAME_MAX_LENGTH, MAX_DOGS } from '../lib/dogProfile';
import { dogRowFocusAfterRemove } from '../lib/dogProfileDraft';
import { cx } from '../utils/cx';

/** 입력 중인 한 마리. 문자열 그대로 들고 있다가 저장할 때 숫자로 바꾼다. */
export type TDogRowDraft = { name: string; weightKg: string };

export type TDogRowError = { name?: string; weightKg?: string };

/** 입력칸의 id. 에러 문구 연결(`aria-describedby`)과 저장 실패 시 첫 오류로 포커스를 옮기는 데 같이 쓴다. */
export const dogRowFieldId = (index: number, field: keyof TDogRowError) => `dog-row-${index}-${field}`;

/** '한 마리 더' 버튼의 id — 마지막 행을 ✕ 로 뺀 뒤 포커스가 여기로 온다(`dogRowFocusAfterRemove`). */
const DOG_ROWS_ADD_ID = 'dog-rows-add';

type TDogProfileDogRowsProps = {
  values: TDogRowDraft[];
  /** 행마다 다른 에러. 빈 몸무게는 에러 없음(아직 안 채웠을 뿐), 저장을 눌렀을 때만 빈 이름이 에러가 된다. */
  errors: TDogRowError[];
  onChange: (index: number, patch: Partial<TDogRowDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

/**
 * 마리별 이름·몸무게 입력. 리뷰 §1 의 지적("28kg+17kg 를 count=2, weightKg=28 로 뭉개면 안 된다")을
 * 반영해 마릿수만큼 행을 늘려 각자 몸무게를 받고, 이름도 마리마다 받는다 — 이름이 하나면
 * "보리+콩은 6만원" 처럼 요금·호칭 문구가 어색해진다(ADR-005 v3).
 */
export function DogProfileDogRows({ values, errors, onChange, onAdd, onRemove }: TDogProfileDogRowsProps) {
  /*
   * ✕ 로 뺀 뒤 포커스를 옮길 칸의 id(14 W261010.7b). 행이 다시 그려진 **뒤에** 옮긴다 — 누른 순간엔 옮길 칸이 아직 옛 행이다.
   * 그냥 두면 마지막 행·두 마리 → 한 마리에선 포커스가 body 로 떨어지고, 가운데 행에선 `key={index}` 라 같은 자리 ✕ 가 다음 마리 것이 되어
   * Enter 한 번 더에 그 마리가 빠졌다.
   */
  const focusAfterRemove = useRef<string | null>(null);
  useEffect(() => {
    if (focusAfterRemove.current === null) return;
    document.getElementById(focusAfterRemove.current)?.focus();
    focusAfterRemove.current = null;
  }, [values]);

  // 키보드로 누른 ✕ 만 옮긴다(`:focus-visible`) — 손가락으로 누른 뒤 이름 칸에 포커스를 주면 폰 키보드가 올라온다.
  const removeRow = (index: number, button: HTMLButtonElement) => {
    if (button.matches(':focus-visible')) {
      const target = dogRowFocusAfterRemove(index, values.length);
      focusAfterRemove.current = target === 'add' ? DOG_ROWS_ADD_ID : dogRowFieldId(target, 'name');
    }
    onRemove(index);
  };

  return (
    <div>
      <Label>우리 강아지</Label>
      <div className="mt-1.5 space-y-3">
        {values.map((value, index) => {
          const error = errors[index] ?? {};
          const nth = `${index + 1}번째 강아지`;
          return (
            <div key={index} className="flex items-start gap-4">
              <div className="grid flex-1 grid-cols-[3fr_2fr] gap-2">
                <div>
                  {/* 보이는 라벨 "이름" + aria-label 의 몇 번째 — 읽히는 이름은 "1번째 강아지 이름" 이다
                      (react-aria 가 둘을 잇는다). 자리표시 글자만으로는 입력을 시작하면 무슨 칸인지 사라졌다(D11). */}
                  <Input
                    label="이름"
                    {...NO_AUTOFILL}
                    aria-label={nth}
                    placeholder="예: 두부"
                    value={value.name}
                    onChange={(next) => onChange(index, { name: next })}
                    id={dogRowFieldId(index, 'name')}
                    isInvalid={Boolean(error.name)}
                    aria-describedby={error.name ? `${dogRowFieldId(index, 'name')}-error` : undefined}
                    maxLength={DOG_NAME_MAX_LENGTH}
                    /* wrapperClassName="h-11" 은 겉박스만 44px 로 키워 위아래 2px 가 탭해도 포커스가
                       안 잡히는 죽은 띠로 남았다. lg 프리셋은 input 자체가 44px 다. */
                    size="lg"
                  />
                  {error.name && (
                    <HintText isInvalid id={`${dogRowFieldId(index, 'name')}-error`}>
                      {error.name}
                    </HintText>
                  )}
                </div>
                <div>
                  {/*
                    단위 "kg" 를 칸 오른쪽에 늘 둔다 — 예전엔 자리표시 글자가 "kg" 라 숫자를 치는 순간
                    단위가 사라졌다(D11). base Input 에 접미 prop 이 없어(고치지 않는다) 감싸는 칸에서
                    absolute 로 얹는다. 라벨이 위에 있으므로 아래(`bottom-0`)에서 입력 줄 높이(h-11)만큼 잡고,
                    에러 문구는 이 감싸개 **밖**이라 위치가 흔들리지 않는다. 에러일 때는 base 가 같은 자리에
                    느낌표 아이콘을 띄우므로 그 왼쪽으로 비킨다.
                  */}
                  <div className="relative">
                    <Input
                      label="몸무게"
                      {...NO_AUTOFILL}
                      aria-label={nth}
                      type="number"
                      inputMode="decimal"
                      placeholder="예: 7"
                      value={value.weightKg}
                      onChange={(next) => onChange(index, { weightKg: next })}
                      id={dogRowFieldId(index, 'weightKg')}
                      isInvalid={Boolean(error.weightKg)}
                      aria-describedby={error.weightKg ? `${dogRowFieldId(index, 'weightKg')}-error` : undefined}
                      size="lg"
                      inputClassName={cx(
                        error.weightKg ? 'pr-16' : 'pr-10',
                        // 데스크톱 크롬의 숫자 위아래 화살표가 "kg" 와 겹친다 — 모바일엔 원래 없다.
                        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className={cx(
                        'pointer-events-none absolute bottom-0 flex h-11 items-center text-md text-tertiary',
                        error.weightKg ? 'right-9.5' : 'right-3.5',
                      )}
                    >
                      kg
                    </span>
                  </div>
                  {error.weightKg && (
                    <HintText isInvalid id={`${dogRowFieldId(index, 'weightKg')}-error`}>
                      {error.weightKg}
                    </HintText>
                  )}
                </div>
              </div>
              {values.length > 1 && (
                /* 칸마다 라벨이 위에 붙어, 그냥 두면 ✕ 가 입력 칸이 아니라 라벨 줄에 맞춰 선다.
                   라벨과 같은 글자 크기의 빈 줄 + 같은 간격(gap-1.5)을 받쳐 입력 칸 높이에 맞춘다.
                   몸무게 칸과는 16px 띄우고(gap-4) 44px 히트 영역은 오른쪽 여백으로 내민다(-mr-3) — 8px 옆이던 때
                   몸무게 칸 끝을 누르려다 2px 빗나가 한 마리가 지워졌다(14 W261010.7a · tremor-04b). 내민 만큼
                   아이콘(가운데 20px)의 오른쪽 끝이 본문 끝선에 맞고, 입력 칸 폭은 오히려 4px 넓어진다. */
                <div className="-mr-3 flex shrink-0 flex-col gap-1.5">
                  <span aria-hidden="true" className="invisible text-sm">
                    ✕
                  </span>
                  <button
                    type="button"
                    onClick={(event) => removeRow(index, event.currentTarget)}
                    aria-label={`${nth} 삭제`}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover"
                  >
                    <XClose className="size-5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {values.length < MAX_DOGS && (
        <button
          type="button"
          id={DOG_ROWS_ADD_ID}
          onClick={onAdd}
          className={cx(
            'mt-2 flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-secondary',
            'hover:bg-primary_hover',
          )}
        >
          <Plus className="size-4" aria-hidden="true" />한 마리 더
        </button>
      )}
    </div>
  );
}

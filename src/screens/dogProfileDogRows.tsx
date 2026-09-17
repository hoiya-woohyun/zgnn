import { Plus, XClose } from '@untitledui/icons';
import { Input } from '../components/base/input';
import { Label } from '../components/base/label';
import { HintText } from '../components/base/hint-text';
import { DOG_NAME_MAX_LENGTH, MAX_DOGS } from '../lib/dogProfile';
import { cx } from '../utils/cx';

/** 입력 중인 한 마리. 문자열 그대로 들고 있다가 저장할 때 숫자로 바꾼다. */
export type TDogRowDraft = { name: string; weightKg: string };

export type TDogRowError = { name?: string; weightKg?: string };

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
  return (
    <div>
      <Label>우리 강아지</Label>
      <div className="mt-1.5 space-y-3">
        {values.map((value, index) => {
          const error = errors[index] ?? {};
          const nth = `${index + 1}번째 강아지`;
          return (
            <div key={index} className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-[3fr_2fr] gap-2">
                <div>
                  <Input
                    aria-label={`${nth} 이름`}
                    placeholder="예: 두부"
                    value={value.name}
                    onChange={(next) => onChange(index, { name: next })}
                    isInvalid={Boolean(error.name)}
                    maxLength={DOG_NAME_MAX_LENGTH}
                    /* wrapperClassName="h-11" 은 겉박스만 44px 로 키워 위아래 2px 가 탭해도 포커스가
                       안 잡히는 죽은 띠로 남았다. lg 프리셋은 input 자체가 44px 다. */
                    size="lg"
                  />
                  {error.name && <HintText isInvalid>{error.name}</HintText>}
                </div>
                <div>
                  <Input
                    aria-label={`${nth} 몸무게(kg)`}
                    type="number"
                    inputMode="decimal"
                    placeholder="kg"
                    value={value.weightKg}
                    onChange={(next) => onChange(index, { weightKg: next })}
                    isInvalid={Boolean(error.weightKg)}
                    size="lg"
                  />
                  {error.weightKg && <HintText isInvalid>{error.weightKg}</HintText>}
                </div>
              </div>
              {values.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`${nth} 삭제`}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover"
                >
                  <XClose className="size-5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {values.length < MAX_DOGS && (
        <button
          type="button"
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

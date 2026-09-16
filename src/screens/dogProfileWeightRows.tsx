import { Plus, XClose } from '@untitledui/icons';
import { Input } from '../components/base/input';
import { Label } from '../components/base/label';
import { HintText } from '../components/base/hint-text';
import { cx } from '../utils/cx';

const MAX_DOGS = 3;

type TDogProfileWeightRowsProps = {
  /** 마리별 몸무게. 입력 중인 문자열 그대로 들고 있다가 저장할 때 숫자로 바꾼다. */
  values: string[];
  /** 행마다 다른 에러(빈 값은 에러 없음 — 아직 안 채웠을 뿐). */
  errors: (string | undefined)[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

/**
 * 마리별 몸무게 입력. 리뷰 §1 의 지적("28kg+17kg 를 count=2, weightKg=28 로 뭉개면 안 된다")을
 * 반영해 마릿수만큼 행을 늘려 각자 몸무게를 받는다. 이름은 하나로 충분해서 여기엔 없다.
 */
export function DogProfileWeightRows({ values, errors, onChange, onAdd, onRemove }: TDogProfileWeightRowsProps) {
  return (
    <div>
      <Label>몸무게(kg)</Label>
      <div className="mt-1.5 space-y-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <Input
                aria-label={`${index + 1}번째 강아지 몸무게(kg)`}
                type="number"
                inputMode="decimal"
                placeholder="예: 4.5"
                value={value}
                onChange={(next) => onChange(index, next)}
                isInvalid={Boolean(errors[index])}
                /* 겉박스만 키우는 wrapperClassName="h-11" 대신 input 자체가 44px 인 lg 프리셋. */
                size="lg"
              />
              {errors[index] && <HintText isInvalid>{errors[index]}</HintText>}
            </div>
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`${index + 1}번째 강아지 삭제`}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover"
              >
                <XClose className="size-5" />
              </button>
            )}
          </div>
        ))}
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

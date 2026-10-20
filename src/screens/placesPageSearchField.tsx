import { useRef } from 'react';
import { SearchMd, XClose } from '@untitledui/icons';
import { Input } from '../components/base/input';
import { SEARCH_FIELD } from '../components/noAutofill';
import { cx } from '../utils/cx';

type TPlacesPageSearchFieldProps = {
  query: string;
  onChange: (query: string) => void;
  className?: string;
};

/**
 * 둘러보기 검색칸 + 검색어만 지우는 ✕(14 W261019.11e).
 *
 * 평범한 검색어 칩을 켜진 조건 줄에서 뺀 뒤(W261019.11a) 조건이 함께 켜져 있으면 개수 줄 링크는 '모두 지우기' 라,
 * 조건은 둔 채 검색어만 지울 길이 글자를 하나씩 지우는 것뿐이었다. 칩을 되살리면 .11a 가 올린 첫 카드가 다시 내려가므로
 * 검색칸 자체에 단다. `base/Input` 은 복사본이라 감싸서 겹친다 — ✕ 는 입력칸 오른쪽 안의 44px 칸이고, 검색어가 있을 때만 선다
 * (공백만 있어도 지울 것이 있다). 누르면 검색어만 지우고 조건·정렬은 그대로다.
 */
export function PlacesPageSearchField({ query, onChange, className }: TPlacesPageSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query !== '';

  return (
    <div className={cx('relative', className)}>
      <Input
        ref={inputRef}
        aria-label="장소 검색"
        {...SEARCH_FIELD}
        icon={SearchMd}
        placeholder="이름·특징·읍면 검색"
        value={query}
        onChange={onChange}
        /* Input 의 기본 md 프리셋은 py-2 + text-md 라 input 자체가 40px 다.
           wrapperClassName="h-11" 로 겉박스만 44px 로 키우면 위아래 2px 가 탭해도 포커스가
           안 잡히는 죽은 띠로 남는다(측정으로 확인). lg 프리셋은 py-2.5 라 input 자체가 44px 다. */
        size="lg"
        /* 그림자 없이 테두리만(22 D-2) — 크림 머리 위 검색칸이 떠 있는 카드처럼 보이지 않게. base 는 복사본이라 겉박스 클래스로 덮는다. */
        wrapperClassName="shadow-none"
        /* 글자가 ✕ 밑으로 들어가지 않게 ✕ 칸만큼 비운다 — 늘 비우면 320px 에서 자리표시 글자가 잘린다. */
        inputClassName={hasQuery ? 'pr-11' : undefined}
      />
      {hasQuery && (
        <button
          type="button"
          aria-label="검색어 지우기"
          data-ev="places.searchClear"
          /* 누르는 순간 입력칸이 포커스를 잃지 않게 — 폰에서 키보드가 내려갔다 다시 올라오지 않는다. */
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange('');
            // 키보드로 ✕ 를 누르면 ✕ 가 사라지며 포커스가 body 로 떨어진다 — 입력칸으로 돌려 바로 다시 치게 한다.
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-lg text-fg-quaternary hover:text-fg-quaternary_hover focus-visible:-outline-offset-2"
        >
          <XClose className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

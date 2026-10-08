import { LinkExternal01 } from '@untitledui/icons';
import { BottomSheet } from '../components/base/bottom-sheet';
import { Button } from '../components/base/button';
import { variantsForDog } from '../lib/checklist';
import { linkLabel } from '../lib/format';
import { META } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';
import type { TItem } from '../types';

type TChecklistPageItemSheetProps = {
  /** 연 준비물. `null` 이면 닫힌다 — 닫히는 동안에도 내용이 남도록 마지막 항목은 부모가 들고 있다. */
  item: TItem | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * 준비물 하나의 이유와 사는 곳 — 줄 이름을 누르면 아래에서 올라온다(ADR-009 v4).
 *
 * 예전엔 줄 안에서 펼쳤다. 목록이 펼침 높이만큼 밀려 내려가 "어디까지 챙겼나" 를 훑는 눈이 끊겼고,
 * 펼친 줄이 하나 있으면 나머지 줄이 화면 밖으로 밀렸다. 시트는 목록을 그대로 두고 위에 뜬다.
 *
 * 제휴 고지는 링크가 나오는 이 시트에 둔다 — 링크가 여기로 왔으니 고지도 따라온다(링크에서 먼 고지는 고지가 아니다).
 */
export function ChecklistPageItemSheet({ item, isOpen, onOpenChange }: TChecklistPageItemSheetProps) {
  const dog = useAppStore((state) => state.dog);
  if (!item) return null;

  // 이 몸무게에 맞는 갈래만(W261007.13). 강아지가 없으면 전부.
  const variants = item.variants ? variantsForDog(item.variants, dog) : [];
  const hasLink = variants.length > 0 || Boolean(item.linkUrl);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label={item.name}>
      <div className="flex max-h-[80dvh] flex-col">
        <h2 className="flex shrink-0 items-center gap-2 pt-2 pr-10 text-md font-bold text-primary">
          {/* item.emoji 는 데이터 콘텐츠라 장식용 이모지 금지 규칙의 예외로 그대로 보여준다. */}
          <span aria-hidden="true" className="text-xl">
            {item.emoji}
          </span>
          {item.name}
        </h2>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
          {item.reason && <p className="text-sm text-secondary">{item.reason}</p>}

          {variants.length > 0 && (
            // 갈래는 버튼을 나란히 두지 않고 줄로 세운다. 나란히 두면 둘 중 하나를 "고르는"
            // 것처럼 보이는데, 실제로는 우리 강아지에 해당하는 한 줄만 보면 되는 목록이다.
            <ul
              className={cx(
                'divide-y divide-secondary overflow-hidden rounded-xl border border-secondary',
                item.reason ? 'mt-4' : 'mt-0',
              )}
            >
              {variants.map((variant) => (
                <li key={variant.label}>
                  <a
                    href={variant.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center gap-2 px-3 py-2 transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-primary">{variant.label}</span>
                    <span className="shrink-0 text-xs text-brand-secondary">{linkLabel(variant.linkUrl)}</span>
                    <LinkExternal01 aria-hidden="true" className="size-4 shrink-0 text-fg-brand-secondary" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {item.linkUrl && (
            <Button
              href={item.linkUrl}
              target="_blank"
              rel="noreferrer"
              color="secondary"
              size="md"
              iconTrailing={LinkExternal01}
              className={cx('h-11 w-full', item.reason ? 'mt-4' : 'mt-0')}
            >
              {linkLabel(item.linkUrl)}
            </Button>
          )}

          {hasLink && <p className="mt-3 text-xs text-tertiary">{META.disclosure}</p>}
        </div>
      </div>
    </BottomSheet>
  );
}

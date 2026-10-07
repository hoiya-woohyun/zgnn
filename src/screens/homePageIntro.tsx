'use client';

import { useId, useState } from 'react';
import { ChevronDown } from '@untitledui/icons';
import { AuthorAvatar } from '../components/authorAvatar';
import { CARD_SURFACE } from '../components/cardSurface';
import { META } from '../lib/places';
import { cx } from '../utils/cx';

type THomePageIntroProps = {
  /**
   * `card` — 첫 방문. 히어로 밑에 편지처럼 펼쳐 "누가 쓴 자료인가" 를 처음 한 번 말한다.
   * `row` — 그 뒤. 홈 맨 아래 한 줄로 접혀 있고 누르면 같은 글이 펼쳐진다(펼침은 저장하지 않는다 — 다음 방문엔 다시 접혀 있다).
   */
  variant: 'card' | 'row';
};

/**
 * 짱구누나의 인사말(`META.intro`).
 *
 * 예전엔 매 방문 히어로 바로 밑에 펼쳐져 화면 절반을 차지했고, 그 아래의 등록 CTA 가 폴드 밑으로 밀렸다(UX 평가 2026-10-06 2/6 ·
 * 07 U2). 글 자체는 첫 화면에서 한 번은 읽혀야 한다 — 이 자료의 신뢰는 "짱구누나가 직접 정리했다" 에서 온다. 그래서 **첫 방문에만
 * 그 자리에 펼치고, 이후엔 맨 아래로 내려 한 줄로 접는다.** 어느 쪽인지는 호출하는 쪽(`HomePage`)이 방문 수로 정한다.
 */
export function HomePageIntro({ variant }: THomePageIntroProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const expanded = variant === 'card' || open;

  const body = <p className="whitespace-pre-line text-sm text-secondary">{META.intro}</p>;

  if (variant === 'card') {
    return (
      <section className={`${CARD_SURFACE} p-5`}>
        {body}
        {/* 편지 서명처럼 오른쪽 아래. 접힌 줄에서는 머리에 얼굴·이름이 이미 있어 서명을 되풀이하지 않는다. */}
        <p className="mt-3 flex items-center justify-end gap-2 text-sm font-semibold text-brand-secondary">
          <AuthorAvatar className="size-9" />
          {META.author}
        </p>
      </section>
    );
  }

  return (
    <section className={CARD_SURFACE}>
      {/* 한 줄 = 아바타 36px + `py-3` → 60px, 44px 터치 기준을 넘는다. 펼침은 같은 카드 안 구분선 아래 — 상자를 하나 더 만들지 않는다. */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-secondary"
      >
        <AuthorAvatar className="size-9" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-primary">{META.author}의 인사</span>
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={cx('shrink-0 text-fg-quaternary transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {/* 접혀 있어도 DOM 에 둔다 — `aria-controls` 가 없는 id 를 가리키면 안 된다. */}
      <div id={bodyId} hidden={!expanded} className="border-t border-secondary px-5 pb-5 pt-4">
        {body}
      </div>
    </section>
  );
}

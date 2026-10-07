'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Phone01, PlusSquare, Share01 } from '@untitledui/icons';
import { CARD_SURFACE } from '../components/cardSurface';
import { installGuideKind } from '../lib/installGuide';
import { promptInstall, useCanPromptInstall } from '../lib/installPromptEvent';
import { useAppStore } from '../store/useAppStore';
import { cx } from '../utils/cx';

const STANDALONE_QUERY = '(display-mode: standalone)';

/** 이미 홈 화면 앱으로 열려 있나. iOS 는 `display-mode` 를 늦게 받아들여 `navigator.standalone` 도 함께 본다. */
const useStandalone = (): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(STANDALONE_QUERY);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () =>
      window.matchMedia(STANDALONE_QUERY).matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );

/**
 * 홈 하단 "홈 화면에 추가하기" 한 줄(07 U9). 두 번째 방문부터, 설치를 실제로 끝낼 수 있는 곳에서만 선다 — 판정은 `installGuideKind`.
 *
 * 띠 배너(`fixed`)가 아니라 인사말 줄과 같은 카드 한 줄이다: 셸이 스와이프 중 `<main>` 에 transform 을 걸어 `fixed` 가 어긋나고(ADR-014),
 * 설치는 지금 할 일을 가로막을 만큼 급하지 않다. 닫기 버튼도 없다 — 맨 아래 한 줄이라 거슬릴 자리가 아니고, 설치하면 저절로 사라진다.
 *
 * 호출하는 쪽이 저장값 읽기(`useStoreHydrated`)가 끝난 뒤에만 그린다 — 그 전의 `visitCount` 는 기본값 0 이다.
 */
export function HomePageInstall() {
  const visitCount = useAppStore((state) => state.visitCount);
  const standalone = useStandalone();
  const canPrompt = useCanPromptInstall();
  const [open, setOpen] = useState(false);
  const stepsId = useId();

  const kind = installGuideKind({
    visitCount,
    standalone,
    canPrompt,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  if (kind === 'none') return null;

  const head = (
    <>
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-primary text-brand-secondary">
        <Phone01 size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-primary">홈 화면에 추가하기</span>
        <span className="block text-sm text-tertiary">제주에서 오프라인으로도 볼 수 있어요</span>
      </span>
    </>
  );
  const rowClass = 'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-secondary';

  // 브라우저가 설치 창을 열어 주는 곳 — 누르면 바로 그 창이다. 쓰고 나면 신호가 비어 이 줄도 사라진다.
  if (kind === 'prompt') {
    return (
      <section className={CARD_SURFACE}>
        <button type="button" onClick={() => void promptInstall()} className={rowClass}>
          {head}
        </button>
      </section>
    );
  }

  // iOS — 설치 창을 열어 줄 API 가 없어 사용자가 방법을 알아야 한다. 펼치면 두 단계를 그림으로(아이콘이 Safari 의 그것과 같은 모양이다).
  // 이미지 파일로 두지 않는다: 프리캐시 목록을 손으로 적는 구조라(`additionalPrecacheEntries`) 빠뜨리면 오프라인에서 그림만 빈다.
  return (
    <section className={CARD_SURFACE}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={stepsId}
        onClick={() => setOpen((value) => !value)}
        className={rowClass}
      >
        {head}
        <ChevronDown
          size={20}
          aria-hidden="true"
          className={cx('shrink-0 text-fg-quaternary transition-transform', open && 'rotate-180')}
        />
      </button>
      <ol id={stepsId} hidden={!open} className="space-y-3 border-t border-secondary px-5 pb-5 pt-4 text-sm text-secondary">
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-fg-secondary">
            <Share01 size={20} />
          </span>
          <span>
            <b className="font-semibold text-primary">1.</b> Safari 의 <b className="font-semibold text-primary">공유</b> 버튼을 눌러요
            <span className="block text-tertiary">안 보이면 ··· 안에 있어요</span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-fg-secondary">
            <PlusSquare size={20} />
          </span>
          <span>
            <b className="font-semibold text-primary">2.</b> <b className="font-semibold text-primary">홈 화면에 추가</b>를 골라요
          </span>
        </li>
      </ol>
    </section>
  );
}

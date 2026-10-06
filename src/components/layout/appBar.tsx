import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft } from '@untitledui/icons';
import { usePathname, useRouter } from 'next/navigation';
import { canGoBackInApp, markReplacedNavigation } from '../../lib/appHistory';
import { barRevealRange } from '../../lib/stickyMorph';
import { cx } from '../../utils/cx';
import { registerAppBarSlot } from './appBarSlot';
import { morphModeOf, offsetInScroller, writeMorphMode, writeMorphRange } from './scrollDrivenMorph';

type TAppBarProps = {
  /** 앱 밖으로 나가지 않도록 되돌아갈 앱 안 경로. 되감을 화면이 없을 때만 쓰인다. */
  backTo: string;
  /**
   * 늘 보일 제목. 셸이 자동으로 붙이는 헤더는 제목을 모른다(경로만 안다) — 비워 두면
   * 화면의 h1 이 이 줄 밑으로 들어갈 때 그 글을 대신 띄운다.
   */
  title?: string;
  actions?: ReactNode;
};

/**
 * 하위 화면의 상단 헤더 — 뒤로가기 한 개와, 내려 읽을 때만 나타나는 제목. 폭과 무관하게 항상 있다 —
 * 사이드바는 어느 탭에 있는지만 알려줄 뿐, 탭 안으로 한 단계 들어간 화면에서
 * 되돌아 나올 길은 되지 못한다(태블릿에서 이 줄이 없어 갇히던 문제).
 *
 * **아래로 내려도 따라온다**(sticky). 상세 화면은 길어서, 다 읽고 나면 되돌아 나오려고
 * 맨 위까지 다시 올려야 했다. `fixed` 가 아니라 `sticky` 인 것은 이 줄이 **자기 자리를
 * 차지해야** 하기 때문이다 — `fixed` 면 흐름에서 빠져 높이가 0 이 되고, 아래 내용이 그만큼
 * 위로 올라와 뒤로가기 버튼 밑에 깔린다.
 *
 * ## 떠 있는 버튼이 아니라 헤더다 (ADR-010 v4)
 *
 * 예전에는 줄이 투명하고 버튼만 반투명 알약으로 떠 있었다. 상세에서 그 알약이 크림 줄 위에
 * 홀로 떠 있다가 스크롤하면 종류 색 판·본문 카드 위를 지나다녀, 화면에 속하지 않은 물건처럼
 * 보였다. 지금은 **바탕과 같은 크림으로 칠한 불투명 줄**이다. 칠해도 "따라다니는 색 띠"
 * (ADR-010 v1)가 되지 않는 이유는 그 색이 바탕 자체이기 때문이다 — 맨 위에 있을 때는
 * 바탕과 구별되지 않고, 내려 읽을 때만 아래 선과 제목이 나타나 헤더로 읽힌다(iOS 큰 제목
 * 접힘과 같은 문법이고, 탭 화면의 제목 줄 `StickyMorphTitle` 이 접힌 모습과 같다).
 *
 * **상태바 자리까지 자기가 덮는다**(`bleed-top-0` + `top-0`). 셸은 `<main>` 에 인셋만큼 여백만
 * 주고 칠하지 않으므로, `top-safe` 로 그 밑에 붙어 있으면 내려 읽을 때 본문이 상태바 뒤로
 * 비쳐 지나간다. 둘러보기 검색 줄과 같은 방식이다.
 *
 * **제목은 화면의 `<h1>` 을 읽는다.** 셸은 경로만 알고 장소 이름은 모른다 — 그렇다고 화면마다
 * 제목을 건네게 하면 "새 화면은 아무것도 안 해도 된다"(ADR-007)가 깨진다. 모든 하위 화면은
 * 이미 h1 이 하나씩 있으므로, 그 h1 이 이 줄 밑으로 들어가는 순간 같은 글을 이 줄에 띄운다.
 * 복사본이라 `aria-hidden` 이다(진짜 h1 을 스크린리더가 이미 읽는다).
 *
 * **제목은 스크롤을 따라 밑에서 올라온다**(v27). h1 이 이 줄 밑으로 들어가는 만큼 줄 안의 제목이 줄 아랫변에서 떠올라,
 * 본문의 제목이 헤더로 밀려 들어가는 것처럼 읽힌다. 준비물·홈의 접히는 헤더와 같은 장치다(`scrollDrivenMorph.ts` —
 * 지원하면 스크롤 구동 애니메이션, 아니면 경계에서 한 번 전환).
 *
 * **화면이 원하면 제목 자리를 채울 수 있다**(`AppBarSlot`). 셸은 장소 이름밖에 모르지만, 상세는 아이콘·동네·종류까지
 * 올리고 싶다. 슬롯이 비어 있으면 위의 h1 복사본이 선다 — 아무것도 안 하는 화면은 지금과 같다(ADR-007).
 *
 * 뒤로가기는 history 를 되감되, 링크를 받아 이 화면으로 바로 들어온 경우에는
 * 되감을 앱 안 화면이 없어 앱 밖으로 나가 버린다. 그래서 지금 history 항목이 앱 안에서
 * 몇 번째인지를 보고(lib/appHistory.ts), 첫 화면이면 backTo 로 올려보낸다.
 */
export function AppBar({ backTo, title, actions }: TAppBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  /** 내려 읽는 중인가 — 아래 선을 긋는다. */
  const [scrolled, setScrolled] = useState(false);
  /** 이 화면의 h1 글. 줄에 미리 깔아 두고, 올라오는 것은 애니메이션이 정한다. */
  const [heading, setHeading] = useState<string | null>(null);

  /*
   * 기준선(이 줄의 아래 끝)은 노치 높이·반응형 스케일에 따라 달라서 숫자로 못 박지 않고 잰다. 경로가 바뀌면 h1 도
   * 바뀌므로 다시 건다(상세 → 근처 상세로 옮겨도 이 줄은 그대로 남는다).
   *
   * - scroll: 구간(h1 이 줄 밑으로 들어가는 스크롤)만 적는다. 본문 길이가 바뀌면(목록이 늦게 그려지는 등) h1 위치가
   *   바뀔 수 있어 `<main>` 크기가 바뀔 때도 다시 잰다.
   * - snap: 스크롤마다 두 사각형을 재서, h1 이 다 가려진 순간 `--morph` 를 0 ↔ 1 로 한 번 바꾼다.
   */
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const main = header.closest('main');
    const h1 = main?.querySelector('h1') ?? null;
    setHeading(h1?.textContent?.trim() ?? null);

    const mode = morphModeOf();
    let last = -1;
    const measure = () => {
      if (mode === 'scroll' && h1) {
        writeMorphRange(header, barRevealRange(offsetInScroller(h1), h1.offsetHeight, header.offsetHeight));
      }
    };
    const onScroll = () => {
      setScrolled(window.scrollY > 0);
      if (mode !== 'snap') return;
      const passed = h1 ? h1.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom : false;
      const morph = passed ? 1 : 0;
      if (morph === last) return;
      last = morph;
      header.style.setProperty('--morph', String(morph));
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    onScroll();
    const clearMode = writeMorphMode(header, mode);
    const resize = new ResizeObserver(measure);
    if (main) resize.observe(main);
    // 경로는 그대로인데 h1 글만 바뀌는 화면이 있다(/dog — 하이드레이션 뒤·삭제 뒤 '등록' ↔ '수정', 12 U3.6). 글이 바뀌면 다시 읽는다.
    const headingWatch = new MutationObserver(() => setHeading(h1?.textContent?.trim() ?? null));
    if (h1) headingWatch.observe(h1, { childList: true, characterData: true, subtree: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      resize.disconnect();
      headingWatch.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      clearMode();
    };
  }, [pathname]);

  const goBack = () => {
    if (!canGoBackInApp()) {
      // 항목을 갈아 끼우는 이동이라 깊이는 그대로여야 한다.
      markReplacedNavigation();
      router.replace(backTo);
    } else {
      router.back();
    }
  };

  const shownTitle = title ?? heading;

  return (
    <header
      ref={headerRef}
      className={cx(
        'bleed-top-0 sticky top-0 z-30 border-b bg-secondary px-1 transition-colors duration-200 md:px-3',
        scrolled ? 'border-secondary' : 'border-transparent',
      )}
      style={{ ['--morph' as string]: 0 }}
    >
      <div className="flex h-14 items-center gap-1">
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로 가기"
          className="grid size-11 shrink-0 place-items-center rounded-full text-secondary transition-colors hover:bg-tertiary active:bg-tertiary"
        >
          <ArrowLeft size={24} />
        </button>
        {/* 제목 칸. 줄 높이 전체를 차지하고 넘치는 것을 자른다 — 올라오기 전의 제목은 줄 아랫변 밑에 숨어 있다.
            `hidden` 이 아니라 `clip` 이다 — `hidden` 은 스크롤 상자를 만들어, 안의 `scroll(nearest)` 가 문서 대신 이 칸을 잡고 멈춘다. */}
        <div className="flex min-w-0 flex-1 items-center self-stretch overflow-clip">
          <div
            data-scroll-morph={title ? undefined : 'bar-reveal'}
            className="flex min-w-0 flex-1 items-center"
            // 줄 아랫변 밑(10단)에서 제자리로. `title` 을 받으면 늘 보이는 제목이라 움직이지 않는다.
            style={
              title
                ? undefined
                : { transform: 'translateY(calc(var(--spacing) * 10 * (1 - var(--morph))))', opacity: 'var(--morph)' }
            }
          >
            {/* 화면이 채우는 자리(`AppBarSlot`). 채워지면 아래 h1 복사본은 물러난다(`peer`). 장식 복사본이라 읽지 않는다. */}
            <div ref={registerAppBarSlot} data-app-bar-slot aria-hidden="true" className="peer flex min-w-0 flex-1 items-center gap-2 empty:hidden" />
            <p
              aria-hidden={title ? undefined : true}
              className="clamp-1 min-w-0 flex-1 text-md font-bold text-primary peer-[:not(:empty)]:hidden"
            >
              {shownTitle}
            </p>
          </div>
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1 pr-1">{actions}</div>}
      </div>
    </header>
  );
}

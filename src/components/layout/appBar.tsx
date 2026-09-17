import type { ReactNode } from 'react';
import { ArrowLeft } from '@untitledui/icons';
import { useRouter } from 'next/navigation';
import { canGoBackInApp, markReplacedNavigation } from '../../lib/appHistory';

type TAppBarProps = {
  /** 앱 밖으로 나가지 않도록 되돌아갈 앱 안 경로. 되감을 화면이 없을 때만 쓰인다. */
  backTo: string;
  /**
   * 제목. 셸이 자동으로 붙이는 뒤로가기 줄은 제목을 모른다(경로만 안다) —
   * 그래서 비워 두면 뒤로가기 버튼만 있는 투명한 줄이 되고, 제목은 화면 본문이 담당한다.
   */
  title?: string;
  actions?: ReactNode;
};

/**
 * 하위 화면의 상단 뒤로가기 줄. 폭과 무관하게 항상 있다 —
 * 사이드바는 어느 탭에 있는지만 알려줄 뿐, 탭 안으로 한 단계 들어간 화면에서
 * 되돌아 나올 길은 되지 못한다(태블릿에서 이 줄이 없어 갇히던 문제).
 *
 * **아래로 내려도 따라온다**(sticky). 상세 화면은 길어서, 다 읽고 나면 되돌아 나오려고
 * 맨 위까지 다시 올려야 했다. `fixed` 가 아니라 `sticky` 인 것은 이 줄이 **자기 자리를
 * 차지해야** 하기 때문이다 — `fixed` 면 흐름에서 빠져 높이가 0 이 되고, 아래 내용이 그만큼
 * 위로 올라와 뒤로가기 버튼 밑에 깔린다. (ADR-010 v2 까지는 이유가 하나 더 있었다. 상세
 * 제목 판이 이 줄 높이만큼 자기를 끌어올려 색을 맨 위까지 이었기 때문에, 높이가 0 이 되면
 * 그 판이 통째로 화면 밖으로 밀렸다. v3 에서 그 음수 마진이 없어져 이 결합은 풀렸다.)
 *
 * 줄 자체는 배경을 칠하지 않는다. 맨 위는 크림(셸의 인셋 여백)이지만 이 줄은 스크롤을 따라
 * 내려가며 상세의 종류 색 판 위에도, 그 아래 본문 위에도 얹히기 때문이다 — 칠하면 따라다니는
 * 색 띠가 된다(ADR-010 v1 이 그렇게 깨졌다). 대신 따라다니는
 * 동안 무엇 위에 얹힐지 모르는 **버튼에만** 반투명 알약 배경을 준다. 줄 전체는
 * `pointer-events-none` 이라, 비어 있는 부분 밑으로 지나가는 내용의 터치를 가로채지 않는다.
 *
 * 노치(safe-area-inset-top)는 셸이 처리한다(ADR-010) — 셸이 `<main>` 을 인셋만큼 내려
 * 시작하므로, 이 줄은 `top-safe` 로 상태바 바로 밑에 붙어 따라오기만 하면 된다. 스크롤을
 * 내려도 뒤로가기 버튼이 상태바 밑으로 들어가지 않는다.
 *
 * 뒤로가기는 history 를 되감되, 링크를 받아 이 화면으로 바로 들어온 경우에는
 * 되감을 앱 안 화면이 없어 앱 밖으로 나가 버린다. 그래서 지금 history 항목이 앱 안에서
 * 몇 번째인지를 보고(lib/appHistory.ts), 첫 화면이면 backTo 로 올려보낸다.
 */
export function AppBar({ backTo, title, actions }: TAppBarProps) {
  const router = useRouter();

  const goBack = () => {
    if (!canGoBackInApp()) {
      // 항목을 갈아 끼우는 이동이라 깊이는 그대로여야 한다.
      markReplacedNavigation();
      router.replace(backTo);
    } else {
      router.back();
    }
  };

  return (
    <header className="pointer-events-none sticky top-safe z-30 px-2 md:px-4">
      <div className="flex h-14 items-center gap-1">
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로 가기"
          className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full bg-primary/85 text-secondary shadow-xs ring-1 ring-secondary backdrop-blur-sm ring-inset"
        >
          <ArrowLeft size={22} />
        </button>
        {title && (
          <h1 className="clamp-1 pointer-events-auto flex-1 px-2 text-md font-bold text-primary">{title}</h1>
        )}
        {actions && (
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1 pr-1">{actions}</div>
        )}
      </div>
    </header>
  );
}

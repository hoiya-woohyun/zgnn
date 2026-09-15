'use client';

import type { PropsWithChildren } from 'react';
import { useRouter } from 'next/navigation';
import { RouterProvider } from 'react-aria-components';

/**
 * react-aria 컴포넌트의 `href` 를 Next 라우터에 연결한다.
 *
 * Untitled UI 의 Button/Link 는 react-aria 위에 있어서 `next/link` 를 거치지 않는다.
 * 이걸 걸어 두지 않으면 앱 안 링크가 전부 문서를 새로 불러오는 이동이 된다.
 * basePath 가 없어 `useHref` 는 필요 없다.
 */
declare module 'react-aria-components' {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>['push']>[1]>;
  }
}

export const RouteProvider = ({ children }: PropsWithChildren) => {
  const router = useRouter();

  return <RouterProvider navigate={router.push}>{children}</RouterProvider>;
};

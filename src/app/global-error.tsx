'use client';

import { AlertCircle } from '@untitledui/icons';
import { Button } from '@/components/base/button';
import { EmptyState } from '@/components/layout/emptyState';
import '@/styles/globals.css';

/**
 * 루트 레이아웃까지 무너졌을 때의 마지막 화면(12 U0.1). 이 파일이 없으면 Next 기본 화면 —
 * 영어 한 줄과 흰 바탕 — 이 뜨고 사용자는 할 수 있는 일이 없다.
 *
 * 이 화면은 레이아웃을 **대신한다**: 셸·글꼴·전역 스타일이 따라오지 않으므로 `<html>`·`<body>` 와
 * 전역 CSS 를 스스로 든다. 사진·외부 리소스는 쓰지 않는다 — 무너진 이유가 그쪽일 수 있다.
 *
 * `retry` 가 아니라 **새로고침**이다. 여기까지 온 오류는 대개 첫 렌더에서 나는 것이라(저장소 차단 등)
 * 같은 트리를 다시 그려도 같은 자리에서 다시 터진다. 문서를 새로 받는 편이 서비스워커의 새 버전까지 데려온다.
 */
export default function GlobalError() {
  return (
    <html lang="ko">
      <body>
        <title>문제가 생겼어요 | 강아지랑 제주</title>
        <div className="px-4 pt-20 md:px-6">
          <EmptyState
            Icon={AlertCircle}
            title="문제가 생겼어요"
            description="화면을 그리다 멈췄어요. 새로고침하면 대부분 다시 열려요."
            action={
              <Button color="primary" size="lg" onClick={() => window.location.reload()}>
                새로고침
              </Button>
            }
          />
        </div>
      </body>
    </html>
  );
}

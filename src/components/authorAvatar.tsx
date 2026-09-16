import { cx } from '../utils/cx';

/**
 * 짱구누나 초상. 홈 인사 카드와 데스크톱 사이드바 푸터, 자료 출처를 밝히는 두 자리에서 쓴다.
 *
 * 원본은 `public/images/author-portrait.svg` — 사진을 56×65 격자 픽셀아트로 옮긴 벡터라
 * 장소 사진을 없앤 ADR-002 와 무관하다(작성자 본인의 초상, 허락 받음). 배경이 투명한
 * 흉상이라 원형 틀에 넣고 브랜드 연분홍을 깔아 위·아래 잘림을 자연스럽게 만든다.
 *
 * `<img>` 를 쓰는 이유는 사이드바 로고와 같다 — 정적 내보내기라 `next/image` 가 해 주는 게
 * 없고, path 1,300여 개를 JSX 로 인라인하면 아바타 하나에 DOM 노드가 그만큼 생긴다.
 * public/ 에 두면 프리캐시 목록(`next.config.mjs`)에 직접 넣어야 오프라인에서도 보인다.
 */
export function AuthorAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block shrink-0 overflow-hidden rounded-full bg-brand-primary ring-1 ring-brand-200',
        className,
      )}
    >
      {/* 두 자리 모두 바로 옆에 작성자 이름이 글자로 있다. alt 에 이름을 넣으면 "짱구누나 짱구누나" 로 두 번 읽힌다. */}
      <img
        src="/images/author-portrait.svg"
        alt=""
        aria-hidden="true"
        width={40}
        height={40}
        className="size-full object-cover object-top"
      />
    </span>
  );
}

/**
 * 새 버전이 깔렸을 때와, 그 사이 **없어진 청크**를 찾을 때(12 U2.4).
 *
 * 서비스워커는 `skipWaiting` · `clientsClaim` 이라(app/sw.ts) 새 배포가 받아지는 즉시 열린 화면을 맡는다. 그런데
 * 이미 그려진 화면은 옛 번들·옛 데이터를 그대로 보여 준다 — iOS 홈 화면 앱은 며칠씩 열려 있다. 그 세션에서 처음 여는
 * 동적 청크(`/map`·`/admin`)는 옛 이름으로 요청되는데 새 서비스워커의 프리캐시엔 그 이름이 없어 실패한다.
 *
 * 그래서 둘을 한다: 새 서비스워커가 화면을 맡으면 "새 정보가 있어요 · 새로고침" 을 알리고(셸 `AppShellUpdateNotice`),
 * 동적 청크를 못 받으면 **한 번만** 새로고침한다. 한 번만인 이유 — 진짜 오프라인이거나 파일이 정말 없으면
 * 새로고침해도 같은 실패라, 막지 않으면 무한히 다시 읽는다. 배포 식별자(`APP_BUILD`)로 표시해 다음 배포에선 다시 한 번 허용한다.
 */

/** 배포 식별자(커밋 앞 7자, next.config.mjs). 제보 모듈(`placeReportSend`)과 같은 값 — 그 모듈을 끌어오면 Supabase 상수까지 따라와 직접 읽는다. */
const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? 'dev';

const CHUNK_RELOAD_KEY = 'zgnn-chunk-reload';

/** 동적 import 가 청크를 못 받았다는 오류인가 — webpack(`ChunkLoadError`) · 브라우저별 ESM 메시지. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return /Loading (?:CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    error.message,
  );
}

/** 이 배포에서 이미 한 번 새로고침했나. 표시가 다른 배포 것이면 다시 허용한다. 순수. */
export function shouldReloadForChunk(error: unknown, reloadedFor: string | null, build: string): boolean {
  return isChunkLoadError(error) && reloadedFor !== build;
}

/**
 * 동적 import 의 `.catch` 에 건다. 청크 오류면 한 번 새로고침하고, 아니면(또는 이미 했으면) 그대로 다시 던진다 —
 * 던진 오류는 화면의 에러 경계가 받는다. 저장소를 못 쓰는 환경이면 새로고침하지 않는다(한 번인지 셀 수 없다).
 */
export function recoverFromChunkError(error: unknown): never {
  let reloadedFor: string | null = null;
  let canMark = true;
  try {
    reloadedFor = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  } catch {
    canMark = false;
  }
  if (canMark && shouldReloadForChunk(error, reloadedFor, APP_BUILD)) {
    try {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, APP_BUILD);
      window.location.reload();
    } catch {
      // 표시를 못 남기면 새로고침도 하지 않는다 — 셀 수 없는 새로고침은 무한 루프가 될 수 있다.
    }
  }
  throw error;
}

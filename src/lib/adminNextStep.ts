/**
 * 쓰기 뒤 **다음에 누가 이어 받나** 한 마디 — `/admin` 의 안내 문장이 터미널 명령을 말할지 정한다.
 *
 * 서버 워커(ADR-028)를 깨울 주소가 박힌 빌드(프로덕션)에서는 화면이 요청을 남긴 **뒤에 이미 깨웠다**(`adminWorkerWake.ts`) — 그런데도
 * "터미널에서 pnpm data analyze" 라고 말하면 운영자는 PC 를 켜야 하는 줄 안다. 깨울 주소가 없는 빌드(로컬 dev·분리 빌드)에서만 터미널을 말한다.
 *
 * 서버가 **받아 가는 것만** 여기로 온다: 재분석(`prepareReanalyze` 가 `requested_at` 을 찍는다 → `analyze --requested-only`)·
 * 추가 수집 요청(`collect_requests` → `collect --only-requests`)·「지금 분석」 요청. 키워드 전체 수집과 끊긴 반영은 서버를 깨우는 버튼이 없어
 * 터미널 문장이 그대로 맞다 — 여기로 옮기지 않는다(거짓말이 된다).
 */

import { WORKER_WAKE_URL } from './adminWorkerWake';

/** 이 빌드가 서버 워커를 깨우나. `analyzeRequestView`·`workerBand` 와 같은 조건이다. */
export const HAS_SERVER_WORKER = WORKER_WAKE_URL !== '';

export type TNextStep =
  /** 글을 수집 완료로 되돌렸다(재분석·다시 읽기·② 다시 열기) — 요청 글로 찍혀 있다 */
  | 'reread'
  /** 미분석 저수지 — 서버는 「지금 분석」 버튼을 눌러야 읽는다(저절로 읽지 않는다, ADR-024 결정 4) */
  | 'backlog'
  /** 추가 수집 요청이 대기 중 */
  | 'collectQueued';

const TEXT: Record<TNextStep, { remote: string; local: string }> = {
  reread: { remote: '서버 워커가 이어서 다시 읽어요', local: '터미널에서 pnpm data analyze 를 돌리면 다시 읽어요' },
  backlog: { remote: '검수 대기 칸의 분석 버튼을 누르면 서버 워커가 읽어요', local: '터미널에서 pnpm data analyze --limit 30 을 돌리면 읽어요' },
  collectQueued: { remote: '서버 워커가 찾을 차례예요', local: '터미널에서 pnpm data collect' },
};

/** 순수 — `remote` 는 테스트가 두 갈래를 다 보도록 열어 둔다. */
export function nextStepText(step: TNextStep, remote: boolean = HAS_SERVER_WORKER): string {
  return remote ? TEXT[step].remote : TEXT[step].local;
}

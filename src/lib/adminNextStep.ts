/**
 * 쓰기 뒤 **다음에 누가 이어 받나** 한 마디 — `/admin` 의 안내 문장이 터미널 명령을 말할지 정한다.
 *
 * 서버 워커(ADR-028)를 깨울 주소가 박힌 빌드(프로덕션)에서는 화면이 요청을 남긴 **뒤에 이미 깨웠다**(`adminWorkerWake.ts`) — 그런데도
 * "터미널에서 pnpm data analyze" 라고 말하면 운영자는 PC 를 켜야 하는 줄 안다. 깨울 주소가 없는 빌드(로컬 dev·분리 빌드)에서만 터미널을 말한다.
 *
 * 서버가 **받아 가는 것만** 여기로 온다: 재분석(`prepareReanalyze` 가 `requested_at` 을 찍는다 → `analyze --requested-only`)·
 * 추가 수집 요청(`collect_requests` → `collect --only-requests`)·「지금 분석」 요청·끊긴 반영의 「서버에서 반영」(`requestApply`, admin-review v71).
 * 서버가 받아 가는 길이 **없는** 일(키워드 전체 수집 · 끊긴 후보가 없는데 실패한 반영)은 `remote` 와 `local` 이 같은 터미널 문장이다 —
 * 서버 문장을 쓰면 거짓말이 된다. 운영 현황(`/admin/ops`)의 판정 안내·실행 기록도 이 표를 쓴다(todo/15 T8.2).
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
  | 'collectQueued'
  /** 반영이 끊긴 후보(`approved` 로 남은 것)가 있다 — 서버는 `/admin` 머리글의 「서버에서 반영」 으로 받는다 */
  | 'stranded'
  /** 반영이 실패했는데 끊긴 후보는 없다 — 누를 버튼이 없어 두 빌드 다 터미널 */
  | 'applyFailed'
  /** 수집이 오래 없다 — 키워드 전체 수집은 서버 길이 없어 두 빌드 다 터미널 */
  | 'collectStale'
  /** 실행 기록을 펼쳤을 때 "다시 돌릴 일" 한 줄 */
  | 'rerun'
  /** 실행 기록이 비었을 때 "언제부터 쌓이나" */
  | 'noRuns';

const TEXT: Record<TNextStep, { remote: string; local: string }> = {
  reread: { remote: '서버 워커가 이어서 다시 읽어요', local: '터미널에서 pnpm data analyze 를 돌리면 다시 읽어요' },
  backlog: { remote: '검수 대기 칸의 분석 버튼을 누르면 서버 워커가 읽어요', local: '터미널에서 pnpm data analyze --limit 30 을 돌리면 읽어요' },
  collectQueued: { remote: '서버 워커가 찾을 차례예요', local: '터미널에서 pnpm data collect' },
  stranded: {
    remote: '/admin 머리글의 「서버에서 반영」 을 누르면 서버 워커가 이어 반영해요',
    local: '터미널에서 pnpm data apply 를 돌리면 이어 반영해요',
  },
  applyFailed: { remote: '터미널에서 pnpm data apply 를 돌려 주세요', local: '터미널에서 pnpm data apply 를 돌려 주세요' },
  collectStale: { remote: '터미널에서 pnpm data collect 를 돌려 주세요', local: '터미널에서 pnpm data collect 를 돌려 주세요' },
  rerun: {
    remote: '다시 돌릴 일은 /admin 의 분석 버튼·「서버에서 반영」 으로 서버 워커에 맡기거나 터미널에서 해요',
    local: '다시 돌릴 일은 터미널에서 해요',
  },
  noRuns: { remote: '다음 실행부터 쌓여요', local: '다음 pnpm data collect 부터 쌓여요' },
};

/** 순수 — `remote` 는 테스트가 두 갈래를 다 보도록 열어 둔다. */
export function nextStepText(step: TNextStep, remote: boolean = HAS_SERVER_WORKER): string {
  return remote ? TEXT[step].remote : TEXT[step].local;
}

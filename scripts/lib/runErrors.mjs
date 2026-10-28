// 실행 기록(`pipeline_runs.error`)에 들어갈 수 있는 분류 문구 전부(docs/todo/15 T2.1). 던지는 자리가 `runError` 로 붙이고
// `runLog.classifyRunError` 가 꺼낸다. 화면(`src/lib/runOutcome.ts`)이 이 값으로 "어떻게 끝났나" 를 가르므로 문구를 바꾸면 두 쪽이 같이 바뀐다 —
// 그래서 `runLog.mjs`(node:crypto 를 쓴다)에서 떼어 둔다. 브라우저 번들이 이 파일만 읽는다.
export const RUN_ERROR = Object.freeze({
  claudeAuth: 'Claude 인증 실패',
  naver429: '네이버 검색 429',
  claudeLimit: 'Claude 한도',
  dbWrite: 'DB 쓰기 실패',
  sigint: '중단(SIGINT)',
  /** 상주 워커가 `kill`·OS 종료로 받은 SIGTERM — 사람이 Ctrl+C 로 멈춘 것과 화면이 가른다 */
  sigterm: '중단(SIGTERM)',
  /** 끝 기록 없이 심장이 멎은 실행을 다음 실행이 닫을 때(`runLog.closeLostRuns`) — 실패가 아니라 "기록이 끊겼다" 다 */
  lost: '기록 없이 끝남',
  unknown: '알 수 없음',
});

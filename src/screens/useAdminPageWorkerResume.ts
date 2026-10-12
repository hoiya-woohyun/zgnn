import type { SupabaseClient } from '@supabase/supabase-js';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TOpsWorker, TPipelineRun, TRunScript } from '../lib/adminOps';
import type { TAdminSession } from '../lib/adminSession';
import {
  afterWake,
  fetchServerRemaining,
  localTakesOver,
  resumeDecision,
  resumeNotice,
  serverResting,
  type TResumeNotice,
  type TResumeState,
  type TServerRemaining,
} from '../lib/adminWorkerResume';
import { wakeNotice, wakeRemoteWorker } from '../lib/adminWorkerWake';

type TUseAdminPageWorkerResumeProps = {
  clientRef: RefObject<SupabaseClient | null>;
  sessionRef: RefObject<TAdminSession | null>;
  /** 심장 행(`ops_overview` + Realtime). 모르면 null — 판단하지 않는다 */
  workers: readonly TOpsWorker[] | null;
  runsLatest: Partial<Record<TRunScript, TPipelineRun>>;
  /** 머리글의 판정 시각(15초마다 오른다) — 이어 깨울지도 이 박자로 다시 본다 */
  nowMs: number;
  /** 검수 화면이 열려 있나(`phase === 'ready'`) */
  active: boolean;
  /** 이 빌드가 서버 워커를 깨우나(`HAS_SERVER_WORKER`) */
  remote: boolean;
  /** 깨우기를 못 했다는 한 줄(`wakeNotice`) — 머리글이 그린다 */
  onWakeLine: (line: string | null) => void;
};

/**
 * `/admin` 의 **서버 워커 깨우기 + 이어 돌리기**(todo/20 T7·T10). 판정은 전부 `adminWorkerResume.ts` 의 순수 함수이고, 여기는 상태·시각·호출만 쥔다.
 *
 * - `wake` — 요청을 DB 에 남긴 **뒤에** 부른다(버튼 여섯 곳). 기다리지 않는다. 서버가 받았으면 그때 센 남은 수를 기준으로 무장한다(사람이 누르면 상한이 0 부터).
 * - 무장한 동안 `nowMs` 가 오를 때마다 서버가 쉬는지 보고, 쉬면 남은 수를 **새로 세어** 다시 깨울지 정한다. 한 번에 하나만 판단한다(`decidingRef`).
 * - `generationRef` — 판단이 남은 수를 세는 사이에 사람이 다시 깨우면 그 판단의 결과를 버린다(옛 기준으로 새 무장을 덮지 않게).
 */
export function useAdminPageWorkerResume({ clientRef, sessionRef, workers, runsLatest, nowMs, active, remote, onWakeLine }: TUseAdminPageWorkerResumeProps) {
  const [remaining, setRemaining] = useState<TServerRemaining | null>(null);
  const [state, setState] = useState<TResumeState>({ kind: 'off' });
  const decidingRef = useRef(false);
  const generationRef = useRef(0);
  /** 마지막으로 센 수 — 깨운 직후의 세기가 한 번 실패해도 이것을 기준으로 무장한다(그 사이 서버는 아직 글 하나도 못 끝냈다) */
  const lastCountedRef = useRef<TServerRemaining | null>(null);

  /** 남은 일을 다시 센다. 못 세면 줄을 내린다(모르는 수를 말하지 않는다) — 이어 깨우기는 다음 박자에 다시 센다. */
  const refresh = useCallback(async (): Promise<TServerRemaining | null> => {
    const client = clientRef.current;
    if (!client) return null;
    try {
      const counted = await fetchServerRemaining(client);
      lastCountedRef.current = counted;
      setRemaining(counted);
      return counted;
    } catch {
      setRemaining(null);
      return null;
    }
  }, [clientRef]);

  const wakeAndArm = useCallback(
    async (resumes: number) => {
      const generation = ++generationRef.current;
      const wokeAtMs = Date.now();
      const result = await wakeRemoteWorker(sessionRef.current);
      onWakeLine(wakeNotice(result));
      if (result === 'off') return;
      const counted = result === 'started' || result === 'busy' ? ((await refresh()) ?? lastCountedRef.current) : null;
      if (generation === generationRef.current) setState(afterWake(result, counted, wokeAtMs, resumes));
    },
    [onWakeLine, refresh, sessionRef],
  );

  const wake = useCallback(() => {
    void wakeAndArm(0);
  }, [wakeAndArm]);

  /** 다시 로그인하면 옛 무장을 버린다(`start`). */
  const reset = useCallback(() => {
    generationRef.current++;
    lastCountedRef.current = null;
    setState({ kind: 'off' });
    setRemaining(null);
  }, []);

  useEffect(() => {
    if (!active || !remote || state.kind !== 'armed' || !workers || decidingRef.current) return;
    if (!serverResting(workers, state.wokeAtMs, nowMs)) return;
    decidingRef.current = true;
    const generation = generationRef.current;
    void (async () => {
      try {
        const counted = await refresh();
        if (!counted || generation !== generationRef.current) return;
        const decision = resumeDecision({ state, remaining: counted, workers, lastAnalyze: runsLatest.analyze, nowMs: Date.now() });
        if (decision.action === 'wake') await wakeAndArm(state.resumes + 1);
        else if (decision.action === 'stop') setState({ kind: 'stopped', why: decision.why });
      } finally {
        decidingRef.current = false;
      }
    })();
  }, [active, remote, state, workers, runsLatest, nowMs, refresh, wakeAndArm]);

  const notice: TResumeNotice | null = useMemo(() => {
    if (!active || !workers) return null;
    const resting = serverResting(workers, state.kind === 'armed' ? state.wokeAtMs : 0, nowMs);
    return resumeNotice({ remote, remaining, state, resting, localAlive: localTakesOver(workers, nowMs) });
  }, [active, workers, remote, remaining, state, nowMs]);

  return { wake, refresh, reset, notice };
}

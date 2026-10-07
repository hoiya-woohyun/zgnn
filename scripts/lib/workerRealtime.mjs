// 상주 워커의 Realtime 깨우기(ADR-024 결정 3, docs/todo/17 T4.1) — 채널 하나(`worker`)에 `postgres_changes` 넷, 전부 같은 `wake()` 로 간다.
// 구독은 **주 길일 뿐 정본이 아니다**: 끊기면 supabase-js 의 자동 재연결에 맡기고 60초 폴링이 받친다(직접 재시도 루프 없음). 가장 나쁜 경우가 "60초 늦음" 이다.
//
// 토큰 — 이벤트도 RLS 를 거친다. 채널이 세션 JWT 를 싣는 것은 `createSupabase` 의 `realtime.accessToken` 콜백이다(거기 주석: `setAuth(jwt)` 는 heartbeat 가 되돌린다).
// 그래서 재로그인 뒤 할 일은 `setAuth` 가 아니라 **새 클라이언트로 다시 구독**(`restart`)이다 — 옛 클라이언트의 콜백은 옛 토큰을 쥐고 있다.

/**
 * 승인 이벤트를 이만큼 묵힌 뒤 깨운다. `/admin` 「맞아요」 는 승인과 반영을 한 번에 하는데 순서가 approved → places insert → match_place_id → merged 라,
 * 1초 만에 깬 apply 가 그 사이(approved 인데 짝이 없다)를 읽으면 같은 가게를 **한 번 더 insert** 한다(쌍둥이 — 빌드·테스트는 통과).
 * 묵히면 브라우저가 merged 로 닫은 뒤라 셀 것이 0 이다. 줄일 뿐 없애지는 못한다(느린 네트워크) — 폴링에도 같은 창이 있었다. 승인 → 반영 수용 기준은 60초라 여유가 있다.
 */
export const APPROVED_SETTLE_MS = 5_000;

/** 워커가 듣는 변경. `blog_posts` 는 replica identity default 라 old 값이 없어 "requested_at 이 새로 생김" 을 못 가른다 — 새 행만 보고 `shouldWake` 가 거른다. */
export const REALTIME_BINDINGS = Object.freeze([
  { table: 'collect_requests', event: 'INSERT' },
  { table: 'pipeline_requests', event: 'INSERT' },
  { table: 'candidates', event: 'UPDATE', filter: 'status=eq.approved', delayMs: APPROVED_SETTLE_MS },
  { table: 'blog_posts', event: 'UPDATE' },
]);

/** 표 → 이벤트가 재시도 간격(`isDue`)을 건너뛰게 할 단계 key(`planCycle` 의 `forced`). `pipeline_requests` 는 명시 요청이라 원래 늘 돈다. */
export const REALTIME_STEP = Object.freeze({ collect_requests: 'collect', blog_posts: 'analyze:requested', candidates: 'apply', pipeline_requests: null });

/**
 * 이 변경이 할 일을 늘렸나. `blog_posts` UPDATE 는 분석이 글마다 `analyzed_at` 을 찍을 때도 오므로 **요청 글이 됐을 때만**(requested_at 있음 · analyzed_at 없음).
 * 서버 필터(`status=eq.approved`)가 있는 `candidates` 도 한 번 더 본다 — 필터 문자열 오타는 조용히 전부를 흘려보낸다.
 * @param {string} table
 * @param {string} eventType  'INSERT' | 'UPDATE' | 'DELETE'
 * @param {Record<string, unknown> | null | undefined} row  payload.new
 */
export function shouldWake(table, eventType, row) {
  switch (table) {
    case 'collect_requests':
    case 'pipeline_requests':
      return eventType === 'INSERT';
    case 'candidates':
      return eventType === 'UPDATE' && row?.status === 'approved';
    case 'blog_posts':
      return eventType === 'UPDATE' && Boolean(row?.requested_at) && !row?.analyzed_at;
    default:
      return false;
  }
}

/**
 * 구독을 연다. 상태는 **바뀔 때만** 한 줄 — 토큰 만료·절전 뒤에는 자동 재연결이 CHANNEL_ERROR·TIMED_OUT 을 되풀이해 그대로 찍으면 로그를 덮는다.
 * @param {import('@supabase/supabase-js').SupabaseClient} initialClient
 * @param {{ onEvent: (stepKey: string|null) => void, log: (line: string) => void }} hooks
 * @returns {{ restart: (client: object) => Promise<void>, close: () => Promise<void> }}
 */
export function startRealtime(initialClient, { onEvent, log }) {
  let client = null;
  let channel = null;
  let connected = null; // null = 아직 모름(첫 상태는 무엇이든 찍는다)

  function report(next, why) {
    if (connected === next) return;
    connected = next;
    log(next ? 'realtime 연결 — 바뀌면 바로 깬다' : `realtime 끊김(${why}) — 폴링으로(60초)`);
  }

  function subscribe(next) {
    client = next;
    const mine = REALTIME_BINDINGS.reduce(
      (ch, { table, event, filter, delayMs }) =>
        ch.on('postgres_changes', { event, schema: 'public', table, ...(filter ? { filter } : {}) }, (payload) => {
          if (!shouldWake(payload.table, payload.eventType, payload.new)) return;
          const fire = () => onEvent(REALTIME_STEP[payload.table] ?? null);
          if (delayMs) setTimeout(fire, delayMs);
          else fire();
        }),
      client.channel('worker'),
    );
    channel = mine;
    mine.subscribe((status, err) => {
      if (channel !== mine) return; // 재로그인·종료로 치운 옛 채널의 CLOSED
      if (status === 'SUBSCRIBED') report(true);
      else report(false, err?.message ? `${status} · ${String(err.message).split('\n')[0].slice(0, 120)}` : status);
    });
  }

  async function remove() {
    const [owner, old] = [client, channel];
    channel = null;
    if (!old) return;
    try {
      await owner.removeChannel(old);
    } catch {
      // 끝내거나 갈아 끼우는 중이다 — 못 치운 채널은 프로세스와 함께 사라진다
    }
  }

  subscribe(initialClient);
  return {
    /** 재로그인 뒤 — 새 세션의 클라이언트로 다시 구독한다. */
    async restart(next) {
      await remove();
      subscribe(next);
    },
    close: remove,
  };
}

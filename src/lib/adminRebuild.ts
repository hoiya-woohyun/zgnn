/**
 * "승인했는데 사이트가 안 바뀐다" 를 앱 안에서 진단하는 자리(`/admin` 머리글 한 줄).
 *
 * 화면은 승인 직후 "사이트에는 다음 빌드에서 보여요" 라고 말한다. 그 문장이 **참인지 아닌지를 화면이 몰랐다** —
 * 재빌드는 DB 트리거(`notify_vercel_rebuild`)가 Vault 의 Deploy Hook 으로 POST 해서 일어나고, 훅이 없거나
 * 폐기됐으면 트리거는 조용히 아무 일도 하지 않는다. 그 침묵이 성공과 구분되지 않았다.
 *
 * `20260929121000_rebuild_log.sql` 이 그 호출을 표에 남기고 `rebuild_status()` 로 읽게 해 준다.
 * 이 파일은 그 행들을 **사람이 읽을 한 줄**로 바꾼다. 판정은 전부 순수 함수라 테스트가 잡는다.
 *
 * `20261006130000_rebuild_coalesce.sql` 부터는 트리거가 훅을 직접 부르지 않고 `queued` 줄만 세운다 — 1분마다 도는 cron 이
 * 줄이 60초 조용해지면 **한 번** 부르고, 그 줄의 쓰기들이 같은 요청을 공유한다. 그래서 `rebuild_status()` 의 한 행은 이제
 * 쓰기 하나가 아니라 **호출 하나**이고(`place_count` 곳을 묶음), 묶은 행의 `requested_at` 은 쓰기 시각이 아니라 **부른 시각**이다.
 *
 * 이 한 줄이 특히 필요해진 계기는 Deploy Hook URL 이 에이전트 대화 기록에 남은 일이다(docs/todo/05).
 * 폐기·재발급이 권장되는데, 새 주소를 Vault 에 잘못 붙여 넣으면 증상이 **"아무 일도 안 일어남"** 이라
 * 회전 자체가 위험해진다. 회전을 안전하게 만드는 것은 새 주소가 아니라 "됐는지 볼 수 있는 자리" 다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** `rebuild_status()` 가 돌려주는 한 행 = 재빌드 **호출 하나**. 훅 주소는 여기 없다(그 표에 담지 않는다 — 마이그레이션 머리 주석). */
export type TRebuildEntry = {
  /** 부른 시각. 아직 안 부른 `queued` 는 가장 최근 쓰기 시각 — 응답 대기·cron 고장 판정이 모두 이 값에서 잰다 */
  requested_at: string;
  op: string;
  place_name: string | null;
  place_status: string | null;
  /**
   * queued: 줄을 섰다(곧 묶어서 부른다) · sent: 보냈다 · missing: Vault 에 훅이 없다 ·
   * skipped: 게시 집합이 안 바뀌어 안 불렀다 · error: 보내다 터졌다
   */
  hook: 'queued' | 'sent' | 'missing' | 'skipped' | 'error';
  note: string | null;
  response_status: number | null;
  response_error: string | null;
  /** 이 호출에 묶인 쓰기 수. 이름(`place_name`)은 그중 가장 최근 하나뿐이라, 1 보다 크면 화면이 이름 대신 수를 말한다 */
  place_count: number;
};

/** 머리글 한 줄의 색·문구. `tone` 이 문구를 고르지 않는다 — 문구가 먼저 정해지고 색이 따라온다. */
export type TRebuildHeadline = {
  tone: 'ok' | 'waiting' | 'warn' | 'none';
  text: string;
};

/**
 * 응답이 이 시간 넘게 안 오면 "대기" 가 아니라 "못 받았다" 로 본다.
 *
 * 실측은 4.7초였다(docs/todo/04 v7). 3분을 두는 이유는 넉넉함이 아니라 **구분**이다 — pg_net 은 재시도하지
 * 않으므로, 워커가 멈췄거나 응답이 만료로 지워진 경우와 "방금 보내 아직 오는 중" 이 같은 null 로 보인다.
 * 시간이 그 둘을 가른다.
 */
export const RESPONSE_WAIT_LIMIT_MS = 3 * 60 * 1000;

/**
 * 2xx 를 받은 뒤 이만큼 지나면 "1~2분 뒤 보여요" 가 아니라 "반영됐어요" 로 말한다.
 * 하루 지난 기록에 "1~2분 뒤" 를 붙이던 자리다 — 미래형 문장이 과거 사건에 붙어 지금도 기다려야 하는 것처럼 읽혔다.
 * 10분은 Vercel 빌드(실측 1~2분)에 넉넉한 여유를 둔 값이다. 빌드 결과 자체는 여기서 알 수 없다(훅의 응답은 "접수" 까지다).
 */
export const BUILD_SETTLE_MS = 10 * 60 * 1000;

/**
 * 가장 최근 `queued` 가 이만큼 넘게 남아 있으면 **cron 이 안 도는 것**으로 본다.
 *
 * 정상이면 마지막 쓰기 뒤 60초 조용 + cron 주기 1분 = 길어야 2분 남짓에 `sent` 가 된다. 5분은 그 두 배 반이다.
 * 가장 **오래된** 줄이 아니라 가장 최근 줄에서 재는 이유: 쉬지 않고 고치는 동안은 일부러 안 부르므로(뒤쪽 합치기),
 * 오래된 줄에서 재면 cron 이 멀쩡한데 경보가 난다. 가장 최근 줄이 5분 묵었다면 그동안 조용했는데도 안 부른 것이다.
 * 이것을 따로 말하지 않으면 `rebuild_log` 를 만든 이유(조용히 아무 일도 안 일어남)가 cron 자리에서 되살아난다.
 */
export const QUEUE_STALL_MS = 5 * 60 * 1000;

export async function fetchRebuildStatus(client: SupabaseClient, n = 5): Promise<TRebuildEntry[]> {
  const { data, error } = await client.rpc('rebuild_status', { n });
  if (error) throw new Error(`재빌드 기록: ${error.message}`);
  return (data ?? []) as TRebuildEntry[];
}

/** "3분 전" · "2시간 전" · "어제" — 순수. 초 단위는 쓰지 않는다(재빌드는 분 단위 일이다). */
export function agoLabel(fromIso: string, nowMs: number): string {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((nowMs - then) / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/**
 * 가장 최근 **실제 호출**을 한 줄로 — 순수.
 *
 * `skipped` 를 건너뛰고 보는 이유: 초안을 고치거나 내린 곳을 또 고치면 빌드를 부르지 않는 것이 정상이고
 * (마이그레이션의 1번), 그 행이 맨 위에 있다고 머리글이 "빌드 안 불렀어요" 로 바뀌면 방금 올린 장소가
 * 반영 중인지를 가려 버린다. 건너뛴 기록은 진단용으로 표에 남아 있다.
 *
 * 4xx·5xx 를 따로 말하는 것이 이 함수의 요점이다 — **훅이 폐기되면 그 코드로만 드러난다.** 단 429 는 한도라 따로 가른다.
 */
/**
 * 이 기록이 가리키는 쓰기를 운영자 말로. **승인만 이 트리거를 쓰는 게 아니다** — 내리기·되살리기도 같은 것을 쓴다
 * (`adminPlaces.ts` 머리 주석: 재빌드 장치를 새로 만들지 않았다). 그리고 이 머리글은 두 칸 위에 공용으로 뜬다.
 * 주어를 "승인한 것" 으로 못 박으면 폐업 가게를 내린 직후 머리글이 하지 않은 일을 말한다.
 * `place_status` 는 마이그레이션이 `touched.status` 로 채운다(`20260929121000_rebuild_log.sql:117`).
 */
const subjectOf = (entry: TRebuildEntry): string =>
  /* 여러 곳을 묶은 호출은 올림·내림이 섞일 수 있고 `place_status` 는 마지막 하나의 것이다 — 주어를 수로 말한다. */
  entry.place_count > 1 ? `바꾼 ${entry.place_count}곳` : entry.place_status === 'archived' ? '내린 것' : '올린 것';

/** "2분 전" 또는 "2분 전 · 36곳 묶어 한 번" — 묶은 호출이 마지막 장소 이름 하나로만 읽히지 않게. */
const whenOf = (entry: TRebuildEntry, ago: string): string =>
  entry.place_count > 1 ? `${ago} · ${entry.place_count}곳 묶어 한 번` : ago;

/** 가장 최근 **실제 호출**(`skipped` 가 아닌 행). 운영 현황의 재빌드 칸(`adminOpsHealth.ts`)도 같은 행을 본다 — 건너뛰는 규칙이 둘로 갈리지 않게. */
export const latestRebuildCall = <T extends TRebuildEntry>(entries: readonly T[]): T | undefined =>
  entries.find((entry) => entry.hook !== 'skipped');

export function rebuildHeadline(entries: TRebuildEntry[], nowMs: number): TRebuildHeadline {
  const latest = latestRebuildCall(entries);
  if (!latest) {
    return entries.length > 0
      ? { tone: 'none', text: '최근 변경은 게시 중인 장소가 아니어서 재빌드를 부르지 않았어요.' }
      : { tone: 'none', text: '아직 재빌드가 불린 적이 없어요.' };
  }

  const ago = agoLabel(latest.requested_at, nowMs);
  const subject = subjectOf(latest);

  /*
   * 아직 안 불렀다 — 고장이 아니라 **대기**다(쓰기가 60초 조용해지면 cron 이 묶어서 부른다). 단 가장 최근 줄이 5분 넘게
   * 그대로면 cron 이 안 도는 것이고, 그때는 영원히 안 빌드된다(쓰기도 화면도 멀쩡해 보인다) — 확인할 자리 하나를 가리킨다.
   */
  if (latest.hook === 'queued') {
    return nowMs - Date.parse(latest.requested_at) > QUEUE_STALL_MS
      ? {
          tone: 'warn',
          text: `${subject}이 아직 사이트에 반영되지 않았어요(${ago}) — 재빌드 예약이 안 돌고 있어요. Supabase 의 cron.job 에 flush-vercel-rebuild 잡이 있는지, 있으면 cron.job_run_details 에서 매분 실패하고 있지 않은지 확인해 주세요. 바꾼 것은 DB 에 남아 있어요.`,
        }
      : {
          tone: 'waiting',
          text: `재빌드 대기 중이에요(${ago}) — 변경이 1분 조용해지면 ${latest.place_count > 1 ? `${latest.place_count}곳을 ` : ''}묶어서 한 번 불러요`,
        };
  }

  if (latest.hook === 'missing') {
    return {
      tone: 'warn',
      text: `${subject}이 사이트에 반영되지 않아요(${ago}) — 재빌드를 부를 주소가 없어요(Vault 의 vercel_deploy_hook). 바꾼 것은 DB 에 남아 있어요.`,
    };
  }

  if (latest.hook === 'error') {
    return { tone: 'warn', text: `재빌드를 부르다 실패했어요(${ago}) — ${latest.note ?? '사유가 기록되지 않았어요.'}` };
  }

  const status = latest.response_status;

  if (status === null) {
    const stale = nowMs - Date.parse(latest.requested_at) > RESPONSE_WAIT_LIMIT_MS;
    return stale
      ? {
          tone: 'warn',
          text: `${subject}이 사이트에 반영됐는지 알 수 없어요(${ago}) — 재빌드를 보냈는데 응답을 못 받았어요. Vercel 배포 목록을 확인해 주세요.`,
        }
      : { tone: 'waiting', text: `재빌드를 보냈어요(${whenOf(latest, ago)}) · 응답을 기다리고 있어요` };
  }

  if (status >= 200 && status < 300) {
    /* HTTP 코드는 적지 않는다 — 2xx 는 운영자에게 뜻이 없다. 코드는 실패(4xx·5xx) 문장에만 싣는다(훅 폐기의 유일한 신호다). */
    return nowMs - Date.parse(latest.requested_at) > BUILD_SETTLE_MS
      ? { tone: 'ok', text: `사이트에 반영됐어요 · 마지막 재빌드 ${whenOf(latest, ago)}` }
      : { tone: 'ok', text: `재빌드가 걸렸어요(${whenOf(latest, ago)}) — 1~2분 뒤 사이트에 보여요` };
  }

  /*
   * 429 는 폐기가 아니라 **한도**다 — Deploy Hook 은 프로젝트당 시간당 60번(Vercel 문서 「Limits」). 트리거가 행마다 한 번씩 부르던 때는
   * 일괄 승인·일괄 고치기 한 번에 닿았다(2026-10-02 실측: 같은 분에 6건 전부 429, 10-06 엔 같은 훅이 201). 지금은 cron 이 묶어 부르므로
   * 분당 한 번이 상한이지만, 쉬엄쉬엄 한 시간 내내 고치면 여전히 닿을 수 있다. 이것을 "훅 폐기" 로 말하면
   * 운영자가 멀쩡한 훅을 회전한다(BUG-011). 빌드는 DB 전체를 읽으므로 **다음 성공한 호출 하나**가 거절된 변경까지 같이 반영한다.
   */
  if (status === 429) {
    return {
      tone: 'warn',
      text: `${subject}이 아직 사이트에 반영되지 않았어요(${ago} · 429) — 한 시간에 재빌드를 60번 넘게 불러 Vercel 이 이번 호출을 거절했어요. 훅은 그대로예요. 다음에 성공하는 재빌드가 이것까지 같이 반영해요 — 한 시간 뒤에도 안 걸리면 게시 중인 장소 하나를 다시 저장해 주세요.`,
    };
  }

  return {
    tone: 'warn',
    text: `${subject}이 아직 사이트에 반영되지 않았어요(${ago} · ${status}) — Vercel 이 재빌드를 거절했어요. Deploy Hook 이 폐기된 것 같아요. 새 주소를 Vault 의 vercel_deploy_hook 에 넣어 주세요.`,
  };
}

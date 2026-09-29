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
 * 이 한 줄이 특히 필요해진 계기는 Deploy Hook URL 이 에이전트 대화 기록에 남은 일이다(docs/todo/05).
 * 폐기·재발급이 권장되는데, 새 주소를 Vault 에 잘못 붙여 넣으면 증상이 **"아무 일도 안 일어남"** 이라
 * 회전 자체가 위험해진다. 회전을 안전하게 만드는 것은 새 주소가 아니라 "됐는지 볼 수 있는 자리" 다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** `rebuild_status()` 가 돌려주는 한 행. 훅 주소는 여기 없다(그 표에 담지 않는다 — 마이그레이션 머리 주석). */
export type TRebuildEntry = {
  requested_at: string;
  op: string;
  place_name: string | null;
  place_status: string | null;
  /** sent: 보냈다 · missing: Vault 에 훅이 없다 · skipped: 게시 집합이 안 바뀌어 안 불렀다 · error: 보내다 터졌다 */
  hook: 'sent' | 'missing' | 'skipped' | 'error';
  note: string | null;
  response_status: number | null;
  response_error: string | null;
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
 * 4xx·5xx 를 따로 말하는 것이 이 함수의 요점이다 — **훅이 폐기되면 그 코드로만 드러난다.**
 */
/**
 * 이 기록이 가리키는 쓰기를 운영자 말로. **승인만 이 트리거를 쓰는 게 아니다** — 내리기·되살리기도 같은 것을 쓴다
 * (`adminPlaces.ts` 머리 주석: 재빌드 장치를 새로 만들지 않았다). 그리고 이 머리글은 두 칸 위에 공용으로 뜬다.
 * 주어를 "승인한 것" 으로 못 박으면 폐업 가게를 내린 직후 머리글이 하지 않은 일을 말한다.
 * `place_status` 는 마이그레이션이 `touched.status` 로 채운다(`20260929121000_rebuild_log.sql:117`).
 */
const subjectOf = (entry: TRebuildEntry): string => (entry.place_status === 'archived' ? '내린 것' : '올린 것');

export function rebuildHeadline(entries: TRebuildEntry[], nowMs: number): TRebuildHeadline {
  const latest = entries.find((entry) => entry.hook !== 'skipped');
  if (!latest) {
    return entries.length > 0
      ? { tone: 'none', text: '최근 변경은 게시 중인 장소가 아니어서 재빌드를 부르지 않았어요.' }
      : { tone: 'none', text: '아직 재빌드가 불린 적이 없어요.' };
  }

  const ago = agoLabel(latest.requested_at, nowMs);
  const subject = subjectOf(latest);

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
      : { tone: 'waiting', text: `재빌드를 보냈어요(${ago}) · 응답을 기다리고 있어요` };
  }

  if (status >= 200 && status < 300) {
    return { tone: 'ok', text: `재빌드가 걸렸어요(${ago} · ${status}) — 1~2분 뒤 사이트에 보여요` };
  }

  return {
    tone: 'warn',
    text: `${subject}이 아직 사이트에 반영되지 않았어요(${ago} · ${status}) — Vercel 이 재빌드를 거절했어요. Deploy Hook 이 폐기된 것 같아요. 새 주소를 Vault 의 vercel_deploy_hook 에 넣어 주세요.`,
  };
}

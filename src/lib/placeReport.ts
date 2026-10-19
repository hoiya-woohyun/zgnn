/**
 * 사용자 장소 제보 — 순수 함수만(ADR-021, docs/todo/10 F1·F2·F8). 보내는 일(fetch)은 `placeReportSend.ts` 가 한다 —
 * 테스트가 Next·네트워크를 안 거친다는 규칙이라 여기에는 네트워크가 없다.
 *
 * 싣는 것은 넷뿐이다: 장소 id(상세에서 자동) · 종류 · 한 줄(선택) · 배포 식별자. 연락처·위치·기기 식별자·강아지 프로필·판정 결과는
 * **받지 않는다** — 하나라도 받으면 ADR-012 의 문서 묶음이 먼저 필요해진다. 그래서 답장도 없다.
 */

/** 표(`place_reports.kind`)의 CHECK 와 같은 목록. 한쪽만 고치면 그 종류만 23514 로 거부된다. */
export const REPORT_KINDS = ['closed', 'replaced', 'address', 'policy', 'phone', 'other', 'visited_ok', 'suggest'] as const;

export type TReportKind = (typeof REPORT_KINDS)[number];

/** 상세의 "정보가 달라요" 에서 고르는 종류. `phone` 은 전화번호 데이터(07 P0)가 생기기 전까지 고를 수 없다 — 없는 번호를 고칠 수는 없다. */
export const PICKABLE_REPORT_KINDS = ['closed', 'replaced', 'address', 'policy', 'other'] as const satisfies readonly TReportKind[];

export type TPickableReportKind = (typeof PICKABLE_REPORT_KINDS)[number];

/** 사용자가 고르는 말. 운영자 화면도 같은 말로 읽는다(두 벌로 두면 한쪽만 고친다). */
export const REPORT_KIND_LABEL: Record<TReportKind, string> = {
  closed: '문을 닫았어요(폐업·휴업)',
  replaced: '다른 가게로 바뀌었어요',
  address: '주소·위치가 달라요',
  policy: '반려동물 조건이 달라요',
  phone: '전화번호가 달라요',
  other: '그 밖에 달라요',
  visited_ok: '다녀왔는데 그대로였어요',
  suggest: '여기도 강아지랑 갈 수 있어요',
};

/** 운영자 표에 쓰는 짧은 말. */
export const REPORT_KIND_SHORT: Record<TReportKind, string> = {
  closed: '폐업',
  replaced: '다른 가게',
  address: '주소',
  policy: '조건',
  phone: '전화',
  other: '기타',
  visited_ok: '다녀왔어요',
  suggest: '장소 제안',
};

export const REPORT_NOTE_MAX = 200;

/**
 * '판정이 틀렸어요' 에서 고르는 이유(14 W261019.16) — 빈 채로 가던 판정 제보에 무엇이 틀렸는지를 싣는다(seongho-13·29).
 * 표에 칸을 더하지 않는다: `kind` 는 CHECK 와, 열 단위 grant 는 네 칸과 짝이라 칸을 더하면 마이그레이션이 먼저다.
 * 그래서 고른 말을 한 줄(note) **앞머리**에 붙여 보낸다(`buildReport`) — 운영자는 note 를 그대로 읽으니 접힌 줄에서도 먼저 보인다.
 * 말은 **사용자가 겪은 일**로만 짓는다 — "더 엄격했어요" 처럼 우리 판정에 견준 말은 판정 결과를 싣는 셈이고(머리 주석의 선),
 * 운영자는 그 사람의 판정을 모르니 읽을 수도 없다.
 */
export const VERDICT_REASONS = ['denied', 'admitted', 'fee', 'other'] as const;

export type TVerdictReason = (typeof VERDICT_REASONS)[number];

export const VERDICT_REASON_LABEL: Record<TVerdictReason, string> = {
  denied: '못 들어갔어요',
  admitted: '들어갈 수 있었어요',
  fee: '요금이 달랐어요',
  other: '그 밖에 달랐어요',
};

/** 이유를 고르는 시트의 한 줄 한도 — 앞머리(`이유 · `)를 붙여도 표의 200자 안에 들게. 테스트가 가장 긴 앞머리로 대 본다. */
export const REASON_NOTE_MAX = 180;

/** 표의 `app_build` CHECK(≤ 40자)와 같은 한도. */
const BUILD_MAX = 40;

/** `place_reports` 에 넣는 행 — 열 단위 grant 와 같은 네 칸. 나머지(`status` 등)는 기본값이 채운다. */
export type TReportInsert = {
  place_id: string | null;
  kind: TReportKind;
  note: string | null;
  app_build: string;
};

export type TReportDraft = {
  placeId: string | null;
  kind: TReportKind;
  note?: string;
  build?: string;
  /** '판정이 틀렸어요' 에서 고른 이유 — 한 줄 앞머리로 붙는다. */
  reason?: TVerdictReason;
};

export type TBuildReportResult = { ok: true; row: TReportInsert } | { ok: false; problem: string };

/**
 * 초안 → 넣을 행. 표의 CHECK 를 **보내기 전에** 같은 말로 걸러 낸다 — 서버의 23514 는 사용자에게 읽을 수 없는 말이다.
 * 한 줄은 앞뒤 공백을 걷고 비면 null. 길면 자르지 않고 막는다(잘린 말은 다른 말이 된다).
 * 이유가 있으면 한 줄 앞에 붙인다(`못 들어갔어요 · 10kg 넘는다고…`) — 한도는 붙이기 전 글로 `REASON_NOTE_MAX` 라 붙여도 표 CHECK 안이다.
 * '그 밖에' 는 한 줄이 있어야 한다 — 없으면 "그 밖에 달랐어요" 한 마디라 빈 제보와 같다.
 */
export function buildReport({ placeId, kind, note, build, reason }: TReportDraft): TBuildReportResult {
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return { ok: false, problem: '무엇이 다른지 하나 골라 주세요.' };
  const text = (note ?? '').trim();
  const max = reason ? REASON_NOTE_MAX : REPORT_NOTE_MAX;
  if ([...text].length > max) return { ok: false, problem: `${max}자까지 적을 수 있어요.` };
  if (kind === 'suggest') {
    if (text === '') return { ok: false, problem: '가게 이름을 적어 주세요.' };
  } else if (!placeId) {
    return { ok: false, problem: '어느 곳인지 알 수 없어요.' };
  }
  if (reason === 'other' && text === '') return { ok: false, problem: '무엇이 달랐는지 한 줄 적어 주세요.' };
  const body = reason ? [VERDICT_REASON_LABEL[reason], text].filter(Boolean).join(' · ') : text;
  return {
    ok: true,
    row: {
      place_id: kind === 'suggest' ? null : placeId,
      kind,
      note: body === '' ? null : body,
      app_build: (build && build.trim().slice(0, BUILD_MAX)) || 'dev',
    },
  };
}

/** 같은 기기·같은 장소·같은 종류는 하루 한 번(R2 의 **부드러운** 한도 — localStorage 를 지우면 풀린다. 서버 한도는 두지 않는다). */
export const REPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** 보낸 기록 — 키(`장소|종류`) → 보낸 시각(ms). */
export type TReportRecord = Record<string, number>;

export const reportKey = (placeId: string | null, kind: TReportKind): string => `${placeId ?? '-'}|${kind}`;

/**
 * 지금 보낼 수 있나. 제안(`suggest`)은 장소가 없어 키가 하나로 모이므로 한도를 걸지 않는다 —
 * 하루에 두 곳을 알려 주고 싶은 사람을 막을 까닭이 없다.
 */
export function canReportNow(record: TReportRecord, placeId: string | null, kind: TReportKind, now: number): boolean {
  if (kind === 'suggest') return true;
  const at = record[reportKey(placeId, kind)];
  return at === undefined || now - at >= REPORT_COOLDOWN_MS;
}

/**
 * 이 기기에서 이 장소에 하루 안에 보낸 종류(종류 순서대로). 보낸 것을 서버에서 다시 읽을 수 없어(insert 만) 흔적은 이 기록뿐이다.
 * 창이 쿨다운과 같은 하루라, 흔적이 보이는 동안은 같은 종류를 다시 못 보낸다는 것과 맞물린다.
 */
export function recentReportKinds(record: TReportRecord, placeId: string, now: number): TReportKind[] {
  return REPORT_KINDS.filter((kind) => {
    const at = record[reportKey(placeId, kind)];
    return kind !== 'suggest' && at !== undefined && now - at < REPORT_COOLDOWN_MS;
  });
}

/**
 * 상세 제보 칸의 흔적 한 줄(14 W261007.19 — 보낸 뒤 토스트가 사라지면 아무 일도 없었던 것처럼 보였다).
 * "오늘" 이라 쓰지 않는다 — 기록은 24시간 창이라 어젯밤에 보낸 것도 들어 있다. 종류는 고를 때 본 말 그대로 옮긴다.
 */
export function reportTraceText(kinds: readonly TReportKind[]): string | null {
  if (kinds.length === 0) return null;
  return `알려 주셨어요 — ${kinds.map((kind) => `‘${REPORT_KIND_LABEL[kind]}’`).join(' · ')}. 운영자가 확인할게요.`;
}

/** 제안 흔적에 옮기는 가게 이름 글자 수 — 한 줄(200자)을 통째로 옮기면 입구 한 줄이 문단이 된다. */
const SUGGEST_TRACE_MAX = 30;

/**
 * 장소 제안을 보낸 뒤 입구에 남는 한 줄(14 W261019.16 — 토스트가 걷히면 화면이 보내기 전과 같아 또 누를 것 같았다, haeun-18b).
 * 제안은 하루 한도가 없어(`canReportNow`) 기록에서 다시 꺼내지 않는다 — 흔적은 그 화면이 들고 있는 동안뿐이다. 긴 글은 앞만 옮긴다.
 */
export function suggestTraceText(name: string): string {
  const chars = [...name.trim()];
  const shown = chars.length > SUGGEST_TRACE_MAX ? `${chars.slice(0, SUGGEST_TRACE_MAX).join('')}…` : chars.join('');
  return `알려 주셨어요 — ‘${shown}’. 확인되면 올라가요.`;
}

/** 보낸 뒤의 기록 — 하루가 지난 것은 버린다(기록이 끝없이 자라지 않게). */
export function recordReport(record: TReportRecord, placeId: string | null, kind: TReportKind, now: number): TReportRecord {
  const next: TReportRecord = {};
  for (const [key, at] of Object.entries(record)) if (now - at < REPORT_COOLDOWN_MS) next[key] = at;
  next[reportKey(placeId, kind)] = now;
  return next;
}

/**
 * 기록 하나를 걷는다 — 누르는 순간 남긴 '그대로였어요' 를 되돌렸거나 미뤄 보내다 실패했을 때(14 W261010.7g).
 * 남겨 둔 채면 보내지도 않은 것이 흔적 줄에 서고 하루 동안 다시 못 보낸다.
 */
export function unrecordReport(record: TReportRecord, placeId: string | null, kind: TReportKind): TReportRecord {
  const next = { ...record };
  delete next[reportKey(placeId, kind)];
  return next;
}

/** localStorage 에서 읽은 값을 믿지 않는다 — 모양이 틀리면 빈 기록(한도가 풀리는 쪽이 갇히는 쪽보다 낫다). */
export function parseReportRecord(raw: string | null): TReportRecord {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record: TReportRecord = {};
    for (const [key, at] of Object.entries(value)) if (typeof at === 'number' && Number.isFinite(at)) record[key] = at;
    return record;
  } catch {
    return {};
  }
}

/** 보낸 뒤 사용자에게 하는 말. 답장이 없다는 것을 숨기지 않는다 — 대신 무엇이 바뀌는지를 말한다. */
export function reportSentText(kind: TReportKind): string {
  if (kind === 'visited_ok') return '고마워요! 다녀온 이야기가 확인 날짜에 보태져요';
  if (kind === 'suggest') return '알려 줘서 고마워요! 운영자가 찾아보고 올릴게요';
  return '고마워요! 운영자가 확인하고 고칠게요';
}

/**
 * 시트 맨 아래 약속 한 줄. 장소 제안은 고칠 것이 없다 — "고친 내용은 반영돼요" 가 제안 시트에 서면 무엇을 고친다는지 묻게 된다(14 W261007.19).
 * 제안이면 확인 뒤 **올라간다**고 말한다.
 */
export function reportPromiseText(kinds: readonly TReportKind[]): string {
  const suggestOnly = kinds.length > 0 && kinds.every((kind) => kind === 'suggest');
  return suggestOnly
    ? '연락처는 받지 않아요. 그래서 따로 답장은 못 드리지만, 확인되면 다음 업데이트에 올라가요.'
    : '연락처는 받지 않아요. 그래서 따로 답장은 못 드리지만, 고친 내용은 다음 업데이트에 반영돼요.';
}

export type TReportSendFailure = 'offline' | 'unavailable' | 'rejected' | 'network';

export function reportFailureText(reason: TReportSendFailure): string {
  switch (reason) {
    case 'offline':
      return '인터넷에 연결되면 다시 보내 주세요';
    case 'unavailable':
      return '지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요';
    case 'rejected':
      return '보내지 못했어요. 적은 내용을 줄여서 다시 해 주세요';
    default:
      return '보내지 못했어요. 잠시 뒤 다시 해 주세요';
  }
}

/**
 * 미뤄 보낸 '그대로였어요' 가 실패했을 때(14 W261010.7g). 되돌리기 알림이 걷힌 뒤에 보내므로 그때는 다른 화면에 있을 수 있다 —
 * 무엇을 못 보냈는지부터 말한다. 오프라인은 누르는 순간에 먼저 걸러 여기 오는 일이 드물다.
 */
export function visitedLateFailureText(reason: TReportSendFailure): string {
  return reason === 'offline'
    ? '인터넷이 끊겨 ‘그대로였어요’ 를 보내지 못했어요'
    : '‘그대로였어요’ 를 보내지 못했어요. 잠시 뒤 다시 눌러 주세요';
}

export const REPORT_COOLDOWN_TEXT = '오늘은 이미 알려 주셨어요. 고마워요!';

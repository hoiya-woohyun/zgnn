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
};

export type TBuildReportResult = { ok: true; row: TReportInsert } | { ok: false; problem: string };

/**
 * 초안 → 넣을 행. 표의 CHECK 를 **보내기 전에** 같은 말로 걸러 낸다 — 서버의 23514 는 사용자에게 읽을 수 없는 말이다.
 * 한 줄은 앞뒤 공백을 걷고 비면 null. 길면 자르지 않고 막는다(잘린 말은 다른 말이 된다).
 */
export function buildReport({ placeId, kind, note, build }: TReportDraft): TBuildReportResult {
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return { ok: false, problem: '무엇이 다른지 하나 골라 주세요.' };
  const text = (note ?? '').trim();
  if ([...text].length > REPORT_NOTE_MAX) return { ok: false, problem: `${REPORT_NOTE_MAX}자까지 적을 수 있어요.` };
  if (kind === 'suggest') {
    if (text === '') return { ok: false, problem: '가게 이름을 적어 주세요.' };
  } else if (!placeId) {
    return { ok: false, problem: '어느 곳인지 알 수 없어요.' };
  }
  return {
    ok: true,
    row: {
      place_id: kind === 'suggest' ? null : placeId,
      kind,
      note: text === '' ? null : text,
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

/** 보낸 뒤의 기록 — 하루가 지난 것은 버린다(기록이 끝없이 자라지 않게). */
export function recordReport(record: TReportRecord, placeId: string | null, kind: TReportKind, now: number): TReportRecord {
  const next: TReportRecord = {};
  for (const [key, at] of Object.entries(record)) if (now - at < REPORT_COOLDOWN_MS) next[key] = at;
  next[reportKey(placeId, kind)] = now;
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

export const REPORT_COOLDOWN_TEXT = '오늘은 이미 알려 주셨어요. 고마워요!';

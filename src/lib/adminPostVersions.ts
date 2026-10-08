/**
 * 수집 완료 칸의 **프롬프트 판 분포**(09 T3.3) — 옛 프롬프트로 읽힌 글을 골라 다시 읽히려고.
 *
 * 화면은 지금 코드의 `PROMPT_VERSION` 을 모른다 — `scripts/analyze/extractPlaces.mjs` 가 실행할 때 프롬프트·스키마의 sha256 으로
 * 만들고(`node:crypto`), 그 파일을 번들에 넣으면 `claude -p` 를 부르는 `child_process` 까지 딸려 온다. 그래서 "지금 판" 대신
 * **마지막으로 분석이 쓴 판**을 `최근` 이라 부른다(명세의 `최신` 이 아니다) — 프롬프트를 고친 뒤 아직 분석을 안 돌렸으면 그 판도 옛 판이고,
 * `최신` 이라고 적으면 "다시 읽을 필요 없다" 로 읽힌다.
 *
 * 분석된 글의 집합은 `분석됨` 칩과 같다(`onlyAnalyzed`) — 판별 칩의 합이 그 칩의 수와 맞아야 표를 믿는다.
 */

import type { PostgrestFilterBuilder, SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 어느 select 모양의 질의든 받는다(필터만 붙인다).
export type TPostQuery = PostgrestFilterBuilder<any, any, any, any, any, any, any>;

/** 판이 적히지 않은 분석(판을 남기기 전에 읽힌 글) — 칩 하나로 모은다. */
export const NO_PROMPT_VERSION_LABEL = '판 기록 없음';

export type TPromptVersionCount = {
  /** `analysis->>promptVersion`(8자). 없으면 null. */
  version: string | null;
  count: number;
  /** 그 판으로 마지막에 읽은 때. */
  lastAnalyzedAt: string | null;
};

export type TPromptVersionTally = {
  total: number;
  /** 마지막에 읽은 때가 늦은 판이 위 — 맨 앞이 `최근`. 때를 모르는 판은 맨 끝. */
  versions: TPromptVersionCount[];
};

const timeOf = (at: string | null) => (at ? Date.parse(at) : Number.NaN);

/** 순수 — 분석된 글 줄을 판별로 센다. 빈 문자열은 판 없음으로 읽는다. */
export function tallyPromptVersions(rows: { promptVersion: string | null; analyzed_at: string | null }[]): TPromptVersionTally {
  const byVersion = new Map<string | null, TPromptVersionCount>();
  for (const row of rows) {
    const version = row.promptVersion?.trim() || null;
    const entry = byVersion.get(version) ?? { version, count: 0, lastAnalyzedAt: null };
    entry.count += 1;
    if (row.analyzed_at && !(timeOf(entry.lastAnalyzedAt) >= timeOf(row.analyzed_at))) entry.lastAnalyzedAt = row.analyzed_at;
    byVersion.set(version, entry);
  }
  const versions = [...byVersion.values()].sort((a, b) => {
    const ta = timeOf(a.lastAnalyzedAt);
    const tb = timeOf(b.lastAnalyzedAt);
    if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
    return (Number.isNaN(ta) ? 0 : tb - ta) || b.count - a.count;
  });
  return { total: rows.length, versions };
}

/**
 * **"분석됨" 의 정의 한 곳** — `분석됨` 칩의 목록(`fetchPosts`)과 판 분포가 같은 집합이어야 판별 칩의 합이 그 칩의 수와 맞는다.
 * 분석된 뒤 제외한 글은 `제외` 칩에만 있다(세 칩이 전체를 나눈다). 제외 칸이 없으면(마이그레이션 미적용) 제외 조건 없이.
 */
export function onlyAnalyzed<Q extends TPostQuery>(query: Q, excludedApplied: boolean): Q {
  const analyzed = query.not('analyzed_at', 'is', null) as Q;
  return excludedApplied ? (analyzed.is('excluded_at', null) as Q) : analyzed;
}

/** 판 하나로 좁힌다 — undefined 면 그대로(전부), null 이면 판이 안 적힌 글. */
export function withPromptVersion<Q extends TPostQuery>(query: Q, version: string | null | undefined): Q {
  if (version === undefined) return query;
  return (version === null ? query.is('analysis->>promptVersion', null) : query.eq('analysis->>promptVersion', version)) as Q;
}

const PAGE = 1000;

/**
 * 판 분포 — `analysis->>promptVersion, analyzed_at` 두 칸만 1,000행씩 받아 센다(분석된 글이 지금 177건, 다 읽혀도 3,360건이면 네 번).
 * `url` 로 정렬을 고정해야 페이지가 겹치거나 빠지지 않는다. `분석됨` 칩을 처음 열 때와 쓰기 뒤에만 읽는다.
 */
export async function fetchPromptVersions(client: SupabaseClient, excludedApplied: boolean): Promise<TPromptVersionTally> {
  const rows: { promptVersion: string | null; analyzed_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await onlyAnalyzed(client.from('blog_posts').select('promptVersion:analysis->>promptVersion, analyzed_at'), excludedApplied)
      .order('url')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`프롬프트 판을 세지 못했어요 (${error.message})`);
    rows.push(...((data ?? []) as unknown as typeof rows));
    if (!data || data.length < PAGE) break;
  }
  return tallyPromptVersions(rows);
}

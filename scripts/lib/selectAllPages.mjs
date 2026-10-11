// PostgREST 는 한 번에 최대 행 수(이 프로젝트 1000)까지만 주고 **나머지를 에러 없이 자른다** — `.limit(1000)` 을 붙여도 같은 값이라
// 넘친 행이 조용히 빠진다(2026-10-11 pending 후보 1,075건 중 1000건만 읽어 `dupOf` 씨앗이 75건 빠졌다).
// 그래서 정렬 키로 순서를 고정하고 `range()` 로 빈 페이지가 나올 때까지 넘긴다. 다음 페이지는 **받은 행 수만큼** 앞에서 시작한다 —
// 서버 상한이 pageSize 보다 작아도 덜 찬 페이지를 끝으로 읽거나 그 사이를 건너뛰지 않는다. 요청 한 번이 더 나가는 비용뿐이다.

/**
 * @param {(from: number, to: number) => PromiseLike<{ data: unknown[] | null, error: { message: string } | null }>} pageAt
 *   `from`~`to`(포함) 행을 주는 질의. **정렬 키가 있어야 한다**(`order('id')`) — 없으면 페이지 사이에 행이 겹치거나 빠진다.
 * @returns {Promise<{ data: unknown[], error: null } | { data: null, error: { message: string } }>}  supabase-js 와 같은 모양
 */
export async function selectAllPages(pageAt, { pageSize = 1000 } = {}) {
  const rows = [];
  for (;;) {
    const from = rows.length;
    const { data, error } = await pageAt(from, from + pageSize - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) return { data: rows, error: null };
    rows.push(...data);
  }
}

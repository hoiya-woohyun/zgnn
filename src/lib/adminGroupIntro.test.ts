import { describe, expect, it } from 'vitest';
import type { TCandidateGroup } from './adminCandidates';
import { fetchGroupIntros, groupIntroOf, introPostLinks, NO_GROUP_INTROS } from './adminGroupIntro';

type TClient = Parameters<typeof fetchGroupIntros>[0];

/** `group_intros` 를 한 번 읽는 가짜 — 첫 페이지에 결과, 다음 페이지는 비어 끝난다. */
const fakeClient = (first: { data: unknown[] | null; error: { code?: string; message: string } | null }) => {
  let calls = 0;
  const range = () => Promise.resolve(calls++ === 0 ? first : { data: [], error: null });
  return { from: () => ({ select: () => ({ order: () => ({ range }) }) }) } as unknown as TClient;
};

describe('fetchGroupIntros — 표가 아직 없으면 조용히 물러난다(13 §5.3 A3)', () => {
  it('PGRST205(표 없음)면 빈 묶음 — 화면은 대체값으로 그린다', async () => {
    const intros = await fetchGroupIntros(fakeClient({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.group_intros'" } }));
    expect(intros).toBe(NO_GROUP_INTROS);
  });

  it('그 밖의 실패는 던진다 — 삼키면 충돌 뱃지가 사라지고 대표 요약이 등록된다', async () => {
    await expect(fetchGroupIntros(fakeClient({ data: null, error: { code: '42501', message: 'permission denied' } }))).rejects.toThrow('묶음 소개 조회');
  });

  it('줄은 묶음 키로 찾는다', async () => {
    const row = { group_key: 'name:바다펜션', fingerprint: 'f', intro: null, sentences: [], conflict: null, reasons: [] };
    const intros = await fetchGroupIntros(fakeClient({ data: [row], error: null }));
    expect(intros.get('name:바다펜션')).toEqual(row);
  });
});

describe('groupIntroOf · introPostLinks', () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({
    id: `c-${n}`,
    post_url: `https://blog/${n}`,
    match_place_id: null,
    blog_posts: n === 2 ? null : { title: `글 ${n}`, posted_at: '2026-10-01', keyword: 'k', blog_id: null },
    extracted: { name: '바다펜션', type: 'stay', features: '잔디마당이 있는 펜션이에요.', visited: true },
  }));
  const group = { key: 'name:바다펜션', lead: rows[0], rows } as unknown as TCandidateGroup;

  it('저장된 줄이 없으면 대체값 — 같은 요약 다섯 편은 재료 하나라 그 요약', () => {
    expect(groupIntroOf(group)).toMatchObject({ source: 'summary', text: '잔디마당이 있는 펜션이에요.' });
  });

  it('출처 글은 제목으로, 셋까지 · 제목 없는 글은 주소 그대로 · 나머지는 수로', () => {
    expect(introPostLinks(group, rows.map((row) => row.post_url))).toEqual({
      links: [
        { url: 'https://blog/1', title: '글 1' },
        { url: 'https://blog/2', title: 'https://blog/2' },
        { url: 'https://blog/3', title: '글 3' },
      ],
      rest: 2,
    });
  });
});

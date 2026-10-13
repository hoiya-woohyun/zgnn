import { describe, expect, it } from 'vitest';
import { GROUP_INTROS_MIGRATION, readGroupIntroFingerprints, saveGroupIntro } from './groupIntroStore.mjs';

/** 가짜 supabase — `from(표).select().order().range()` 의 결과를 페이지(from)마다 돌려준다. */
const readClient = (pageAt) => {
  const calls = [];
  const query = {
    select: (cols) => (calls.push(['select', cols]), query),
    order: (col) => (calls.push(['order', col]), query),
    range: async (from, to) => (calls.push(['range', from, to]), pageAt(from)),
  };
  return { from: (table) => (calls.push(['from', table]), query), calls };
};

describe('readGroupIntroFingerprints — 표가 없어도 던지지 않는다(push 전에도 분석이 돈다)', () => {
  it('저장된 줄 → 묶음 키 → 지문(1000행 넘게 끝까지 읽는다)', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ group_key: `name:${i}`, fingerprint: `f${i}` }));
    const client = readClient((from) => ({ data: from === 0 ? page : from === 1000 ? [{ group_key: 'name:last', fingerprint: 'z' }] : [], error: null }));
    const map = await readGroupIntroFingerprints(client, () => {
      throw new Error('경고가 나오면 안 된다');
    });
    expect(map.size).toBe(1001);
    expect(map.get('name:last')).toBe('z');
    expect(client.calls[0]).toEqual(['from', 'group_intros']);
  });

  for (const [code, message] of [
    ['42P01', 'relation "public.group_intros" does not exist'],
    ['PGRST205', "Could not find the table 'public.group_intros' in the schema cache"],
    ['42703', 'column group_intros.fingerprint does not exist'],
  ]) {
    it(`표·칸 없음(${code}) → null + 마이그레이션 이름을 담은 경고 한 줄`, async () => {
      const warnings = [];
      const map = await readGroupIntroFingerprints(readClient(() => ({ data: null, error: { code, message } })), (line) => warnings.push(line));
      expect(map).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(GROUP_INTROS_MIGRATION);
    });
  }

  it('다른 실패(세션·네트워크)도 null — "저장된 것 없음" 으로 삼켜 전부 다시 부르지 않는다', async () => {
    const warnings = [];
    const map = await readGroupIntroFingerprints(readClient(() => ({ data: null, error: { code: '42501', message: 'permission denied' } })), (line) => warnings.push(line));
    expect(map).toBeNull();
    expect(warnings[0]).toContain('permission denied');
  });
});

describe('saveGroupIntro — 묶음 키로 덮는 upsert', () => {
  const upsertClient = (error) => {
    const calls = [];
    return { from: (table) => ({ upsert: async (row, opts) => (calls.push({ table, row, opts }), { error }) }), calls };
  };
  it('onConflict group_key · .select() 없음', async () => {
    const client = upsertClient(null);
    await saveGroupIntro(client, { group_key: 'name:x', fingerprint: 'f' });
    expect(client.calls).toEqual([{ table: 'group_intros', row: { group_key: 'name:x', fingerprint: 'f' }, opts: { onConflict: 'group_key' } }]);
  });
  it('실패는 던진다(패스가 내린다)', async () => {
    await expect(saveGroupIntro(upsertClient({ message: 'permission denied for table group_intros' }), { group_key: 'name:x' })).rejects.toThrow('group_intros 저장 실패');
  });
});

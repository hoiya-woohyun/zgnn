// 묶음 소개 표(`group_intros`, docs/todo/13 §5.3 A2)를 읽고 쓰는 자리. 표는 마이그레이션이 원격에 적용돼야 생긴다(🧑 `db push`).
// **미적용이어도 분석은 멈추지 않는다** — 소개는 더하기만 하는 값이라, 표가 없으면 경고 한 줄을 찍고 그 패스만 건너뛴다(로컬·서버 워커가 같은 코드를 돈다).
import { selectAllPages } from './selectAllPages.mjs';
import { isSchemaMissing } from './workerQueue.mjs';

export const GROUP_INTROS_MIGRATION = 'supabase/migrations/20261013150000_group_intros.sql';

/**
 * 저장된 지문들(묶음 키 → 지문). 표·칸이 없거나(42P01 · PGRST205 · 42703) 읽지 못하면 null 과 경고 한 줄 — 던지지 않는다.
 * 읽기 실패를 "저장된 것 없음" 으로 삼키지 않는 이유: 그러면 모든 묶음이 낡은 것으로 보여 부르기가 쏟아진다. null 이면 부르는 쪽이 패스를 내린다.
 * @returns {Promise<Map<string, string> | null>}
 */
export async function readGroupIntroFingerprints(client, warn = (line) => console.warn(line)) {
  const { data, error } = await selectAllPages((from, to) => client.from('group_intros').select('group_key, fingerprint').order('group_key').range(from, to));
  if (!error) return new Map(data.map((row) => [row.group_key, row.fingerprint]));
  warn(
    isSchemaMissing(error)
      ? `⚠ group_intros 표가 없다 — 묶음 소개를 건너뛴다(${GROUP_INTROS_MIGRATION} 을 db push 하면 켜진다)`
      : `⚠ group_intros 조회 실패 — 묶음 소개를 건너뛴다: ${error.message}`,
  );
  return null;
}

/** 한 줄 upsert(묶음 키로 덮는다). `.select()` 를 붙이지 않는다 — return=minimal 이라 insert·update 정책만 지난다. 실패는 던진다(패스가 내린다). */
export async function saveGroupIntro(client, row) {
  const { error } = await client.from('group_intros').upsert(row, { onConflict: 'group_key' });
  if (error) throw new Error(`group_intros 저장 실패: ${error.message}`);
}

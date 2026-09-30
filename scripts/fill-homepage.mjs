// 이미 쌓인 pending 후보에 **공식 홈페이지 카드**를 채운다(`pnpm data:homepage`). 새 후보는 `data:analyze` 가 만들 때 채우므로
// 이 스크립트는 그 기능이 생기기 전(2026-09-30)의 후보를 위한 것이다. 카드 규칙은 scripts/analyze/homepageCard.mjs 가 정본(ADR-002 v2).
//
//  - 대상: status='pending' 이고 extracted.naverLink 가 있고 extracted.homepage 칸이 **아직 없는** 후보. 읽고 못 찾았으면
//    homepage: null 을 적어 닫는다 — 안 적으면 매 실행 같은 사이트를 다시 두드린다. 사람이 비운 카드(null)도 그래서 되살아나지 않는다.
//  - 잠깐의 실패(타임아웃·5xx)는 칸을 비워 둔다 — 다음 실행이 다시 시도한다.
//  - Claude·네이버 키가 필요 없다. 업체 사이트에 요청이 나갈 뿐이다(같은 link 는 한 번만).
//  - 마이그레이션 20260930120000 이 없으면 멈춘다 — 카드를 채운 후보의 승인이 insert 에서 통째로 실패하기 때문이다(analyze-candidates.mjs 와 같은 이유).
import { fetchHomepageCard } from './analyze/homepageCard.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
let limit = 100;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--dry-run') continue;
  const value = arg === '--limit' ? argv[++i] : arg.startsWith('--limit=') ? arg.slice('--limit='.length) : null;
  if (value === null || !/^\d+$/.test(value) || Number(value) < 1) {
    console.error(`알 수 없는 인자: ${arg} — 사용법: pnpm data:homepage [--limit N] [--dry-run]`);
    process.exit(1);
  }
  limit = Number(value);
}

const supabase = createSupabase();

{
  const { error } = await supabase.from('places').select('homepage_url').limit(1);
  if (error) {
    console.error(`places.homepage_url 을 읽지 못했다(${error.message}) — supabase/migrations/20260930120000_places_homepage.sql 을 적용한 뒤 다시 돌린다.`);
    process.exit(1);
  }
}

const { data: rows, error } = await supabase
  .from('candidates')
  .select('id, extracted')
  .eq('status', 'pending')
  .not('extracted->>naverLink', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1000);
if (error) throw new Error(`candidates 조회 실패: ${error.message}`);

const targets = rows.filter((row) => !('homepage' in (row.extracted ?? {}))).slice(0, limit);
console.log(`${dryRun ? '[dry-run] ' : ''}대상 ${targets.length}건 (link 있는 pending ${rows.length}건 중 아직 안 읽은 것)`);

const cache = new Map();
const stats = { card: 0, image: 0, none: 0, failed: 0 };
for (const row of targets) {
  const link = row.extracted.naverLink;
  let card;
  try {
    if (!cache.has(link)) cache.set(link, await fetchHomepageCard(link));
    card = cache.get(link);
  } catch (e) {
    stats.failed++;
    console.log(`  ${row.extracted.name} — 읽기 실패(${e.name === 'TimeoutError' ? '시간 초과' : e.message}), 다음 실행에 다시`);
    continue;
  }
  if (card) {
    stats.card++;
    if (card.image) stats.image++;
  } else stats.none++;
  console.log(`  ${row.extracted.name} — ${card ? `${card.siteName ?? card.url}${card.image ? ' · 사진' : ''}` : '홈페이지 아님'}`);
  if (dryRun) continue;
  const { error: writeError } = await supabase
    .from('candidates')
    .update({ extracted: { ...row.extracted, homepage: card } })
    .eq('id', row.id)
    .eq('status', 'pending');
  if (writeError) throw new Error(`후보 ${row.id} 쓰기 실패: ${writeError.message}`);
}

console.log(
  `${dryRun ? '[dry-run] ' : ''}카드 ${stats.card} (사진 있음 ${stats.image}) · 홈페이지 아님 ${stats.none}${stats.failed ? ` · 실패 ${stats.failed}` : ''}`,
);

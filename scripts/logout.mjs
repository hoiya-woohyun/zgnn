// `pnpm data logout` — 키체인의 로그인 세션을 지운다. 서버엔 아무것도 안 한다(refresh token 을 저장하지 않았으니 되돌릴 것도 없다).
// 만료 전에 세션을 버리고 싶을 때, 또는 anon 경로(`pnpm data pull` 이 publishable 키만으로 도는지)를 로컬에서 확인할 때 쓴다.
import { deleteSession } from './lib/sessionKeychain.mjs';
import { isDirectRun } from './lib/isDirectRun.mjs';

export async function main() {
  console.log(deleteSession() ? '로그아웃 — 키체인의 세션을 지웠다.' : '저장된 세션이 없다.');
}

if (isDirectRun(import.meta.url)) process.exitCode = await main();

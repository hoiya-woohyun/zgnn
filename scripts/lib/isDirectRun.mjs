// 이 모듈이 `node scripts/x.mjs` 로 직접 실행됐나 — `scripts/data.mjs` 가 import 할 때는 아니다(ADR-024).
// 각 스크립트가 `export async function main()` 을 두고 파일 끝에서 이것이 참일 때만 스스로 돈다. 심볼릭 링크로 불러도 같게 realpath 로 견준다.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

// 네이버 키를 사용자 홈의 파일(`~/.zgnn-naver.env`)에서 읽어 env 에 얹는다(2026-10-05, ADR-016 v6).
//
// 왜 파일인가: 분석(`data:analyze`)은 한 번에 끝나지 않는다 — 구독 한도에 닿으면 멈추고 다시 돌리는데, 그때마다 키 넷을 숨김 입력으로
// 치는 것이 재분석을 미루게 만들었다. 에이전트 세션에서는 입력 자체를 받지 않으므로 env 가 없으면 아예 못 돈다.
//
// 왜 이 파일이 "값을 저장하지 않는다"(ADR-016)를 깨지 않나:
//  - **레포 밖**이다. 커밋·번들·배포 어느 길에도 실리지 않는다(`.env.local` 은 레포 안이라 그 반대다).
//  - 읽는 이름이 넷으로 **고정**이다 — Supabase 키 같은 다른 이름을 이 파일에 적어도 읽지 않는다. 장기 Supabase 키를 두는 길이 되지 않게.
//  - 남이 읽을 수 있는 권한(그룹·기타 비트)이면 읽지 않고 멈춘다 — `chmod 600`.
//  - 값은 어디에도 찍지 않는다. 돌려주는 것은 **이름**뿐이다.
// 네이버 검색 키는 하루 한 번 초기화하는 값이라 이 예외를 둔다(다른 시크릿은 그대로 — 로그인 세션).

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 이 파일에서 읽는 이름 — 이것 말고는 적혀 있어도 무시한다. */
export const NAVER_ENV_NAMES = ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_MAP_CLIENT_ID', 'NAVER_MAP_CLIENT_SECRET'];

export const NAVER_ENV_FILE = join(homedir(), '.zgnn-naver.env');

/**
 * `KEY=VALUE` 줄들을 읽는다. `export ` 머리, 양끝 따옴표, `#` 주석 줄, 빈 줄을 받는다. 허용 이름만 돌려준다. 순수.
 * 값 안의 `#` 는 주석으로 보지 않는다(키에 들어갈 수 있다) — 줄 끝 주석은 지원하지 않는다.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseNaverEnv(text) {
  const out = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || !NAVER_ENV_NAMES.includes(m[1])) continue;
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    if (value) out[m[1]] = value;
  }
  return out;
}

/**
 * 파일이 있으면 읽어 **비어 있는 env 이름만** 채운다 — 셸에서 넘긴 값이 이긴다. 파일이 없으면 아무 일도 없다.
 * @param {{ path?: string, env?: Record<string, string | undefined> }} [opts]
 * @returns {{ path: string, loaded: string[] }}  채운 이름들(값은 돌려주지 않는다)
 */
export function loadNaverEnvFile({ path = NAVER_ENV_FILE, env = process.env } = {}) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return { path, loaded: [] };
  }
  if (stat.mode & 0o077) {
    throw new Error(`${path} 를 다른 사용자가 읽을 수 있다 — \`chmod 600 ${path}\` 뒤 다시 실행`);
  }
  const loaded = [];
  for (const [name, value] of Object.entries(parseNaverEnv(readFileSync(path, 'utf8')))) {
    if (env[name]?.trim()) continue;
    env[name] = value;
    loaded.push(name);
  }
  return { path, loaded };
}

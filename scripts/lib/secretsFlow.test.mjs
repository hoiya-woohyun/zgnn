import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUNNABLE, SECRETS, isSecretName, leakedEnvNames, selectNames } from './secretsFlow.mjs';

describe('selectNames — 어떤 이름이 어디로 흐르는가', () => {
  it('요청이 없으면 그 flow 가 true 인 이름 전부', () => {
    for (const flow of ['run', 'gh', 'vercel']) {
      expect(selectNames(flow)).toEqual(Object.keys(SECRETS).filter((n) => SECRETS[n][flow]));
    }
    expect(selectNames('vercel')).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
    expect(selectNames('run')).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('모르는 이름·그 flow 가 아닌 이름은 거부한다 — 오타로 고아 항목이 생기지 않게', () => {
    expect(() => selectNames('gh', ['NOPE'])).toThrow('모르는 이름');
    expect(() => selectNames('run', ['CLAUDE_CODE_OAUTH_TOKEN'])).toThrow('run 로 보내지 않는');
    expect(selectNames('gh', ['NAVER_CLIENT_ID'])).toEqual(['NAVER_CLIENT_ID']);
  });

  it('프로토타입 이름은 이름이 아니다', () => {
    for (const bad of ['constructor', 'toString', 'hasOwnProperty', '', undefined]) expect(isSecretName(bad)).toBe(false);
    expect(() => selectNames('gh', ['constructor'])).toThrow('모르는 이름');
  });
});

describe('RUNNABLE — package.json 의 `secrets run` 대상과 같은 집합', () => {
  it('한쪽만 고치면 Vercel 빌드(data:pull)가 거부되거나 시크릿 없이 돈다', () => {
    const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const fromPackage = Object.values(scripts)
      .map((cmd) => /^node scripts\/secrets\.mjs run (\S+)/.exec(cmd)?.[1])
      .filter(Boolean);
    expect(new Set(fromPackage)).toEqual(RUNNABLE);
  });
});

describe('leakedEnvNames — .env.local 에 남은 시크릿을 Node 파서 기준으로 잡는다', () => {
  it('SECRETS 이름과 비밀처럼 생긴 이름은 잡고, 빈 자리표시자·공개 값은 넘긴다', () => {
    const text = [
      'SUPABASE_URL=https://x.supabase.co',
      'SUPABASE_SERVICE_ROLE_KEY=eyJ...',
      'KAKAO_REST_API_KEY=   # 03 좌표 보강 — .env.example 을 복사한 빈 줄',
      'NAVER_CLIENT_ID=""',
      '# Created by Vercel CLI',
      'VERCEL_OIDC_TOKEN=abc',
      'NEXT_PUBLIC_KAKAO_MAP_KEY=public',
    ].join('\n');
    expect(leakedEnvNames(text)).toEqual(['SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_OIDC_TOKEN']);
  });

  it('`export` 접두어·따옴표·CRLF 도 Node 가 읽는 그대로 본다', () => {
    expect(leakedEnvNames('export NAVER_CLIENT_SECRET=abc')).toEqual(['NAVER_CLIENT_SECRET']);
    expect(leakedEnvNames("NAVER_CLIENT_SECRET='abc'")).toEqual(['NAVER_CLIENT_SECRET']);
    expect(leakedEnvNames('NAVER_CLIENT_SECRET=abc\r\nSUPABASE_URL=u\r\n')).toEqual(['NAVER_CLIENT_SECRET']);
    expect(leakedEnvNames('')).toEqual([]);
  });
});

import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadNaverEnvFile, parseNaverEnv } from './naverEnvFile.mjs';

describe('parseNaverEnv — 허용한 네 이름만 읽는다', () => {
  it('export 머리 · 따옴표 · 주석 · 빈 줄 · 앞뒤 공백을 받는다', () => {
    const text = ['# 네이버 검색', 'NAVER_CLIENT_ID = abc ', 'export NAVER_CLIENT_SECRET="s3#cret"', '', "NAVER_MAP_CLIENT_ID='map'"].join('\n');
    expect(parseNaverEnv(text)).toEqual({ NAVER_CLIENT_ID: 'abc', NAVER_CLIENT_SECRET: 's3#cret', NAVER_MAP_CLIENT_ID: 'map' });
  });

  it('다른 이름(Supabase 키 등)과 빈 값은 버린다', () => {
    expect(parseNaverEnv('SUPABASE_SERVICE_ROLE_KEY=x\nNAVER_CLIENT_ID=\nnot a line')).toEqual({});
  });
});

describe('loadNaverEnvFile', () => {
  const fileWith = (text, mode = 0o600) => {
    const path = join(mkdtempSync(join(tmpdir(), 'naver-env-')), 'naver.env');
    writeFileSync(path, text);
    chmodSync(path, mode);
    return path;
  };

  it('비어 있는 env 만 채우고 채운 이름을 돌려준다 — 셸에서 넘긴 값이 이긴다', () => {
    const env = { NAVER_CLIENT_ID: 'from-shell' };
    const { loaded } = loadNaverEnvFile({ path: fileWith('NAVER_CLIENT_ID=file\nNAVER_CLIENT_SECRET=secret'), env });
    expect(loaded).toEqual(['NAVER_CLIENT_SECRET']);
    expect(env).toEqual({ NAVER_CLIENT_ID: 'from-shell', NAVER_CLIENT_SECRET: 'secret' });
  });

  it('파일이 없으면 아무 일도 없다', () => {
    const env = {};
    expect(loadNaverEnvFile({ path: join(tmpdir(), 'no-such-naver-env'), env }).loaded).toEqual([]);
    expect(env).toEqual({});
  });

  it('남이 읽을 수 있는 권한이면 읽지 않고 던진다', () => {
    const env = {};
    expect(() => loadNaverEnvFile({ path: fileWith('NAVER_CLIENT_ID=x', 0o644), env })).toThrow(/chmod 600/);
    expect(env).toEqual({});
  });
});

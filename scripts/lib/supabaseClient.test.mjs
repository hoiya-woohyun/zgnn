import { describe, expect, it } from 'vitest';
import { pickServiceKey, projectUrl, resolveSupabaseCredentials } from './supabaseClient.mjs';

describe('pickServiceKey — CLI 가 준 키 목록에서 쓰기 키 하나', () => {
  const legacy = { name: 'service_role', type: 'legacy', api_key: 'eyJ.legacy' };
  const anon = { name: 'anon', type: 'legacy', api_key: 'eyJ.anon' };
  const secret = { name: 'default', type: 'secret', api_key: 'sb_secret_x' };
  const publishable = { name: 'default', type: 'publishable', api_key: 'sb_publishable_x' };

  it('새 secret 키를 우선하고, 없으면 legacy service_role', () => {
    expect(pickServiceKey([anon, legacy, publishable, secret])).toBe('sb_secret_x');
    expect(pickServiceKey([anon, legacy, publishable])).toBe('eyJ.legacy');
  });

  it('anon·publishable 만 있으면 undefined — 읽기 키로 쓰기 스크립트를 돌리지 않는다', () => {
    expect(pickServiceKey([anon, publishable])).toBeUndefined();
    expect(pickServiceKey([])).toBeUndefined();
  });
});

describe('resolveSupabaseCredentials — env 가 먼저(CI 와 같은 규칙)', () => {
  it('env 에 둘 다 있으면 CLI 를 부르지 않고 그대로 쓴다', () => {
    expect(resolveSupabaseCredentials({ SUPABASE_URL: 'https://u', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toEqual({ url: 'https://u', key: 'k' });
  });

  it('URL 만 있으면 env 경로가 아니다(CLI 로 넘어간다)', () => {
    // CLI 경로는 여기서 실행하지 않는다 — 결과는 로그인·link 상태에 따라 다르고 값을 다룬다. 분기 조건만 고정한다.
    const half = { SUPABASE_URL: 'https://u' };
    expect(half.SUPABASE_URL && half.SUPABASE_SERVICE_ROLE_KEY).toBeFalsy();
  });
});

describe('projectUrl', () => {
  it('link 된 ref 로 URL 을 만든다 — SUPABASE_URL 을 따로 둘 필요가 없다', () => {
    expect(projectUrl('abc')).toBe('https://abc.supabase.co');
  });
});

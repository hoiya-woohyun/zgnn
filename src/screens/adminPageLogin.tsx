'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { writeAdminSession, type TAdminSession } from '../lib/adminSession';
import { signInAdmin } from '../lib/adminSupabase';
import { CARD_SURFACE } from '../components/cardSurface';

/**
 * 쓰기 버튼을 눌렀는데 세션이 이미 끝나 있었다 — 로그인 화면이 하는 말(14 W261010.28). "만료됐어요" 만으로는 방금 누른 `올리기` 가 올라갔는지 몰랐다(manager-68).
 * 이 말은 쓰기 **전**에 막은 자리(`adminPage` 의 `beginWrite`)에서만 쓴다 — 거기선 정말로 아무것도 안 바뀌었다.
 */
export const WRITE_BLOCKED_BY_EXPIRY = '로그인이 만료돼 방금 누른 것은 처리하지 않았어요 — 아무것도 바뀌지 않았어요. 다시 로그인한 뒤 그 줄을 찾아 다시 눌러 주세요.';

type TAdminPageLoginProps = {
  onSignedIn: (session: TAdminSession) => void;
  /** 세션이 만료돼 돌아온 경우의 안내. 처음 여는 화면에서는 없다. */
  notice?: string;
};

/**
 * 운영자 로그인. 이메일·비밀번호뿐인 이유는 회원가입이 꺼져 있고 SMTP 가 없어 매직링크를 보낼 수 없기 때문이다.
 * 저장까지 여기서 한다 — 성공했는데 저장이 막혀 조용히 로그아웃되는 상태를 만들지 않으려고, 저장이 던지면 그 문구를 그대로 보여 준다.
 */
export function AdminPageLogin({ onSignedIn, notice }: TAdminPageLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const session = await signInAdmin(email.trim(), password);
      writeAdminSession(session);
      setPassword('');
      onSignedIn(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인을 못 했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-6 md:px-6">
      <form
        className={`mx-auto max-w-sm ${CARD_SURFACE} p-5`}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-md font-bold text-primary">운영자 로그인</h2>
        {/* 만료돼 돌아온 안내는 회색 설명이 아니라 경고다 — 방금 누른 것이 안 됐다는 말이라 지나치면 올라간 줄 안다(14 W261010.28). */}
        {notice ? (
          <p role="status" className="mt-1 text-sm font-semibold text-warning-primary">
            {notice}
          </p>
        ) : (
          <p className="mt-1 text-sm text-tertiary">검수는 운영자 계정으로만 할 수 있어요. 로그인은 12시간 뒤 다시 필요해요.</p>
        )}

        <div className="mt-4 space-y-3">
          <Input
            label="이메일"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="operator@example.com"
            value={email}
            onChange={setEmail}
            isDisabled={busy}
            size="lg"
          />
          <Input
            label="비밀번호"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            isDisabled={busy}
            size="lg"
          />
        </div>

        {error && <p className="mt-3 text-sm text-error-primary">{error}</p>}

        <Button type="submit" color="primary" size="lg" className="mt-4 w-full" isDisabled={busy} isLoading={busy}>
          {busy ? '로그인하고 있어요…' : '로그인'}
        </Button>
      </form>
    </div>
  );
}

import { describe, expect, it } from 'vitest';
import { describeNaverError } from './naverApiError.mjs';

// **실측 본문을 못 박는다.** 2026-09-28 가짜 키로 openapi.naver.com 에 실제 호출해 받은 응답이다 —
// 문서 인용에서 흔히 보이는 "Not Exist Client ID" 가 아니라 괄호 숫자로 온다는 것이 이 파일의 존재 이유다.
const REAL_401 = { errorMessage: 'NID AUTH Result Invalid (1000) : Authentication failed. (인증에 실패했습니다.)', errorCode: '024' };

describe('describeNaverError', () => {
  it('실측 401 에서 내부코드 1000 의 뜻을 말한다', () => {
    const tail = describeNaverError(REAL_401);
    expect(tail).toContain('errorCode=024');
    expect(tail).toContain('이 Client ID 로 인증이 안 된다');
  });

  // errorCode 만으로는 인증 실패가 전부 024 라 갈래가 없다 — 갈라 주는 것은 괄호 숫자다.
  it('같은 errorCode 라도 내부코드가 다르면 다르게 말한다', () => {
    const other = describeNaverError({ errorMessage: 'NID AUTH Result Invalid (2000) : Authentication failed.', errorCode: '024' });
    expect(other).toContain('errorCode=024');
    expect(other).not.toBe(describeNaverError(REAL_401));
  });

  // 모르는 번호에 뜻을 지어내지 않는다 — 없는 진단을 있는 것처럼 말하는 것이 아무 말 안 하는 것보다 나쁘다.
  it('모르는 내부코드는 번호를 그대로 보여 주고 모른다고 말한다', () => {
    const tail = describeNaverError({ errorMessage: 'NID AUTH Result Invalid (2000) : Authentication failed.', errorCode: '024' });
    expect(tail).toContain('2000');
    expect(tail).toContain('아직 뜻을 모른다');
  });

  it('문구 갈래(보조)도 남아 있다 — API 미등록·한도 초과', () => {
    expect(describeNaverError({ errorMessage: 'Invalid API Service', errorCode: '101' })).toContain('사용 API');
    expect(describeNaverError({ errorMessage: 'Quota Exceeded', errorCode: '012' })).toContain('한도 초과');
  });

  it('errorMessage 원문은 어떤 경우에도 내보내지 않는다', () => {
    const tail = describeNaverError({ errorMessage: 'NID AUTH Result Invalid (1000) : secret-looking-value-12345', errorCode: '024' });
    expect(tail).not.toContain('secret-looking-value-12345');
    expect(tail).not.toContain('Authentication failed');
  });

  // 본문을 못 읽는 경우(HTML 오류 페이지·빈 본문·JSON 파싱 실패)에도 호출부가 그냥 이어 붙일 수 있어야 한다.
  it('읽을 것이 없으면 빈 문자열이라 그냥 이어 붙여도 된다', () => {
    expect(describeNaverError(null)).toBe('');
    expect(describeNaverError('<html>502</html>')).toBe('');
    expect(describeNaverError({})).toBe('');
  });

  it('errorCode 만 있어도, 라벨만 잡혀도 각각 말한다', () => {
    expect(describeNaverError({ errorCode: '024' })).toBe(' errorCode=024');
    expect(describeNaverError({ errorMessage: 'Quota Exceeded' })).toBe(' (호출 한도 초과)');
  });
});

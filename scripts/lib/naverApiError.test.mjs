import { describe, expect, it } from 'vitest';
import { describeKeyShape, describeNaverError } from './naverApiError.mjs';

// **실측 본문을 못 박는다.** 2026-09-28 가짜 키로 openapi.naver.com 에 실제 호출해 받은 응답이다 —
// 문서 인용에서 흔히 보이는 "Not Exist Client ID" 가 아니라 괄호 숫자로 온다는 것이 이 파일의 존재 이유다.
const REAL_401 = { errorMessage: 'NID AUTH Result Invalid (1000) : Authentication failed. (인증에 실패했습니다.)', errorCode: '024' };

describe('describeNaverError', () => {
  it('실측 401 에서 내부코드 1000 의 뜻을 말한다', () => {
    const tail = describeNaverError(REAL_401);
    expect(tail).toContain('errorCode=024');
    expect(tail).toContain('조합을 모른다');
  });

  // 401 의 세 갈래(2026-09-28 실측). 1000 을 "값이 안 갔다" 로 넓게 읽지 않게 못 박는다 —
  // 값이 비었거나 헤더가 없으면 애초에 다른 문구로 오므로, 1000 은 "둘 다 갔는데 거부" 로만 읽어야 한다.
  it('빈 값·헤더 누락은 1000 이 아니라 다른 문구로 온다', () => {
    expect(describeNaverError({ errorMessage: 'Not Exist Client ID : Authentication failed.', errorCode: '024' })).toContain('Client ID 가 없다');
    expect(describeNaverError({ errorMessage: 'Not Exist Client Secret : Authentication failed.', errorCode: '024' })).not.toContain('조합을 모른다');
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

describe('describeKeyShape', () => {
  it('길이와 글자 종류만 적고 값은 내보내지 않는다', () => {
    const out = describeKeyShape('AbCdEfGhIjKlMnOpQrSt', 'ABCDEFGHIJ');
    expect(out).toContain('ID: 20자');
    expect(out).toContain('Secret: 10자');
    expect(out).not.toContain('AbCdEfGhIjKlMnOpQrSt');
    expect(out).not.toContain('ABCDEFGHIJ');
  });

  // 숨김 입력 두 번을 연달아 받는 흐름에서 가장 흔한 실수다 — 눈으로 잡을 방법이 이것뿐이다.
  it('Secret 이 ID 보다 길면 뒤바꿔 입력했을 가능성을 말한다', () => {
    expect(describeKeyShape('ABCDEFGHIJ', 'AbCdEfGhIjKlMnOpQrSt')).toContain('뒤바꿔 입력');
    expect(describeKeyShape('AbCdEfGhIjKlMnOpQrSt', 'ABCDEFGHIJ')).not.toContain('뒤바꿔 입력');
  });

  it('값 가운데 공백은 붙여넣기가 잘린 신호로 짚는다', () => {
    expect(describeKeyShape('abc def', 'xyz')).toContain('공백');
  });

  it('빈 값·undefined 에도 터지지 않는다', () => {
    expect(describeKeyShape(undefined, null)).toContain('ID: 0자');
  });
});

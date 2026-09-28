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

// API HUB 는 오류를 error 로 감싼다. **번호 공간이 개발자센터와 겹치므로**(200/300 vs 024)
// 모양으로 갈라야 한다 — 아래 값들은 2026-09-28 실제 게이트웨이 응답이다.
describe('describeNaverError — API HUB 모양', () => {
  it('감싸인 401 을 개발자센터 코드로 오해하지 않는다', () => {
    const tail = describeNaverError({ error: { errorCode: '200', message: 'Authentication Failed', details: 'Authentication information are missing.' } });
    expect(tail).toContain('apiHubCode=200');
    expect(tail).not.toContain('errorCode=200'); // 개발자센터 표기와 섞이면 안 된다
    expect(tail).toContain('인증 정보가 아예 안 갔다');
  });

  it('404 는 키가 아니라 우리 엔드포인트 문제라고 말한다', () => {
    const tail = describeNaverError({ error: { errorCode: '300', message: 'Not Found Exception', details: 'URL not found.' } });
    expect(tail).toContain('apiHubCode=300');
    expect(tail).toContain('엔드포인트');
  });

  it('값은 갔는데 거부된 경우와 아예 안 간 경우를 가른다', () => {
    const missing = describeNaverError({ error: { errorCode: '200', details: 'Authentication information are missing.' } });
    const rejected = describeNaverError({ error: { errorCode: '200', details: 'Authentication Failed' } });
    expect(missing).not.toBe(rejected);
    expect(rejected).toContain('이 API 가 추가돼 있지 않다');
  });

  it("'Invalid authentication information.' 은 '값이 갔는데 거부됐다' 로 읽는다(2026-09-28 실측 오라클)", () => {
    const tail = describeNaverError({ error: { errorCode: '200', details: 'Invalid authentication information.' } });
    expect(tail).toContain('게이트웨이가 이 쌍을 거부했다');
    expect(tail).toContain('검색↔지도');
    // 헤더 누락과 섞이면 안 된다 — 이 둘이 갈리는 것이 진단의 절반이다.
    expect(tail).not.toContain('아예 안 갔다');
  });

  it('라벨이 특정 API 를 지목하지 않는다 — 검색과 지도가 같은 게이트웨이를 지난다', () => {
    const tail = describeNaverError({ error: { errorCode: '200', details: '' } });
    expect(tail).not.toContain('「검색」');
  });

  it('콘솔에서 API 를 체크하지 않았을 때의 번호(210·400)에 뜻이 있다', () => {
    expect(describeNaverError({ error: { errorCode: '210' } })).toContain('권한 없음');
    expect(describeNaverError({ error: { errorCode: '400' } })).toContain('한도');
    expect(describeNaverError({ error: { errorCode: '900' } })).toContain('게이트웨이 내부 오류');
  });

  it('🔴 벤더가 준 errorCode 는 숫자가 아니면 내보내지 않는다 — 프로토타입 키가 함수 소스를 끌고 나왔다', () => {
    for (const bad of ['constructor', 'toString', '<script>alert(1)</script>', '__proto__']) {
      const tail = describeNaverError({ error: { errorCode: bad, details: '' } });
      expect(tail, bad).not.toContain(bad);
      expect(tail, bad).not.toContain('native code');
    }
  });

  it("🔴 'Invalid authentication information. Client ID does not exist.' 는 'not exist' 를 품어도 거부 쪽이다", () => {
    // 느슨한 missing 을 먼저 보면 오라클이 거꾸로 붙는다 — BUG-006 이 세 판을 들여 세운 구분이다.
    const tail = describeNaverError({ error: { errorCode: '200', details: 'Invalid authentication information. Client ID does not exist.' } });
    expect(tail).toContain('게이트웨이가 이 쌍을 거부했다');
    expect(tail).not.toContain('아예 안 갔다');
  });

  it('모르는 API HUB 코드는 뜻을 지어내지 않는다', () => {
    expect(describeNaverError({ error: { errorCode: '999' } })).toContain('아직 뜻을 모른다');
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

  // 길이 대소로 뒤바뀜을 **단정하지 않는다** — 그 전제(ID 가 더 길다)는 개발자센터 키의 것이었고
  // 우리는 API HUB 로 옮겼다. 반대였다면 맞게 넣을 때마다 경고가 떠 사람을 엉뚱한 데로 보낸다.
  it('길이 대소로 뒤바뀜을 단정하지 않고 콘솔과 대조하게 한다', () => {
    const shortIdLongSecret = describeKeyShape('ABCDEFGHIJ', 'AbCdEfGhIjKlMnOpQrSt');
    expect(shortIdLongSecret).toContain('ID: 10자');
    expect(shortIdLongSecret).toContain('Secret: 20자');
    expect(shortIdLongSecret).toContain('콘솔');
    expect(shortIdLongSecret).not.toMatch(/Secret 이 ID 보다 길다/);
  });

  it('값 가운데 공백은 붙여넣기가 잘린 신호로 짚는다', () => {
    expect(describeKeyShape('abc def', 'xyz')).toContain('공백');
  });

  it('빈 값·undefined 에도 터지지 않는다', () => {
    expect(describeKeyShape(undefined, null)).toContain('ID: 0자');
  });
});

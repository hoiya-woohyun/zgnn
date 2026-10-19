import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminOpsPageAlerts } from './adminOpsPageAlerts';

describe('AdminOpsPageAlerts', () => {
  it('꺼진 문구 본문에는 태스크 번호·Vault 키 이름이 없고 접힌 상세에만 있다', () => {
    const html = renderToStaticMarkup(<AdminOpsPageAlerts slackConfigured={false} />);
    const [body, detail] = html.split('<details');
    expect(body).toContain('Slack 알림이 꺼져 있어요');
    expect(body).not.toMatch(/T5|Vault|slack_webhook_url|todo\/15/);
    expect(detail).toContain('원래 값 보기');
    expect(detail).toContain('slack_webhook_url');
    expect(detail).toContain('T5');
  });

  it('켜져 있으면 접힌 상세가 없다', () => {
    const html = renderToStaticMarkup(<AdminOpsPageAlerts slackConfigured />);
    expect(html).toContain('Slack 웹훅 있음');
    expect(html).not.toContain('<details');
  });
});

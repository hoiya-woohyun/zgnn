// 감도 census — 같은 자로 모든 화면을 잰다(docs/reviews/design-audit/<날짜>-tone-references.md 의 자). 사진(img·background-image)은 셈에서 뺀다(제약 6).
// 사용: RUN=/tmp/design-audit/<날짜>-tone node 스크립트.mjs — 스크립트에서 import { open, census, shot, brief } from '<레포>/.claude/skills/design-audit/toneCensus.mjs'
import { chromium, devices } from '/tmp/ux-eval/node_modules/playwright/index.mjs';
import fs from 'node:fs';

export const RUN = process.env.RUN ?? '/tmp/design-audit/tone';

export async function open() {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, locale: 'ko-KR', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

export async function shot(page, app, name) {
  const path = `${RUN}/shots/${app}-${name}.png`;
  await page.screenshot({ path });
  return path;
}

// 화면 하나(지금 뷰포트 + 아래로 screens 장)를 잰다. 결과는 RUN/census/<app>-<name>.json 에도 남긴다.
export async function census(page, app, name, { screens = 2 } = {}) {
  const data = await page.evaluate((screens) => {
    const vh = innerHeight, vw = innerWidth, maxY = vh * screens;
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
    const sat = (c) => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return mx === 0 ? 0 : (mx - mn) / mx; };
    const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
    const top = (o, n = 12) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
    const isPhoto = (el, cs) => el.tagName === 'IMG' || el.tagName === 'PICTURE' || el.tagName === 'VIDEO' || /url\(/.test(cs.backgroundImage);
    const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
    const role = (el) => {
      const t = el.tagName.toLowerCase(), r = el.getAttribute('role');
      if (t === 'input' || t === 'textarea' || t === 'select') return 'input';
      if (t === 'button' || r === 'button' || r === 'tab') return 'button';
      if (t === 'a') return 'link';
      return 'box';
    };

    const fontSize = {}, fontWeight = {}, letterSpacing = {}, lineHeight = {}, fontFamily = {}, textColor = {}, grayText = {};
    const bgColor = {}, radiusByRole = { button: {}, link: {}, input: {}, box: {}, photo: {} };
    let bordered = 0, shadowed = 0, borderAndShadow = 0, surfaces = 0, textEls = 0;
    const brand = {}; // 채도 높은 색 → 어디에 쓰였나
    const leftX = {}, transitions = {}, samples = [];
    const fixed = [];

    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > maxY || r.right < 0 || r.left > vw) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;

      if ((cs.position === 'fixed' || cs.position === 'sticky') && r.width > vw * 0.8 && r.height < vh * 0.3) {
        fixed.push({ pos: cs.position, top: Math.round(r.top), h: Math.round(r.height), bg: cs.backgroundColor, backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '', borderTop: cs.borderTopWidth + ' ' + cs.borderTopColor, borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomColor, shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 50) });
      }

      const photo = isPhoto(el, cs);
      const rad = cs.borderTopLeftRadius;
      if (photo) { inc(radiusByRole.photo, rad); continue; }

      const bg = parse(cs.backgroundColor);
      const hasBg = bg && bg.a > 0.05;
      const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const bc = parse(cs.borderTopColor) || parse(cs.borderBottomColor);
      const hasBorder = bw > 0 && cs.borderTopStyle !== 'none' && bc && bc.a > 0.05;
      const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
      if (hasBg || hasBorder || hasShadow) {
        surfaces++;
        if (r.width < vw * 0.98) inc(radiusByRole[role(el)], rad); // 화면 폭 면(배경 띠)은 반경 셈에서 뺀다
        if (hasBorder) bordered++;
        if (hasShadow) shadowed++;
        if (hasBorder && hasShadow) borderAndShadow++;
        if (hasBg) inc(bgColor, hex(bg) + (bg.a < 1 ? `@${bg.a.toFixed(2)}` : ''));
        if (hasBg && sat(bg) > 0.35) { const k = hex(bg); brand[k] ??= { asBg: 0, asText: 0, where: [] }; brand[k].asBg++; if (brand[k].where.length < 6) brand[k].where.push(`bg:${el.tagName.toLowerCase()}:${(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 16)}`); }
      }
      if (cs.transitionDuration && cs.transitionDuration !== '0s') inc(transitions, `${cs.transitionProperty.slice(0, 30)} ${cs.transitionDuration} ${cs.transitionTimingFunction}`);

      const txt = ownText(el);
      if (!txt) continue;
      textEls++;
      inc(fontSize, cs.fontSize); inc(fontWeight, cs.fontWeight);
      inc(letterSpacing, cs.letterSpacing === 'normal' ? 'normal' : (parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize)).toFixed(3) + 'em');
      inc(lineHeight, cs.lineHeight === 'normal' ? 'normal' : (parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)).toFixed(2));
      inc(fontFamily, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
      const c = parse(cs.color);
      if (c) {
        inc(textColor, hex(c) + (c.a < 1 ? `@${c.a.toFixed(2)}` : ''));
        if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 32) inc(grayText, hex(c) + (c.a < 1 ? `@${c.a.toFixed(2)}` : ''));
        if (sat(c) > 0.35) { const k = hex(c); brand[k] ??= { asBg: 0, asText: 0, where: [] }; brand[k].asText++; if (brand[k].where.length < 6) brand[k].where.push(`text:${el.tagName.toLowerCase()}:${txt.slice(0, 16)}`); }
      }
      if (r.left >= 0 && r.left < vw / 3) inc(leftX, Math.round(r.left));
      if (samples.length < 40 && txt.length <= 30) samples.push(`${cs.fontSize}/${cs.fontWeight} ${txt}`);
    }
    const brandTop = Object.entries(brand).sort((a, b) => (b[1].asBg + b[1].asText) - (a[1].asBg + a[1].asText)).slice(0, 4);
    return {
      url: location.href, vw, screens, textEls, surfaces,
      fontFamily: top(fontFamily, 4), fontSize: top(fontSize, 14), fontWeight: top(fontWeight, 6),
      letterSpacing: top(letterSpacing, 6), lineHeight: top(lineHeight, 6),
      textColorTop: top(textColor, 8), grayTextSteps: Object.keys(grayText).length, grayText: top(grayText, 8),
      bgColorTop: top(bgColor, 8), pageBg: getComputedStyle(document.body).backgroundColor, htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      radius: Object.fromEntries(Object.entries(radiusByRole).map(([k, v]) => [k, top(v, 6)])),
      bordered, shadowed, borderAndShadow,
      brand: brandTop, gutterLeft: top(leftX, 4), transitions: top(transitions, 6), fixed: fixed.slice(0, 6), samples,
    };
  }, screens);
  fs.mkdirSync(`${RUN}/shots`, { recursive: true });
  fs.mkdirSync(`${RUN}/census`, { recursive: true });
  fs.writeFileSync(`${RUN}/census/${app}-${name}.json`, JSON.stringify(data, null, 1));
  return data;
}

// 사람이 읽을 한 줄 요약
export function brief(d) {
  const f = (a) => a.map(([k, v]) => `${k}×${v}`).join(' ');
  return [
    `font ${f(d.fontFamily)}`,
    `size ${f(d.fontSize)}`,
    `weight ${f(d.fontWeight)}`,
    `ls ${f(d.letterSpacing)} · lh ${f(d.lineHeight)}`,
    `text colors ${f(d.textColorTop)}`,
    `gray steps ${d.grayTextSteps}: ${f(d.grayText)}`,
    `bg page ${d.pageBg} · ${f(d.bgColorTop)}`,
    `radius btn ${f(d.radius.button)} | link ${f(d.radius.link)} | input ${f(d.radius.input)} | box ${f(d.radius.box)} | photo ${f(d.radius.photo)}`,
    `surfaces ${d.surfaces} · bordered ${d.bordered} · shadowed ${d.shadowed} · both ${d.borderAndShadow} · textEls ${d.textEls}`,
    `brand ${d.brand.map(([k, v]) => `${k}(bg${v.asBg}/txt${v.asText}: ${v.where.slice(0, 3).join(' | ')})`).join(' ; ')}`,
    `gutterL ${f(d.gutterLeft)} · fixed ${d.fixed.map((x) => `${x.pos}@${x.top} h${x.h} bg${x.bg} bd${x.backdrop}`).join(' ; ')}`,
    `transitions ${f(d.transitions)}`,
  ].join('\n');
}

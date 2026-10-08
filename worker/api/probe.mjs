// 실측용 — Vercel 함수 안에서 `claude -p` 가 뜨는지만 본다(ADR-028 초안 전 단계). 본 워커가 아니다.
// 접근은 Vercel Deployment Protection(프리뷰)에 맡기고 `vercel curl` 로만 부른다 — 코드에 인증이 없다.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// 플랫폼 패키지의 바이너리를 먼저 본다 — 래퍼의 bin/claude.exe 는 postinstall 이 채우는데, 빌드 머신과 런타임이 같아야 맞는다.
function findBinary() {
  const tried = [];
  for (const pkg of ['@anthropic-ai/claude-code-linux-x64', '@anthropic-ai/claude-code']) {
    let dir;
    try {
      dir = dirname(require.resolve(`${pkg}/package.json`));
    } catch {
      tried.push(`${pkg}: 없음`);
      continue;
    }
    for (const name of ['claude', 'bin/claude.exe', 'bin/claude', 'cli.js']) {
      const p = join(dir, name);
      if (existsSync(p) && statSync(p).size > 1_000_000) return { bin: p, tried };
      tried.push(`${p}: ${existsSync(p) ? `${statSync(p).size}B` : '없음'}`);
    }
    tried.push(`${pkg} 목록: ${readdirSync(dir).join(',')}`);
  }
  return { bin: null, tried };
}

function run(bin, args, input, env, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ms: Date.now() - started, error: e.message }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ ms: Date.now() - started, code, signal, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 600) });
    });
    child.stdin.end(input);
  });
}

// 값은 내보내지 않는다 — 길이·공개 접두어 일치·공백 유무만(붙여넣기 사고 진단).
function shapeOf(t) {
  if (!t) return null;
  return { length: t.length, oatPrefix: t.startsWith('sk-ant-oat01-'), whitespace: /\s/.test(t), trimmedLength: t.trim().length };
}

export async function GET() {
  const home = '/tmp/claude-home';
  mkdirSync(home, { recursive: true });
  const { bin, tried } = findBinary();
  const out = { node: process.version, arch: process.arch, hasToken: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN), tokenShape: shapeOf(process.env.CLAUDE_CODE_OAUTH_TOKEN), bin, tried };
  if (bin) {
    // 분석과 같은 고립 플래그(extractPlaces.buildCliArgs) — 도구·MCP·설정·세션 저장 없음.
    const env = { PATH: process.env.PATH, HOME: home, TMPDIR: '/tmp', CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN };
    out.version = await run(bin, ['--version'], '', env, 30_000);
    if (out.hasToken) {
      out.prompt = await run(bin, [
        '-p', '--output-format', 'json', '--model', 'haiku', '--tools', '',
        '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands',
      ], '한 단어로만 답해: 제주의 섬 이름은?', env, 120_000);
    }
  }
  return Response.json(out);
}

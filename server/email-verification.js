import { createHash } from 'node:crypto';

export const VERIFY_COOKIE = 'river_oaks_verify_state';

const css = `
  :root { color-scheme: dark; font-family: system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { min-height: 100vh; min-height: 100dvh; margin: 0; display: grid; place-items: center; padding: 24px; background: #172922; color: #f2eee4; }
  main { width: min(100%, 448px); padding: clamp(28px, 6vw, 48px); border: 1px solid #aebfae; border-radius: 20px; background: #273e32; box-shadow: 0 24px 80px #0c1c15aa; }
  .kicker { margin: 0; color: #b9d5b5; font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
  .rule { width: 42px; height: 2px; margin: 24px 0; background: #e8ba63; }
  h1 { margin: 0 0 16px; font: 600 clamp(32px, 7vw, 46px)/1.1 Georgia, serif; letter-spacing: -.025em; }
  .intro { margin: 0 0 28px; color: #d4dfd3; line-height: 1.6; }
  label { display: block; margin-bottom: 9px; font-size: 14px; font-weight: 600; }
  input { display: block; width: 100%; min-height: 52px; padding: 10px 14px; border: 1px solid #aebfae; border-radius: 10px; background: #f7f8f3; color: #172922; font: 600 24px/1 system-ui, sans-serif; letter-spacing: .24em; font-variant-numeric: tabular-nums; }
  input::placeholder { color: #76877a; }
  button { display: block; width: 100%; min-height: 48px; margin-top: 16px; padding: 10px 16px; border: 1px solid #d7e5d0; border-radius: 10px; background: #e7eadb; color: #172922; font: 600 16px/1.25 system-ui, sans-serif; cursor: pointer; }
  button:hover { background: #fff6de; }
  a { color: #d7e5d0; text-underline-offset: 3px; }
  :is(input, button, a):focus-visible { outline: 3px solid #e8ba63; outline-offset: 3px; }
  .notice { margin: 0 0 20px; padding: 11px 13px; border-left: 3px solid #e8ba63; background: #314b3e; line-height: 1.5; }
  .return { margin: 24px 0 0; text-align: center; font-size: 14px; }
`;
const styleHash = createHash('sha256').update(css).digest('base64');
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function verificationPage(res, message = null) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'sha256-${styleHash}'; form-action 'self'; base-uri 'none'`,
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#172922"><title>Verify your email · River Oaks District</title><style>${css}</style></head><body><main><p class="kicker">River Oaks District</p><div class="rule" aria-hidden="true"></div><h1>Check your inbox</h1><p class="intro">To finish signing in with GitHub, enter the six-digit code sent to your email.</p>${message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : ''}<form method="post" action="/auth/verify"><label for="code">Verification code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required autofocus><button type="submit">Verify and continue</button></form><p class="return"><a href="/">Start over</a></p></main></body></html>`);
}

export async function readVerificationCode(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') return null;
  let size = 0; const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 128) return null;
      chunks.push(chunk);
    }
    const code = new URLSearchParams(Buffer.concat(chunks).toString()).get('code');
    return /^[0-9]{6}$/.test(code ?? '') ? code : null;
  } catch { return null; }
}

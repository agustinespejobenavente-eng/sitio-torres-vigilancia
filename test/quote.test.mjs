import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createQuoteHandler, validate, buildEmail } from '../lib/quote.mjs';
import { createServer } from '../server.mjs';

const good = {
  nombre: 'Ana Pérez', empresa: 'Forestal Ejemplo', correo: 'ana@ejemplo.cl', telefono: '+56 9 1234 5678',
  tipo: 'torre-vigilancia', region: 'Biobío', mensaje: 'Necesitamos una torre de vigilancia para un predio.', consentimiento: 'si',
};
const silent = { warn() {}, error() {} };

// A local stand-in for the mail provider, recording what it receives.
let provider, providerUrl, received, providerStatus;
before(async () => {
  provider = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(providerStatus, { 'Content-Type': 'application/json' });
      res.end('{"id":"test"}');
    });
  });
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  providerUrl = `http://127.0.0.1:${provider.address().port}`;
});
after(() => provider.close());

const configured = () => ({ RESEND_API_KEY: 'key_test', QUOTE_TO: 'ventas@ejemplo.cl', QUOTE_FROM: 'Sitio <web@ejemplo.cl>', RESEND_API_URL: providerUrl });
const fresh = () => { received = []; providerStatus = 200; };

test('validate accepts a complete request and rejects each missing part', () => {
  assert.equal(validate(good).ok, true);
  for (const k of ['nombre', 'empresa', 'correo', 'tipo', 'region', 'mensaje', 'consentimiento']) {
    const r = validate({ ...good, [k]: '' });
    assert.equal(r.ok, false, k);
    assert.ok(r.errors[k], k);
  }
  assert.ok(validate({ ...good, correo: 'sin-arroba' }).errors.correo);
  assert.ok(validate({ ...good, tipo: 'inventado' }).errors.tipo);
  assert.ok(validate({ ...good, region: 'Narnia' }).errors.region);
  assert.ok(validate({ ...good, telefono: '123' }).errors.telefono);
  assert.equal(validate(null).ok, false);
});

test('single-line fields lose control characters, long text is capped', () => {
  const r = validate({ ...good, nombre: 'Ana\r\nBcc: x@y.cl', mensaje: 'x'.repeat(9000) });
  assert.ok(!/[\r\n]/.test(r.values.nombre));
  assert.equal(r.values.mensaje.length, 3000);
});

test('email body escapes HTML and the subject has no line breaks', () => {
  const m = buildEmail({ ...good, nombre: '<script>alert(1)</script>', mensaje: 'a & b <b>' });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(!/[\r\n]/.test(m.subject));
});

test('unconfigured mail answers 503 and sends nothing', async () => {
  fresh();
  const h = createQuoteHandler({ env: {}, log: silent });
  const r = await h({ method: 'POST', headers: {}, ip: '1.1.1.1', body: good });
  assert.equal(r.status, 503);
  assert.equal(r.body.ok, false);
  assert.equal(received.length, 0);
});

test('a valid request is delivered through the provider and answers 200 only then', async () => {
  fresh();
  const h = createQuoteHandler({ env: configured(), log: silent });
  const r = await h({ method: 'POST', headers: {}, ip: '2.2.2.2', body: good });
  assert.equal(r.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/emails');
  assert.equal(received[0].auth, 'Bearer key_test');
  assert.deepEqual(received[0].body.to, ['ventas@ejemplo.cl']);
  assert.equal(received[0].body.reply_to, 'ana@ejemplo.cl');
  assert.match(received[0].body.text, /Torre de vigilancia forestal/);
});

test('provider failure becomes 502, never a success', async () => {
  fresh();
  providerStatus = 500;
  const h = createQuoteHandler({ env: configured(), log: silent });
  const r = await h({ method: 'POST', headers: {}, ip: '3.3.3.3', body: good });
  assert.equal(r.status, 502);
  assert.equal(r.body.ok, false);
});

test('an unreachable provider becomes 502', async () => {
  fresh();
  const h = createQuoteHandler({ env: { ...configured(), RESEND_API_URL: 'http://127.0.0.1:9' }, log: silent });
  const r = await h({ method: 'POST', headers: {}, ip: '4.4.4.4', body: good });
  assert.equal(r.status, 502);
});

test('invalid input answers 400 with field errors and sends nothing', async () => {
  fresh();
  const h = createQuoteHandler({ env: configured(), log: silent });
  const r = await h({ method: 'POST', headers: {}, ip: '5.5.5.5', body: { ...good, correo: 'x' } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.correo);
  assert.equal(received.length, 0);
});

test('the honeypot drops the request without sending', async () => {
  fresh();
  const h = createQuoteHandler({ env: configured(), log: silent });
  const r = await h({ method: 'POST', headers: {}, ip: '6.6.6.6', body: { ...good, sitio_web: 'http://spam.example' } });
  assert.equal(r.status, 200);
  assert.equal(received.length, 0);
});

test('the sixth request from one address in the window is limited', async () => {
  fresh();
  const h = createQuoteHandler({ env: configured(), log: silent });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await h({ method: 'POST', headers: {}, ip: '7.7.7.7', body: good })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal(received.length, 5);
});

test('a foreign Origin is refused, the site\'s own is accepted, other methods are 405', async () => {
  fresh();
  const h = createQuoteHandler({ env: configured(), log: silent });
  assert.equal((await h({ method: 'POST', headers: { origin: 'https://evil.example', host: 'sitio.cl' }, ip: '8.8.8.8', body: good })).status, 403);
  assert.equal((await h({ method: 'POST', headers: { origin: 'https://sitio.cl', host: 'sitio.cl' }, ip: '8.8.8.9', body: good })).status, 200);
  assert.equal((await h({ method: 'GET', headers: {}, ip: '8.8.8.8' })).status, 405);
});

// The whole stack: the real server, a real HTTP request, the provider stand-in behind it.
test('server: static files, security headers, 404 and path traversal', async () => {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await home.text(), /<h1[^>]*>Torres de vigilancia forestal<\/h1>/);
    const css = await fetch(`${base}/css/style.css`);
    assert.equal(css.status, 200);
    const missing = await fetch(`${base}/no-existe`);
    assert.equal(missing.status, 404);
    const trav = await fetch(`${base}/..%2Fserver.mjs`);
    assert.ok([400, 403, 404].includes(trav.status));
    assert.ok(!(await trav.text()).includes('createQuoteHandler'));
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  } finally { srv.close(); }
});

test('server: /api/quote end to end, JSON, form post and oversize body', async () => {
  fresh();
  Object.assign(process.env, configured());
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const ok = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(good) });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
    assert.equal(received.length, 1);

    const bad = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...good, nombre: '' }) });
    assert.equal(bad.status, 400);

    const page = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body: new URLSearchParams(good).toString() });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Solicitud recibida/);
    assert.equal(received.length, 2);

    const big = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...good, mensaje: 'x'.repeat(40000) }) }).catch((e) => e);
    assert.ok(big instanceof Error || big.status === 413);

    const wrongType = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hola' });
    assert.equal(wrongType.status, 415);

    const get = await fetch(`${base}/api/quote`);
    assert.equal(get.status, 405);
  } finally {
    srv.close();
    for (const k of Object.keys(configured())) delete process.env[k];
  }
});

// Static file server for ./site plus POST /api/quote. No dependencies.
// Run: node server.mjs   (PORT, HOST, TRUST_PROXY and the mail variables in .env.example)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createQuoteHandler, resultPage } from './lib/quote.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ROOT, 'site');

// Minimal .env loader so a plain `node server.mjs` works on a VPS. Real environment wins.
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
  '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4',
};
const TEXTY = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt']);

const SECURITY = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: https://upload.wikimedia.org",
    "connect-src 'self'", "form-action 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const handleQuote = createQuoteHandler();
const gzipCache = new Map();

function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}

function readBody(req, max = 20 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(raw, type) {
  if (!raw) return {};
  if (type.includes('application/json')) return JSON.parse(raw);
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  throw Object.assign(new Error('unsupported'), { code: 415 });
}

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}
const json = (res, status, obj, extra = {}) => send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }, JSON.stringify(obj));

async function serveApi(req, res) {
  const type = String(req.headers['content-type'] || '');
  let body;
  try {
    body = parseBody(await readBody(req), type);
  } catch (err) {
    const code = err.code === 413 || err.code === 415 ? err.code : 400;
    return json(res, code, { ok: false, code: code === 413 ? 'too_large' : code === 415 ? 'unsupported' : 'bad_request' });
  }
  const result = await handleQuote({ method: req.method, headers: req.headers, ip: clientIp(req), body });
  const wantsHtml = !type.includes('application/json') && String(req.headers.accept || '').includes('text/html');
  if (wantsHtml) return send(res, result.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(result.headers || {}) }, resultPage(result));
  return json(res, result.status, result.body, result.headers);
}

async function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, {}, 'Bad request'); }
  if (rel.includes('\0')) return send(res, 400, {}, 'Bad request');
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(SITE, path.normalize(rel));
  if (file !== SITE && !file.startsWith(SITE + path.sep)) return send(res, 403, {}, 'Forbidden');
  let st = await stat(file).catch(() => null);
  if (st && st.isDirectory()) { file = path.join(file, 'index.html'); st = await stat(file).catch(() => null); }
  let status = 200;
  if (!st) {
    file = path.join(SITE, '404.html');
    st = await stat(file).catch(() => null);
    status = 404;
    if (!st) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'No encontrado');
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type, ETag: etag, 'Last-Modified': st.mtime.toUTCString(), Vary: 'Accept-Encoding',
    // No hashed filenames, so every file revalidates by ETag: a deploy is live at once and a 304 is cheap.
    'Cache-Control': 'no-cache',
  };
  if (status === 200 && req.headers['if-none-match'] === etag) return send(res, 304, headers, '');
  if (req.method === 'HEAD') return send(res, status, headers, '');
  let data = await readFile(file);
  if (TEXTY.has(ext) && String(req.headers['accept-encoding'] || '').includes('gzip')) {
    const hit = gzipCache.get(file);
    if (hit && hit.etag === etag) data = hit.data;
    else { data = zlib.gzipSync(data, { level: 9 }); gzipCache.set(file, { etag, data }); }
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = data.length;
  send(res, status, headers, data);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      if (url.pathname === '/api/quote') return await serveApi(req, res);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed');
      await serveStatic(req, res, url);
    } catch (err) {
      console.error('server error', err && err.message);
      if (!res.headersSent) send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Error interno');
      else res.end();
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => console.log(`listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}

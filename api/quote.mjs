// Vercel serverless adapter for the same handler server.mjs uses. Not needed on a Node host.
import { createQuoteHandler, resultPage } from '../lib/quote.mjs';

const handle = createQuoteHandler();

export default async function quote(req, res) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const type = String(req.headers['content-type'] || '');
  const result = await handle({ method: req.method, headers: req.headers, ip: fwd || req.socket?.remoteAddress || 'unknown', body: req.body });
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
  const wantsHtml = !type.includes('application/json') && String(req.headers.accept || '').includes('text/html');
  if (wantsHtml) { res.status(result.status).setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(resultPage(result)); return; }
  res.status(result.status).json(result.body);
}

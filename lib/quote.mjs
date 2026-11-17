// Quote request handling. No dependencies: validation, abuse limits and delivery through
// a transactional email API (Resend) using fetch. Pure functions plus one factory so it can
// run behind server.mjs, a serverless function, or a test with a mock provider.

export const TIPOS = {
  'torre-vigilancia': 'Torre de vigilancia forestal',
  'estructura-industrial': 'Estructura metálica industrial',
  soldadura: 'Soldadura y armado',
  montaje: 'Montaje e instalación',
  otro: 'Otro proyecto',
};

export const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso',
  'Metropolitana de Santiago', 'O’Higgins', 'Maule', 'Ñuble', 'Biobío', 'La Araucanía',
  'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
// Single-line fields never keep control characters (blocks header and log injection).
const oneLine = (v, max) => clean(v, max).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

export function validate(input) {
  const b = input && typeof input === 'object' ? input : {};
  const values = {
    nombre: oneLine(b.nombre, 120),
    empresa: oneLine(b.empresa, 160),
    correo: oneLine(b.correo, 160),
    telefono: oneLine(b.telefono, 40),
    tipo: oneLine(b.tipo, 40),
    region: oneLine(b.region, 60),
    mensaje: clean(b.mensaje, 3000),
    consentimiento: b.consentimiento === 'si' || b.consentimiento === true || b.consentimiento === 'on',
  };
  const errors = {};
  if (values.nombre.length < 2) errors.nombre = 'Escriba su nombre.';
  if (values.empresa.length < 2) errors.empresa = 'Escriba el nombre de su empresa.';
  if (!EMAIL_RE.test(values.correo)) errors.correo = 'Escriba un correo completo, por ejemplo nombre@empresa.cl.';
  if (values.telefono && values.telefono.replace(/\D/g, '').length < 8) errors.telefono = 'Escriba el teléfono con su código de área.';
  if (!Object.hasOwn(TIPOS, values.tipo)) errors.tipo = 'Seleccione el tipo de estructura.';
  if (!REGIONES.includes(values.region)) errors.region = 'Seleccione la región del proyecto.';
  if (values.mensaje.length < 10) errors.mensaje = 'Cuéntenos en al menos una frase qué necesita.';
  if (!values.consentimiento) errors.consentimiento = 'Debe aceptar para que podamos responderle.';
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildEmail(v) {
  const tipo = TIPOS[v.tipo];
  const rows = [
    ['Nombre', v.nombre], ['Empresa', v.empresa], ['Correo', v.correo], ['Teléfono', v.telefono || 'No indicado'],
    ['Tipo de estructura', tipo], ['Región del proyecto', v.region],
  ];
  const text = `${rows.map(([k, x]) => `${k}: ${x}`).join('\n')}\n\nMensaje:\n${v.mensaje}\n`;
  const html = `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">${rows
    .map(([k, x]) => `<tr><th align="left">${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table>`
    + `<p style="font-family:sans-serif;white-space:pre-wrap"><strong>Mensaje</strong><br>${esc(v.mensaje)}</p>`;
  const subject = `Solicitud de cotización: ${tipo}, ${v.region}`.replace(/[\r\n]+/g, ' ');
  return { subject, text, html };
}

export function createQuoteHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const hits = new Map();
  const limit = Number(env.RATE_LIMIT_MAX) || 5;
  const windowMs = (Number(env.RATE_LIMIT_WINDOW_MIN) || 10) * 60 * 1000;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

  const limited = (ip) => {
    const t = now();
    const recent = (hits.get(ip) || []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) { hits.set(ip, recent); return true; }
    recent.push(t);
    hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, arr] of hits) if (!arr.some((x) => t - x < windowMs)) hits.delete(k);
    return false;
  };

  const originOk = (headers) => {
    const origin = headers.origin;
    if (!origin) return true; // non-browser or privacy-stripped: the rate limit and honeypot still apply
    if (allowed.length) return allowed.includes(origin);
    try { return new URL(origin).host === headers.host; } catch { return false; }
  };

  return async function handle({ method, headers = {}, ip = 'unknown', body }) {
    if (method !== 'POST') return { status: 405, headers: { Allow: 'POST' }, body: { ok: false, code: 'method_not_allowed' } };
    if (!originOk(headers)) return { status: 403, body: { ok: false, code: 'origin' } };

    const { values, errors, ok } = validate(body);
    // A filled honeypot is a bot. It gets the same reply as a person, and nothing is sent.
    if (body && typeof body.sitio_web === 'string' && body.sitio_web.trim() !== '') {
      log.warn?.('quote: honeypot filled, dropped');
      return { status: 200, body: { ok: true } };
    }
    if (!ok) return { status: 400, body: { ok: false, code: 'invalid', errors } };
    if (limited(ip)) return { status: 429, body: { ok: false, code: 'rate_limited' } };

    const { RESEND_API_KEY, QUOTE_TO, QUOTE_FROM } = env;
    if (!RESEND_API_KEY || !QUOTE_TO || !QUOTE_FROM) {
      log.error?.('quote: mail delivery is not configured (RESEND_API_KEY, QUOTE_TO, QUOTE_FROM)');
      return { status: 503, body: { ok: false, code: 'not_configured' } };
    }

    const mail = buildEmail(values);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetchImpl(`${env.RESEND_API_URL || 'https://api.resend.com'}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: QUOTE_FROM,
          to: QUOTE_TO.split(',').map((s) => s.trim()).filter(Boolean),
          reply_to: values.correo,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        log.error?.(`quote: provider answered ${res.status}`);
        return { status: 502, body: { ok: false, code: 'delivery_failed' } };
      }
      return { status: 200, body: { ok: true } };
    } catch (err) {
      log.error?.(`quote: delivery error ${err && err.name}`);
      return { status: 502, body: { ok: false, code: 'delivery_failed' } };
    } finally {
      clearTimeout(timer);
    }
  };
}

// Reply for a browser that posted the form without JavaScript.
export function resultPage(result) {
  const ok = result.body.ok;
  const msg = ok
    ? 'Recibimos su solicitud. Le responderemos al correo que indicó.'
    : result.status === 400
      ? `Revise estos campos: ${Object.values(result.body.errors || {}).join(' ')}`
      : result.status === 503
        ? 'No se envió nada: el servicio de correo del sitio aún no está configurado.'
        : result.status === 429
          ? 'Enviaron muchas solicitudes desde esta conexión. Intente de nuevo en unos minutos.'
          : 'No pudimos entregar su solicitud. Intente de nuevo en unos minutos.';
  return `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Solicitud de cotización</title><link rel="stylesheet" href="/css/style.css"></head><body><main class="container result"><h1>${ok ? 'Solicitud recibida' : 'No se envió'}</h1><p class="lead">${esc(msg)}</p><p><a href="/#cotizar">Volver al formulario</a></p></main></body></html>`;
}

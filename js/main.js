/* Interactions. Everything here is an enhancement: with scripting off the page reads in full. */
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* 1. One reveal: the service rows, once, as they enter */
(() => {
  const items = $$('[data-reveal]');
  if (!items.length) return;
  if (reduced.matches || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -10% 0px' });
  items.forEach((el) => io.observe(el));
})();

/* 2. Hero photograph: a slow drift against the scroll, a few pixels, off under reduced motion */
(() => {
  const hero = $('.hero');
  const img = $('.hero__media > img');
  if (!hero || !img || reduced.matches) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const h = hero.offsetHeight;
    const y = Math.min(Math.max(window.scrollY, 0), h) * 0.06;
    img.style.transform = `scale(1.12) translate3d(0, ${y.toFixed(1)}px, 0)`;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
})();

/* 3. Process: the pinned photograph follows the step in view */
(() => {
  const steps = $$('.step');
  if (!steps.length || !('IntersectionObserver' in window)) return;
  const set = (i) => steps.forEach((s, n) => s.classList.toggle('is-active', n === i));
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) set(Number(e.target.closest('.step').dataset.step));
  }), { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => io.observe($('.step__body', s)));
  set(0);
})();

/* 4. Work: an index and a viewer, built from the articles so a new project is one new <article> */
(() => {
  const root = $('[data-obras]');
  if (!root) return;
  const panels = $$('.obra', root);
  if (!panels.length) return;
  const list = document.createElement('div');
  list.className = 'obras__list';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-orientation', 'vertical');
  list.setAttribute('aria-label', 'Obras');
  const tabs = panels.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'obras__tab';
    b.id = `obra-tab-${i + 1}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', p.id);
    const long = document.createElement('span');
    long.className = 'long';
    long.textContent = p.dataset.title || `Obra ${i + 1}`;
    const short = document.createElement('span');
    short.className = 'short';
    short.textContent = p.dataset.short || long.textContent;
    b.append(long, short);
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', b.id);
    list.append(b);
    return b;
  });
  root.prepend(list);
  const show = (n, focus) => {
    tabs.forEach((t, i) => {
      const on = i === n;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].classList.toggle('is-active', on);
      if (!on) panels[i].setAttribute('aria-hidden', 'true'); else panels[i].removeAttribute('aria-hidden');
    });
    if (focus) tabs[n].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.addEventListener('keydown', (e) => {
      const k = e.key;
      let n = null;
      if (k === 'ArrowDown' || k === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (k === 'ArrowUp' || k === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') n = 0;
      else if (k === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); show(n, true); }
    });
  });
  show(0);
})();

/* 5. Quote form: validates, posts to the endpoint, and reports exactly what happened */
(() => {
  const form = $('#quote-form');
  if (!form) return;
  const status = $('#form-status');
  const button = $('button[type="submit"]', form);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const checks = {
    nombre: (v) => (v.trim().length >= 2 ? '' : 'Escriba su nombre.'),
    empresa: (v) => (v.trim().length >= 2 ? '' : 'Escriba el nombre de su empresa.'),
    correo: (v) => (emailRe.test(v.trim()) ? '' : 'Escriba un correo completo, por ejemplo nombre@empresa.cl.'),
    telefono: (v) => (!v.trim() || v.replace(/\D/g, '').length >= 8 ? '' : 'Escriba el teléfono con su código de área.'),
    tipo: (v) => (v ? '' : 'Seleccione el tipo de estructura.'),
    region: (v) => (v ? '' : 'Seleccione la región del proyecto.'),
    mensaje: (v) => (v.trim().length >= 10 ? '' : 'Cuéntenos en al menos una frase qué necesita.'),
    consentimiento: (_, el) => (el.checked ? '' : 'Debe aceptar para que podamos responderle.'),
  };
  const msgFor = (name) => $(`#${name}-msg`, form);
  const setError = (name, text) => {
    const el = form.elements[name];
    const msg = msgFor(name);
    if (!el || !msg) return;
    msg.textContent = text;
    if (text) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  };
  const say = (text, state) => { status.textContent = text; status.dataset.state = state || ''; };

  Object.keys(checks).forEach((name) => {
    const el = form.elements[name];
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid')) setError(name, checks[name](el.value, el)); });
    el.addEventListener('change', () => { if (el.getAttribute('aria-invalid')) setError(name, checks[name](el.value, el)); });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('', '');
    let first = null;
    for (const name of Object.keys(checks)) {
      const el = form.elements[name];
      const text = checks[name](el.value, el);
      setError(name, text);
      if (text && !first) first = el;
    }
    if (first) { first.focus(); say('Revise los campos marcados.', 'error'); return; }

    const endpoint = form.dataset.endpoint;
    if (!endpoint) { say('No se envió nada: el formulario aún no está conectado.', 'error'); return; }

    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    say('Enviando…', '');
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      let body = {};
      try { body = await res.json(); } catch { /* a non-JSON reply is handled by status below */ }
      if (res.ok && body.ok) {
        form.reset();
        say('Recibimos su solicitud. Le responderemos al correo que indicó.', 'ok');
      } else if (res.status === 400 && body.errors) {
        let firstBad = null;
        for (const [name, text] of Object.entries(body.errors)) {
          setError(name, text);
          if (!firstBad && form.elements[name]) firstBad = form.elements[name];
        }
        if (firstBad) firstBad.focus();
        say('Revise los campos marcados.', 'error');
      } else if (res.status === 429) {
        say('Enviaron muchas solicitudes desde esta conexión. Intente de nuevo en unos minutos.', 'error');
      } else if (res.status === 503) {
        say('No se envió nada: el servicio de correo del sitio aún no está configurado.', 'error');
      } else {
        say('No pudimos entregar su solicitud. Intente de nuevo en unos minutos.', 'error');
      }
    } catch (err) {
      say(err && err.name === 'AbortError'
        ? 'La solicitud tardó demasiado y no sabemos si llegó. Intente de nuevo.'
        : 'No hay conexión con el sitio. Revise su internet e intente de nuevo.', 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
})();

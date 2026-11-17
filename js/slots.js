/*
 * Photo slots. Every picture on the page lives in a [data-slot]. Today each one holds a labelled
 * archive photograph. To use the company's own photographs, fill COMPANY_PHOTOS below (paths relative
 * to this site) and nothing else changes: the archive photo and its "Foto de archivo" label are removed.
 *
 *   hero          the first screen, wide (about 3:2 or wider, 2400px or more across)
 *   proceso-1..3  workshop, transport, assembly
 *   obra-1..4     one finished project each (16:10)
 *
 * Example: const COMPANY_PHOTOS = { hero: 'assets/torre-cerro.jpg', 'obra-1': { src: 'assets/obra-1.jpg', alt: 'Torre en el cerro X' } };
 */
const COMPANY_PHOTOS = {};

window.hallmarkSlots = (map) => {
  for (const [key, v] of Object.entries(map)) {
    const slots = document.querySelectorAll(`[data-slot="${key}"]`);
    for (const s of slots) {
      const im = new Image();
      im.src = typeof v === 'string' ? v : v.src;
      im.alt = (typeof v === 'object' && v.alt) || s.dataset.alt || '';
      im.decoding = 'async';
      s.querySelectorAll(':scope > img').forEach((o) => o.remove());
      s.querySelectorAll('[data-standin]').forEach((o) => o.remove());
      s.dataset.own = 'true';
      s.prepend(im);
    }
  }
};

// A stand-in that fails to load is dropped so the slot never shows a broken image.
document.querySelectorAll('[data-slot] img').forEach((i) => {
  if (i.complete && !i.naturalWidth) i.remove();
  else i.addEventListener('error', () => i.remove(), { once: true });
});

if (Object.keys(COMPANY_PHOTOS).length) window.hallmarkSlots(COMPANY_PHOTOS);

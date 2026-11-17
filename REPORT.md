# Informe final

## Qué se entregó
Sitio de una página en español (`es-CL`), responsivo, con un endpoint real de cotización. Carpeta `site/` (front), `server.mjs` y `lib/quote.mjs` (back), `api/quote.mjs` y `vercel.json` (opción serverless), `test/` (13 pruebas), `DEPLOY.md`, `MISSING-ASSETS.md`.

## Dirección visual
Se evaluaron las tres direcciones del brief. Se eligió **Industrial Premium** (grafito oscuro, tipografía condensada Oswald, un solo naranja de seguridad, fotos en blanco y negro con marco recto, sombras duras) con dos toques de las otras: una banda de concreto claro como alivio (editorial) y movimiento inmersivo medido (imagen fijada en el proceso, galería de obras con transición en fundido). Tema base: Formwork, versión "night pour".

## Decisiones técnicas
- Front estático sin framework ni build: HTML, un CSS con tokens, un JS de ~200 líneas. Sin dependencias.
- Back: Node sin dependencias. Validación en servidor, honeypot, límite por IP, revisión de origen, escape HTML en el correo, envío por API de Resend. Sin configuración responde 503 y el formulario lo dice; nunca simula éxito.
- CSP estricta, `nosniff`, `Referrer-Policy`. Sin scripts ni estilos en línea.
- SEO: `title`, descripción, un `h1`, jerarquía de títulos, JSON-LD (Organization, solo con datos conocidos), `robots.txt`. Faltan canonical y sitemap hasta tener dominio.
- Accesibilidad: enlace de salto, foco visible inmediato, pestañas con teclado, estados `aria-live` y `aria-invalid`, movimiento desactivado con `prefers-reduced-motion`, contenido visible sin JavaScript.

## Pruebas ejecutadas
- `npm test`: 13/13 (validación, honeypot, límite, origen, entrega a proveedor simulado, fallo 502, 503 sin configurar, servidor completo, traversal de rutas).
- Navegador real: formulario inválido (foco en el primer campo), sin configurar (503, "No se envió nada"), éxito contra proveedor simulado (el correo llegó con Reply-To y cuerpo correctos); pestañas de obras con clic y flechas; 375 px sin desborde horizontal.
- Linter Hallmark con render: 0 FAIL, 0 WARN, 3 descartados con motivo (falsos positivos de contraste por el bloque de tokens de la banda clara).
- Revisión final con un revisor independiente: pidió arreglar numeración de pasos, textos repetidos, leyendas de fotos, secciones delgadas y pestañas móviles. Todo corregido y re-medido.

## Pendiente o no verificado
- Sin envío real: no se creó cuenta de Resend (decisión y costo del dueño).
- Sin probar: lectores de pantalla, Safari/Firefox, Lighthouse con fotos propias, modo sin JavaScript en navegador (solo comprobado que el HTML trae el contenido).
- Las fotos son de archivo y las fuentes cargan de Google Fonts; ver `DEPLOY.md`.
- Falta todo el material propio de la empresa: ver `MISSING-ASSETS.md`.

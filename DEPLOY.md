# Despliegue y operación

El sitio son archivos estáticos en `site/` más un endpoint `POST /api/quote` que envía las solicitudes de cotización por correo. No hay dependencias de npm. Requiere Node 20 o superior.

## Probar en local

```bash
node server.mjs
```

Abre `http://localhost:3000`. Sin las variables de correo el formulario responde "No se envió nada" (a propósito: nunca simula un envío).

```bash
npm test
```

Corre 13 pruebas: validación, honeypot, límite de solicitudes, origen, entrega con un proveedor de correo simulado, fallo del proveedor y el servidor completo.

## Configurar el correo (obligatorio para recibir cotizaciones)

El envío usa [Resend](https://resend.com). Crear la cuenta y la clave es una decisión del dueño del sitio; el código ya está listo.

1. Crear una cuenta en Resend y verificar el dominio de la empresa (registros DNS que Resend indica).
2. Crear una API key.
3. Copiar `.env.example` a `.env` (o cargar las variables en el panel del hosting):

| Variable | Qué es |
| --- | --- |
| `RESEND_API_KEY` | La clave de Resend |
| `QUOTE_TO` | Correo(s) que reciben las solicitudes, separados por coma |
| `QUOTE_FROM` | Remitente de un dominio verificado, por ejemplo `Sitio web <cotizaciones@sudominio.cl>` |

Si falta alguna, el endpoint responde 503 y el formulario lo dice. Cada correo lleva el correo del cliente en `Reply-To`, así que se responde con "Responder".

Si prefieren otro proveedor (SMTP, SendGrid, Mailgun), solo cambia la función `createQuoteHandler` en `lib/quote.mjs`; el resto no se toca.

## Opción A: un servidor Node (VPS, Render, Railway, Fly)

1. Subir el proyecto, definir las variables de arriba y `TRUST_PROXY=1` si hay un proxy delante.
2. Comando de inicio: `node server.mjs` (puerto en `PORT`).
3. Poner HTTPS delante (el proxy del hosting o Caddy/nginx). El servidor ya envía CSP, `nosniff`, `Referrer-Policy` y `frame-ancestors 'none'`.
4. Comprobar `GET /healthz` y enviar una cotización de prueba.

## Opción B: Vercel

El repositorio incluye `api/quote.mjs` y `vercel.json` (publica `site/` y la función). Cargar las tres variables en el proyecto de Vercel. Nota: el límite de solicitudes por IP vive en memoria de cada instancia; para un límite estricto en serverless usar un almacén externo.

## Antes de publicar el dominio

- [ ] Reemplazar el nombre de la empresa (ver `MISSING-ASSETS.md`).
- [ ] Añadir `<link rel="canonical" href="https://SU-DOMINIO.cl/">` y `og:url` en `site/index.html`.
- [ ] Crear `site/sitemap.xml` con la URL real y descomentar la línea `Sitemap:` en `site/robots.txt`.
- [ ] Reemplazar las fotos de archivo (ver `site/js/slots.js`) y apagar el aviso quitando el atributo `data-draft` de `<html>`.
- [ ] Rellenar correo y teléfono en la sección de cotización.
- [ ] Enviar una cotización real y confirmar que llega.
- [ ] Probar en Google PageSpeed Insights ya con las fotos propias (pesar cada foto en menos de 300 KB, ancho 1920).

## Fuentes y fotos de archivo

- Las fuentes (Oswald, Archivo) cargan desde Google Fonts. Para no depender de un tercero, descargarlas a `site/fonts/` y ajustar `<link>` y la política CSP en `server.mjs`.
- Las 8 fotos de archivo cargan desde Wikimedia Commons con su crédito en el pie. Desaparecen al cargar las fotos propias; entonces se puede retirar el dominio de `img-src` en la CSP y la línea de créditos del pie.

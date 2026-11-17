# Material que falta

La carpeta del proyecto estaba vacía: no había logo, fotos, textos ni datos de la empresa. Nada de lo que sigue se inventó; cada punto es un hueco marcado.

## Datos de la empresa

| Dato | Dónde está hoy | Dónde cambiarlo |
| --- | --- | --- |
| Nombre de la empresa (hoy "Nombre Empresa") | barra superior, pie, JSON-LD | buscar y reemplazar `Nombre Empresa` en `site/index.html` |
| Logo (se usa el nombre en texto) | barra superior y pie | `.nav__brand` y `.foot__mark` |
| Correo y teléfono de contacto | dos huecos punteados "por confirmar" | sección `#cotizar`, lista `.facts` |
| Dominio del sitio | no hay | canonical, `og:url`, sitemap (ver `DEPLOY.md`) |
| Correo que recibe cotizaciones y cuenta de envío | sin configurar | variables de entorno (`.env.example`) |
| Dirección u oficina (opcional) | no aparece | pie y JSON-LD |

## Fotografías (lo más importante)

Hoy hay 8 fotos de archivo de Wikimedia Commons, cada una marcada "Foto de archivo" y con crédito en el pie. No son obras de la empresa. Cada una vive en una ranura (`data-slot`) y se reemplaza en `site/js/slots.js` sin tocar el diseño.

| Ranura | Qué debe mostrar | Medida |
| --- | --- | --- |
| `hero` | Una torre de vigilancia terminada en su cerro, de día, con espacio de cielo o bosque | horizontal, 2400 px o más de ancho |
| `proceso-1` | Taller: soldadura y armado de piezas de una torre | 4:3, 1600 px |
| `proceso-2` | Traslado: las piezas cargadas rumbo al terreno | 4:3, 1600 px |
| `proceso-3` | Montaje: el equipo armando la torre en altura | 4:3, 1600 px |
| `obra-1` | Una torre de vigilancia forestal terminada | 16:10, 1600 px |
| `obra-2` | Una estructura metálica industrial terminada | 16:10, 1600 px |
| `obra-3` | Soldadura o armado en taller | 16:10, 1600 px |
| `obra-4` | Montaje en terreno elevado | 16:10, 1600 px |

Con material real, cada obra debería tener nombre, comuna o región, año y cliente si es público. Un proyecto nuevo es un `<article class="obra">` copiado en `#obras`; el índice se arma solo.

## Textos y datos que el sitio no afirma porque nadie los dio

Años de experiencia, cantidad de torres o proyectos, certificaciones, clientes, alturas, cargas, plazos de fabricación, zonas de cobertura, historia de la empresa, equipo. Si la empresa quiere publicarlos, entregarlos con respaldo y se agregan (por ejemplo una franja de cifras o un párrafo de historia).

## Decisiones que necesitan al dueño

1. Proveedor y cuenta de correo para recibir cotizaciones (Resend por defecto).
2. Dónde se aloja el sitio (servidor propio, Render/Railway o Vercel).
3. Si el contacto debe incluir WhatsApp (hoy no hay número).

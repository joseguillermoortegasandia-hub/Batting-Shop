# Batting Shop V4 — Etapa 3

Esta entrega es **acumulativa**: contiene Etapa 1 + Etapa 2 + Etapa 3.

> **No publiques la carpeta completa.** `private/` contiene SQL, costos/SKU de preparación, pruebas y referencias. Cloudflare debe publicar únicamente `dist/`, generado con `pnpm run build`.

## Qué incluye

### Tienda pública

- Catálogo mobile-first sin cuentas de cliente.
- Pedido por WhatsApp, Favoritos locales, barra inferior móvil y WhatsApp flotante.
- Categorías/atributos dinámicos desde Supabase.
- Estado **PRÓXIMAMENTE** si no hay productos publicados.
- Precio general o por variante; `NULL` = **Consultar precio**.
- URLs limpias `/producto/<slug>/`.
- OG/Twitter dinámico por producto mediante Cloudflare Worker, con fallback al HTML normal si Supabase falla.
- Alias de slugs: una URL antigua de producto resuelve y redirige al slug actual.
- Alias de categorías: `?categoria=<slug-antiguo>` se normaliza al slug actual.

### Admin

- Auth Supabase + MFA/AAL2 + RLS.
- Productos, inventario, imágenes, categorías, atributos, auditoría, edición masiva e importación CSV.
- Crear categorías sin tocar código.
- Pelotas permanece sembrada **inactiva** hasta que el dueño decida activarla.
- Cambiar un slug conserva el slug anterior como alias automáticamente.
- Importación CSV dinámica mediante columnas `attr:<clave>`.
- Todo CSV entra como **borrador**.

## CSV dinámico

Columnas base recomendadas:

```text
code,slug,name,brand,category,price,color,color_label,color_hex,size_label,normalized_size,size_sort_order,sale_price,stock,cost,provider_sku,provider_source_url
```

Los atributos definidos en la categoría se agregan como:

```text
attr:edad_nivel
attr:tipo
attr:tamano
attr:material
attr:presentacion
```

El Admin genera una plantilla desde la taxonomía actual. Reglas:

- `select`: el valor debe existir en las opciones de la categoría.
- `multiselect`: valores separados con `|`.
- `number`: número válido.
- `boolean`: `Sí/No`, `true/false` o `1/0`.
- Un `attr:` vacío que pertenezca a otra categoría se ignora.
- Un `attr:` con valor que no exista para la categoría seleccionada se rechaza.
- `price` y `sale_price` vacíos = sin precio / Consultar precio.
- `stock` debe ser entero >= 0.
- Los imports nunca publican automáticamente.

## Base de datos

En una base existente aplica las migraciones **en orden**:

1. `private/supabase/migrations/001_stage1_dynamic_catalog.sql`
2. `private/supabase/migrations/002_stage2_categories_pelotas.sql`
3. `private/supabase/migrations/003_stage3_slug_aliases.sql`
4. `private/supabase/migrations/004_security_performance.sql` (políticas, límite de carrito, categorías compactas y metadatos de imágenes).

La migración 003 agrega:

- `product_slug_aliases`
- `category_slug_aliases`
- triggers de captura automática de slug anterior;
- protección contra reutilizar un alias de otra entidad;
- RLS administrativa;
- auditoría de alias;
- `get_public_product()` capaz de resolver alias;
- `get_public_catalog()` incluyendo alias de categorías.

Antes de producción ejecuta `private/supabase/prelaunch-audit.sql`.

## Build

Requisitos: Node.js 22+, Corepack y pnpm 11.5.1 (fijado en packageManager).

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Variables:

```text
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
PRODUCTION_BRANCH=main
SITE_URL=https://tu-dominio-final.com
```

Reglas de `SITE_URL`:

- Preview Cloudflare: puede faltar; usa `CF_PAGES_URL` y queda `noindex`.
- Producción: si `CF_PAGES_BRANCH === PRODUCTION_BRANCH`, el build falla si falta `SITE_URL`.

Cloudflare Pages:

```text
Build command: pnpm run build
Output directory: dist
Node.js: 22+
```

El build copia `@supabase/supabase-js@2.117.2` a `/assets/vendor/` solo para /admin. Las páginas públicas no cargan el SDK. No se usan dependencias CDN en producción.

## Seguridad

- Sin login para clientes.
- Storefront: fetch a cuatro RPC públicas, apikey pública, timeout de 4 s y un reintento; no carga supabase-js ni sesiones.
- Admin: Auth + MFA/AAL2 + RLS.
- Cloudflare Access recomendado delante de `/admin/*`.
- CSP estricta sin `unsafe-inline` en estilos.
- Sin `innerHTML` con datos de Supabase.
- Costos, stock exacto, SKU y proveedor fuera del payload público.
- Alias de slugs no tienen lectura directa pública; se resuelven dentro de RPCs `security definer` controladas.
- `dist/` no contiene SQL, tests, seeds ni datos privados.

## Imágenes, stock y precios

No se inventan datos. Las referencias antiguas permanecen solo en `private/reference-images/`.

Antes de publicar productos reales:

1. subir imágenes HD autorizadas a Storage desde Admin;
2. cargar stock real;
3. definir precios de venta o dejarlos en `NULL` para Consultar precio;
4. revisar cada producto en Preview;
5. publicar solo cuando esté completo.

## Pruebas

```bash
pnpm run verify
pnpm run test:browser
```

Los resultados de Stage 3 son históricos. Consulta `private/docs/SECURITY_PERFORMANCE_REVIEW.md` y los logs de `artifacts/` para la revisión actual.

Consulta `private/docs/archive-stage2-stage3/STAGE3_TEST_REPORT.md` para límites y pruebas no ejecutadas contra servicios reales.

## Archivos de revisión

- `private/docs/archive-stage2-stage3/STAGE3_CHANGELOG.md`
- `private/docs/archive-stage2-stage3/STAGE3_REVIEW.md`
- `private/docs/archive-stage2-stage3/STAGE3_TEST_REPORT.md`
- `private/supabase/ROLLBACK.md`
- `private/supabase/prelaunch-audit.sql`

## Configuración de esta revisión

La vista previa local ya está conectada al proyecto Supabase Batting Shop. `.env.local` guarda únicamente URL y clave publicable y está ignorado por Git. Para reconstruir: `pnpm run build:local`. Para servir: `pnpm run preview`, y abrir http://localhost:8080/. No se necesita cuenta de cliente. Con la base sin productos publicados aparece Próximamente; no es un error de conexión.

No importar `private/supabase/seed.sql`: el propietario agregará todos los productos. La base conectada quedó sin productos, variantes, imágenes ni inventario. Después de 004 se aplica también la migración `20261104005057_restrict_function_grants.sql`, que elimina permisos directos heredados de funciones internas y mantiene solo las cuatro RPC públicas.

Instalación: `pnpm install --frozen-lockfile`. No usar npm install; preinstall lo rechaza.
Los comandos npm run build / npm run test:browser siguen disponibles para ejecutar los scripts solicitados, sin instalar paquetes con npm.
Preparación de tests en Windows: `python -m pip install -r private/tests/requirements.txt`.
browser_smoke usa Google Chrome instalado; también acepta PLAYWRIGHT_EXECUTABLE_PATH para Chromium.

En Pages configura SUPABASE_URL y SUPABASE_ANON_KEY **para el build y para el Worker en tiempo de ejecución**, tanto en producción como en preview. Deben apuntar al mismo proyecto: la CSP se genera con ese origen exacto. No se cargan archivos .env automáticamente. Nunca uses service_role ni sb_secret en estas variables públicas. Las claves anon/publishable son públicas por diseño; RLS y las RPC limitan los datos accesibles. Las claves privadas pertenecen solo al servidor/gestor de secretos y no al repositorio.

Mantén el repositorio privado. Publica exclusivamente dist/, nunca la raíz ni private/.
Protege /admin/* con Cloudflare Access; desactiva signup público en Supabase Auth; configura Turnstile compatible con Auth o límites de intentos en el login. Esto requiere configurar los servicios reales y no queda activado por cambiar el código. La sesión del admin se cierra localmente tras 30 minutos sin actividad, incluso al volver a una pestaña suspendida. La caducidad del token en el servidor debe configurarse además en Supabase.

HSTS se envía en _headers y Worker con max-age=31536000; activa HTTPS en el dominio y comprueba los headers reales de producción. No se solicita preload ni includeSubDomains sin revisar todos los subdominios.

El Worker solo incluye /producto/* mediante _routes.json. _headers protege los assets estáticos: HTML no-store; CSS/JS una hora y revalidación; imágenes un día; vendor versionado immutable. El Worker conserva sus propios headers porque _headers no se aplica a respuestas de Functions. La consulta de producto tiene timeout 2.5 s y caché de datos de 60 s por proyecto/slug; cambios de producto pueden tardar hasta 60 s en reflejarse en OG. og:url no lleva parámetros.

### Storage y fotos

Aplica 004 después de 001–003 y prueba prelaunch-audit.sql en una sesión independiente como postgres. Rollback: private/supabase/rollback/004_security_performance.rollback.sql. El rollback vuelve a permitir listar y conserva los derivados y las columnas para no perder datos.
004 quita product_images_public_read y permite SELECT de storage.objects solo a is_admin(). Conserva el bucket público para que funcionen las URLs conocidas. Un bucket público no oculta una foto de borrador cuya URL ya se conoce: para confidencialidad de borradores hace falta un bucket privado separado. Revisa políticas adicionales: una política permisiva ajena puede volver a permitir listados.

Las nuevas subidas verifican mínimo 800×800 y máximo de entrada 5 MB, convierten a WebP de hasta 1600×1600 (calidad 82), miniatura 480×480 y JPG OG <=300 KiB. Los nombres son UUID y cada variante tiene su ruta en product_images. Se usa un lienzo cuadrado blanco para conservar encuadre sin recortar. Los JPG se recomprimen/reducen hasta cumplir el tamaño. El Worker usa ogStoragePath y, para imágenes legacy que aún no tienen JPG confirmado, usa la portada JPG de la tienda.
Las fotos que ya estén en Storage necesitan volver a subirse o migrarse con una cuenta admin; esta revisión no puede convertir datos de una instancia no conectada. Para las 25 referencias locales ya se generaron JPG en artifacts/reference-derivatives, sin cambiar originales. Se pueden regenerar con:
`python private/scripts/prepare_local_images.py private/reference-images artifacts/reference-derivatives`.

### Alcance de las pruebas

verify usa builds temporales y no sustituye la biblioteca ni borra node_modules/dist.
browser_smoke intercepta las cuatro RPC con datos de prueba y genera 24 capturas en artifacts/screenshots: home, catálogo, ficha, carrito, favoritos y categorías en 320/390/768/1366. Comprueba además 360/412/1024/1920, targets, texto, overflow, búsqueda, loader, estados vacío/error, carrito y procesamiento de imágenes.
Las pruebas del Worker usan un adaptador local de HTMLRewriter y caché. Un GET local del contrato da 200 con title y og:title; falta comprobarlo en Cloudflare real. No se probó Supabase Auth/Storage/RLS remoto, distribución edge de caché, previews reales de WhatsApp/Facebook ni los navegadores de iPhone/Instagram. El flujo elimina window.open asíncrono y conserva wa.me, pero la confirmación en esos dispositivos requiere pruebas reales.

Fuentes: [Routing de Pages](https://developers.cloudflare.com/pages/functions/routing/), [headers estáticos](https://developers.cloudflare.com/pages/configuration/headers/), [buckets públicos de Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals), [políticas de Storage](https://supabase.com/docs/guides/storage/security/access-control).

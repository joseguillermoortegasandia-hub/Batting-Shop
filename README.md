# Batting Shop V4 — Etapa 3

**Tienda y panel separados:** publicar `dist/` para la tienda y `dist-panel/` para el panel privado. El panel está en `panel/`, fuera de `public/`. [Guía de separación, vistas locales y Cloudflare Access](private/docs/SEPARATE_PANEL.md). La tienda ya no ofrece `/admin/` ni distribuye sus archivos. El inicio conserva su diseño con un catálogo vacío.

Esta entrega es **acumulativa**: contiene Etapa 1 + Etapa 2 + Etapa 3.

> **No publiques la carpeta completa.** `private/` contiene SQL, costos/SKU de preparación, pruebas y referencias. El proyecto público debe publicar únicamente `dist/`, generado con `pnpm run build`; el proyecto privado publica `dist-panel/`, generado con `pnpm run build:panel`.

## Qué incluye

### Tienda pública

- Catálogo mobile-first sin cuentas de cliente.
- Pedido por WhatsApp, Favoritos locales, barra inferior móvil y WhatsApp flotante.
- Categorías/atributos dinámicos desde Supabase.
- Estado **PRÓXIMAMENTE** si no hay productos publicados.
- Precio general por producto; `NULL` = **Consultar precio**.
- URLs limpias `/producto/<slug>/`.
- OG/Twitter dinámico por producto mediante Cloudflare Worker, con fallback al HTML normal si Supabase falla.
- Alias de slugs: una URL antigua de producto resuelve y redirige al slug actual.
- Alias de categorías: `?categoria=<slug-antiguo>` se normaliza al slug actual.

### Admin

- Auth Supabase (correo y contraseña) + permisos admin + RLS.
- Productos, inventario, imágenes, categorías, atributos, auditoría, edición masiva y facturas privadas.
- Crear categorías sin tocar código.
- Pelotas permanece sembrada **inactiva** hasta que el dueño decida activarla.
- Cambiar un slug conserva el slug anterior como alias automáticamente.
- Colores con varias fotos y tallas con stock independiente.
- Eliminación individual y múltiple con confirmación.
- Duplicación completa de producto, fotos, colores y tallas; código y URL nuevos.
- Facturas privadas con imagen, nombre y número.

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

El build del panel copia `@supabase/supabase-js@2.117.2` a su propia salida dist-panel/assets/vendor/. La salida pública dist/ no incluye esa biblioteca. Las páginas públicas no cargan el SDK. No se usan dependencias CDN en producción.

## Seguridad

- Sin login para clientes.
- Storefront: fetch a cuatro RPC públicas, apikey pública, timeout de 4 s y un reintento; no carga supabase-js ni sesiones.
- Admin: Auth (correo y contraseña) + permisos admin + RLS.
- Cloudflare Access sobre todo el hostname del panel separado, con validación del JWT en su Worker.
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

La vista previa local ya está conectada al proyecto Supabase Batting Shop. El panel se abre en http://localhost:8081/ y la tienda en http://localhost:8080/. `.env.local` guarda únicamente URL y clave publicable y está ignorado por Git. Para reconstruir: `pnpm run build:local`. Para servir: `pnpm run preview`, y abrir http://localhost:8080/. No se necesita cuenta de cliente. Con la base sin productos publicados aparece Próximamente; no es un error de conexión.

No importar `private/supabase/seed.sql`: el propietario agregará todos los productos. La base conectada quedó sin productos, variantes, imágenes ni inventario. Después de 004 se aplica también la migración `20261104005057_restrict_function_grants.sql`, que elimina permisos directos heredados de funciones internas y mantiene solo las cuatro RPC públicas.

Instalación: `pnpm install --frozen-lockfile`. No usar npm install; preinstall lo rechaza.
Los comandos npm run build / npm run test:browser siguen disponibles para ejecutar los scripts solicitados, sin instalar paquetes con npm.
Preparación de tests en Windows: `python -m pip install -r private/tests/requirements.txt`.
browser_smoke usa Google Chrome instalado; también acepta PLAYWRIGHT_EXECUTABLE_PATH para Chromium.

En Pages configura SUPABASE_URL y SUPABASE_ANON_KEY **para el build y para el Worker en tiempo de ejecución**, tanto en producción como en preview. Deben apuntar al mismo proyecto: la CSP se genera con ese origen exacto. No se cargan archivos .env automáticamente. Nunca uses service_role ni sb_secret en estas variables públicas. Las claves anon/publishable son públicas por diseño; RLS y las RPC limitan los datos accesibles. Las claves privadas pertenecen solo al servidor/gestor de secretos y no al repositorio.

Mantén el repositorio privado. Publica dist/ en el proyecto de tienda y dist-panel/ en el proyecto del panel; nunca la raíz ni private/.
Protege el hostname completo del panel con Cloudflare Access; desactiva signup público en Supabase Auth; configura Turnstile compatible con Auth o límites de intentos en el login. Esto requiere configurar los servicios reales y no queda activado por cambiar el código. La sesión del admin se cierra localmente tras 30 minutos sin actividad, incluso al volver a una pestaña suspendida. La caducidad del token en el servidor debe configurarse además en Supabase.

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
Las pruebas del Worker incluyen el contrato simulado y Pages/workerd nativo en localhost (test:pages). Se verificaron RPC, permisos anon y listado de Storage contra Supabase real sin escribir productos. La autenticación y subida real de fotos por el propietario, la distribución edge de caché, las previews reales de WhatsApp/Facebook y los navegadores de iPhone/Instagram requieren comprobación posterior. El flujo elimina window.open asíncrono y conserva wa.me, pero la confirmación en esos dispositivos requiere pruebas reales.

Fuentes: [Routing de Pages](https://developers.cloudflare.com/pages/functions/routing/), [headers estáticos](https://developers.cloudflare.com/pages/configuration/headers/), [buckets públicos de Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals), [políticas de Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Editor único y cantidades

El panel reúne información, colores/tallas, stock, fotos y vista previa en un solo formulario. Publicar producto guarda las imágenes preparadas y publica al terminar; no hay selector de estado ni botón de borrador. Cada color agrupa fotos y tallas con su stock. Facturas sustituye la antigua importación CSV.

Cada producto permite una unidad o varias (hasta 99) por pedido. La ficha y el carrito comparten el límite entre variantes y restringen cada combinación al stock disponible. Aplicar `20261104141323_product_order_quantity.sql` después de las migraciones anteriores; su rollback está en `private/supabase/rollback/`. No agrega productos. Detalles y límites de la prueba en `private/docs/UNIFIED_PRODUCT_EDITOR.md`.

El editor agrupa los colores, las fotos y las tallas con su stock, con precio general. Los errores de publicación permanecen visibles dentro del formulario. El cursor de bate de 48 px en formato nativo CUR con PNG de respaldo se comparte entre tienda y panel; el cursor de texto se reserva para los campos editables.

## Preparación final para despliegue

Node 24 y pnpm 11.5.1. La configuración de pnpm está en pnpm-workspace.yaml; solo se permite el script de instalación de workerd. Wrangler 4.157.0 es una dependencia de desarrollo para probar Pages, no se envía a los visitantes.

Ver la configuración exacta de los dos proyectos en [private/deploy/PAGES.md](private/deploy/PAGES.md) y el informe en [private/docs/PREDEPLOY_2026-11-04.md](private/docs/PREDEPLOY_2026-11-04.md). Las plantillas wrangler.store.jsonc y wrangler.panel.jsonc se seleccionan con pnpm run configure:pages store/panel; no despliegan automáticamente.

Pruebas adicionales: pnpm run test:panel, pnpm run test:pages y pnpm run check:live. El workflow de GitHub solo ejecuta pruebas y auditoría, sin credenciales de Supabase ni permisos de publicación. Su ejecución remota debe verificarse en Actions después de subir los cambios.

### Reabrir las dos vistas locales en Windows

Ejecutar `pnpm run preview:all` tras compilar con `pnpm run build:local` y `pnpm run build:panel:local`. Inicia tienda en http://localhost:8080/ y panel en http://localhost:8081/ en segundo plano, sin ventanas de consola, con logs separados en artifacts/preview-servers. Conserva los servidores que respondan correctamente; solo reinicia servidores de este proyecto comprobando su script, puerto y ruta absoluta de salida. No detiene otros servicios. Comprobado con HTTP y Chrome contra ambas vistas reales, sin crear productos.

Los servidores locales deben volver a iniciarse después de reiniciar Windows. El sitio desplegado en Internet no dependerá de estos procesos.

El servidor local resuelve también /producto/<slug>/ y las rutas de catálogo/tallas/favoritos sin extensión; envía no-store para no conservar versiones anteriores. Los builds generan versiones por contenido para CSS/JS y el cursor. Explicación de variantes, fotos, facturas y datos del dashboard: private/docs/ADMIN_FIELDS_AND_CURSOR.md.


## Facturas privadas y catálogo por color

Aplicar `private/supabase/migrations/20261105025353_private_purchase_invoices.sql` después de las migraciones anteriores. Crea `purchase_invoices` con RLS forzada y el bucket **privado** `purchase-invoices` (imágenes de hasta 10 MB). El rollback exige vaciar ambos antes de retirar el módulo. No crea ni modifica productos.

En el editor, **Agregar color** crea un grupo. **Agregar talla** añade stock y costo por talla; en categorías sin talla se registra directamente el stock del color. **Fotos de este color** selecciona el color de destino en la sección de fotos. Escribir un color conocido propone su tono; el selector permite ajustarlo. Publicar aplica un precio general. En la ficha pública, cambiar color cambia fotos y disponibilidad de tallas; mantiene la talla elegida si sigue disponible. Un color agotado permite ver fotos, pero no agregarlo al pedido.

La duplicación conserva datos y estado; se publica inmediatamente si el original estaba publicado. Cada copia necesita IDs, código y slug propios. Las fotos comparten archivos con registros independientes: borrar una copia o quitar su foto no elimina archivos usados por el original. La limpieza física de archivos huérfanos queda pendiente de una operación separada de mantenimiento.

Las facturas se consultan únicamente en el panel, con URLs firmadas temporales. No aparecen en el catálogo ni se incluyen sus imágenes en los ZIP. Cambiar de sección Facturas renueva sus enlaces.


## Portada y límites por inventario

La migración `20261105031159_stock_limits_home_cover.sql` añade la casilla **Mostrar en la portada de inicio** y el límite público de compra por variante. Aplica después de las migraciones anteriores. El límite de compra es el menor entre stock y máximo del producto. Los costos y datos de proveedor quedan en inventario privado.

La portada muestra un producto marcado y disponible a la vez y cambia cada tres segundos. El enlace abre la ficha. Incluye pausa y respeta el ajuste de movimiento reducido. El logo se muestra hasta que haya un producto disponible marcado para portada.

La ficha presenta descripción abierta y la tabla de la marca cuando existen tallas y hay una guía disponible. Reutiliza el catálogo de la sesión mientras esté fresco y usa miniaturas en la portada, tarjetas y galería de miniaturas.

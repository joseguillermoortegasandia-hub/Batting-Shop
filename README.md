# Batting Shop V4 — Etapa 3

Esta entrega es **acumulativa**: contiene Etapa 1 + Etapa 2 + Etapa 3.

> **No publiques la carpeta completa.** `private/` contiene SQL, costos/SKU de preparación, pruebas y referencias. Cloudflare debe publicar únicamente `dist/`, generado con `npm run build`.

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

Requisitos: Node.js 22+ y npm.

```bash
npm install
npm run build
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
Build command: npm run build
Output directory: dist
Node.js: 22+
```

El build copia `@supabase/supabase-js@2.117.2` a `/assets/vendor/`; producción no depende de jsDelivr.

## Seguridad

- Sin login para clientes.
- Storefront Supabase: `persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`.
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
npm run verify
npm run test:browser
```

Resultados de esta entrega:

- verificación estática/build: **94/94 PASS**;
- browser smoke: **27/27 PASS**.

Consulta `STAGE3_TEST_REPORT.md` para límites y pruebas no ejecutadas contra servicios reales.

## Archivos de revisión

- `STAGE3_CHANGELOG.md`
- `STAGE3_REVIEW.md`
- `STAGE3_TEST_REPORT.md`
- `private/supabase/ROLLBACK.md`
- `private/supabase/prelaunch-audit.sql`

# Batting Shop V4 — Etapa 2 · Reporte de pruebas

## Resultado

- Verificación estática/build: **90/90 PASS**.
- Browser smoke con Chromium/Playwright: **27/27 PASS**.

Archivos de salida:

- `STAGE2_STATIC_TEST_REPORT.txt`
- `STAGE2_BROWSER_TEST_REPORT.txt`

## Lo que sí se ejecutó

### Build / seguridad / estructura

- Sintaxis de todos los JavaScript públicos, Admin y `build.mjs` mediante `node --check`.
- Preview de Cloudflare simulado sin `SITE_URL`: construye correctamente.
- Rama de producción simulada sin `SITE_URL`: el build se bloquea como se pidió.
- Producción simulada con `SITE_URL`: construye correctamente.
- Rechazo de `SUPABASE_URL` que no sea `https://*.supabase.co`.
- `dist/` inspeccionado para confirmar ausencia de SQL, tests, `private/` y `private-seed.csv`.
- Supabase JS se copia a `/assets/vendor/` y no se usa jsDelivr.
- `_worker.js` de Cloudflare se genera con soporte de HTMLRewriter para OG dinámico.
- `robots.txt` de producción no enumera `/admin/`.
- Preview queda `noindex`.
- HTML construido sin `style=` inline y CSP sin `unsafe-inline` de estilos.

### Frontend en navegador

Probado con Chromium real en el harness local:

- **390×844** móvil.
- **1366×800** escritorio.
- `prefers-reduced-motion: reduce`.
- Loader visible con latencia simulada de 1.5 s y oculto al finalizar.
- Barra inferior móvil visible, 5 ítems y oculta en desktop.
- WhatsApp flotante colocado sobre la barra móvil y sin tapar el CTA de producto.
- Bottom sheet de Categorías alimentado con datos simulados de Supabase.
- Escape cierra la hoja de categorías.
- Búsqueda por atributo dinámico.
- Filtros dinámicos de atributos de producto y variante.
- Ficha individual sin descargar catálogo completo.
- Pedido con combinación de precio conocido + `Consultar precio`: total `Por confirmar`, nunca `$0.00`.
- Badge 0 oculto.
- Sin scroll horizontal en móvil, catálogo ni escritorio de las vistas probadas.
- Sin errores de consola/pageerror en las vistas probadas.
- Estado **PRÓXIMAMENTE** cuando el catálogo simulado no tiene productos publicados.

### SQL revisado estáticamente

Se comprobó presencia/ausencia de las piezas esperadas en 001 y 002:

- cinco categorías actuales de Etapa 1;
- Pelotas inactiva;
- atributos Tipo/Tamaño/Material/Presentación;
- `scope = product | variant`;
- `sale_price` y `size_sort_order`;
- `display_name` de color;
- validación de publicación;
- máximo 6 destacados;
- RPCs de catálogo, producto, relacionados y carrito;
- payload público sin código BS, costo, stock exacto ni SKU;
- ausencia de `slug_aliases` y `resolve_public_slug` (Etapa 3 no adelantada).

## Lo que NO se pudo ejecutar aquí

1. **Migraciones contra un proyecto Supabase/Postgres real.** No tengo una instancia de staging del dueño ni credenciales. Las migraciones fueron revisadas estáticamente, pero deben aplicarse primero en staging.
2. **RLS/Auth/MFA reales.** No se verificó un login real, AAL2, `admin_users` ni ataques contra policies en un proyecto Supabase vivo.
3. **Storage real.** No se subieron/borraron/reordenaron imágenes contra un bucket Supabase real.
4. **Cloudflare Pages/Workers real.** Se verificó el build y la generación del worker, pero no se desplegó en la infraestructura de Cloudflare; por ello la transformación OG debe confirmarse en un preview real antes de producción.
5. **OG de WhatsApp/Instagram real.** No se pudo pedir a los crawlers de Meta/WhatsApp que inspeccionaran un deployment público.
6. **`npm install` desde registro en este runtime.** Las pruebas de build usaron un fixture local en la ruta esperada del paquete para no depender de red del contenedor. El proyecto fija `@supabase/supabase-js` en `2.117.2`; en tu entorno/Cloudflare debe ejecutarse `npm install`.
7. **Admin de Categorías end-to-end con base real.** Su código, navegación, validaciones y consultas fueron revisados estáticamente, pero crear/editar una categoría real requiere staging Supabase.

## Antes de avanzar a Etapa 3

Recomendado:

1. crear proyecto Supabase de staging;
2. aplicar 001 y 002 en orden;
3. ejecutar `prelaunch-audit.sql`;
4. activar un admin de prueba con MFA;
5. crear una categoría de prueba con 2 atributos y un producto con 2 variantes;
6. desplegar un preview en Cloudflare y comprobar URL limpia + OG desde una URL pública.

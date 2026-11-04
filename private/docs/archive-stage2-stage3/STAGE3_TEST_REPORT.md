# Batting Shop V4 — Reporte de pruebas Etapa 3

## Ejecutadas

### Verificación estática y build

`python3 private/tests/verify.py`

Resultado: **94/94 PASS**.

Incluye comprobaciones de:

- migraciones 001/002/003;
- alias de productos y categorías;
- RPC pública que resuelve alias;
- alias de categoría dentro del catálogo;
- CSV dinámico `attr:` y validación contra categorías;
- importación siempre como borrador;
- precio por variante;
- plantilla dinámica;
- CSP y ausencia de `style=` inline;
- Supabase JS self-hosted y versión fija;
- separación de archivos privados de `dist/`;
- build preview sin `SITE_URL`;
- bloqueo de build de producción sin `SITE_URL`;
- build de producción con `SITE_URL`;
- rechazo de `SUPABASE_URL` no permitido;
- sintaxis JavaScript de todos los archivos públicos y `build.mjs`.

### Browser smoke test

`python3 private/tests/browser_smoke.py`

Resultado: **27/27 PASS**.

Probó la interfaz acumulada en móvil y escritorio con Supabase simulado: loader, categorías dinámicas, filtros, búsqueda por atributos, ficha, WhatsApp, carrito mixto, estado Próximamente, reduced motion, barra inferior y ausencia de scroll horizontal/errores JS.

## No ejecutadas / no verificables aquí

- No se ejecutó `003_stage3_slug_aliases.sql` contra un Supabase/Postgres real.
- No se verificaron RLS/Auth/MFA contra las cuentas reales del negocio.
- No se desplegó a un Cloudflare Pages real; la lógica del Worker se verificó por build y pruebas locales, no mediante un deployment externo.
- No se probó la vista previa real de WhatsApp/Meta de un producto publicado.
- No se probó una importación CSV contra una base Supabase real; se verificó estáticamente la lógica y la sintaxis del Admin.
- No se subieron imágenes reales a Storage.

Antes de producción: staging real → migraciones 001/002/003 → usuario admin + MFA → Cloudflare Access → carga de imágenes/stock/precios → prelaunch audit → deployment preview → prueba de URLs antiguas y OG → producción.

# Test Report — Batting Shop V3.1

Fecha de revisión: 2026-10-05

## Automático

`npm run verify`: **85/85 checks PASS**.

Cobertura del verificador:
- separación `public/` / `private/`;
- ausencia de costos, SQL, seeds, tests e imágenes de referencia en `dist/`;
- precio desconocido sin `$0.00`;
- carrito y WhatsApp con total `por confirmar` cuando corresponde;
- gutters y protecciones de overflow móvil;
- búsqueda y colores en español;
- seed `draft`, stock 0 y no destructivo;
- validación de edición masiva;
- upload mínimo 800×800;
- validación previa a publicación;
- Supabase JS fijado a 2.117.2;
- ausencia de `innerHTML` en JS propio;
- tarjetas accesibles con enlace semántico + Espacio y drawers con foco contenido/restaurado;
- `external_url` heredada sin permiso SELECT público;
- RLS/Storage/auditoría/updated_at;
- URL de producto sin `_redirects`;
- URL del sitio/Supabase por variables de build;
- sintaxis de todos los JS;
- build completo a `dist/`.

## Prueba HTTP local de la salida

Servido únicamente `dist/`:

- `/` → 200
- `/catalogo.html` → 200
- `/admin/` → 200 (el HTML del login puede cargarse; los datos siguen protegidos por Auth/MFA/RLS y se recomienda Cloudflare Access)
- `/data/private-seed.csv` → 404
- `/private/data/private-seed.csv` → 404
- `/supabase/seed.sql` → 404
- `/README.md` → 404

## Pendiente necesariamente de infraestructura real

No se puede validar sin las cuentas del propietario:
- login/MFA real contra el proyecto Supabase;
- RLS ejecutada dentro de ese proyecto;
- Cloudflare Access;
- headers aplicados por un Preview de Cloudflare;
- Web Analytics;
- imágenes HD finales autorizadas;
- precios y cantidades reales del inventario.

El código bloquea la publicación normal de productos sin precio >0, stock real e imagen de Storage por color con stock. El esquema añade además validación de servidor y deriva `available` de stock + imagen para evitar exposición accidental.

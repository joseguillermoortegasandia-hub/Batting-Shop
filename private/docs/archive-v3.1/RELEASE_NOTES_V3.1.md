# Batting Shop V3.1 — correcciones de pre-lanzamiento

Esta revisión parte de los problemas detectados en V2/V3 y prioriza no publicar datos privados ni inventario falso.

## Corregido

- La salida desplegable es exclusivamente `dist/`, generada desde `public/`. `private/` nunca se copia.
- Costos, stock exacto, SKU y URL de proveedor permanecen en `inventory_private` y bajo RLS/MFA.
- La columna heredada `product_images.external_url` no tiene SELECT público; tienda y Admin usan únicamente imágenes del bucket `product-images`.
- Precio desconocido se representa como “Consultar precio / por confirmar”; nunca como `$0.00`.
- Gutter móvil y overflow horizontal del catálogo corregidos.
- Badge vacío y botón cerrar carrito corregidos.
- Búsqueda en español con normalización de acentos y sinónimos.
- Seed no destructivo: productos borrador, stock 0, sin imágenes antiguas.
- Edición masiva valida vacío, 0 y porcentajes sobre productos sin precio.
- Supabase JS fijado a 2.117.2 y CSP restringida; no se inventó un SRI sin bytes verificables.
- No `_redirects`; ruta estable `/producto/?slug=...&color=...`.
- `SITE_URL` se obtiene de variables de build/Cloudflare.
- Capturas viejas no están en `public/`; Admin requiere imágenes autorizadas >=800×800.
- Tarjetas son enlaces semánticos y admiten Espacio; drawers contienen/restauran foco.
- Admin y tienda comparten Supabase, con Auth + MFA + RLS, upload real, variantes, CSV, edición masiva, preview y auditoría.
- Triggers derivan Disponible/Agotado de stock real + imagen final por color.

## Antes de abrir a clientes

1. Crear/configurar Supabase y desactivar signup público.
2. Ejecutar `private/supabase/schema.sql`, crear el admin y luego el seed inicial si corresponde.
3. Cargar precios de venta reales y cantidades reales.
4. Subir imágenes HD autorizadas desde Admin para cada color con stock.
5. Configurar Cloudflare Access para `/admin/*`.
6. Configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en Cloudflare Pages.
7. Hacer Preview con `NOINDEX=1`, ejecutar `npm run verify` y probar móvil/desktop/WhatsApp.
8. Activar el dominio definitivo y Cloudflare Web Analytics.

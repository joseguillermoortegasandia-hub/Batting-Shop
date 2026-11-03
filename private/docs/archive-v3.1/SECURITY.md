# Seguridad — Batting Shop V3.1

- Solo `dist/` se despliega. `private/` nunca sale al público.
- Costos, stock exacto, SKU y URL de proveedor viven en `inventory_private`.
- El catálogo usa RLS y únicamente recibe `available` como booleano.
- Admin requiere Supabase Auth + usuario en `admin_users` + MFA AAL2.
- Recomendado: Cloudflare Access delante de `/admin/*`.
- Registro público de Supabase debe estar desactivado.
- Nunca usar `service_role` en navegador.
- Strings del catálogo se renderizan con `textContent`/DOM, no con `innerHTML`.
- CSP, frame protection, `nosniff`, permissions policy y noindex del Admin están en `_headers`.
- Supabase JS está fijado a la versión 2.117.2; no usa `@2` flotante. No se inventó un hash SRI sin verificar los bytes exactos del bundle.
- Product images se publican desde el bucket propio y el Admin exige 800×800 px como mínimo.

- Los assets exclusivos del Admin viven en `/admin/assets/` para quedar cubiertos por Cloudflare Access sobre `/admin/*`.

- Las imágenes públicas se consumen únicamente desde `storage_path`; la columna heredada `external_url` no tiene SELECT público.
- Menús/carrito mantienen el foco dentro del drawer y lo devuelven al botón que lo abrió.

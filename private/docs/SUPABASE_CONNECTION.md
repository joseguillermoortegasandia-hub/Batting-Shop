# Conexión de la vista previa

Configurado el 3 de noviembre de 2026 (America/Caracas).

- Proyecto: Batting Shop, referencia iacpoemfzvfcvpqwhsgw, región us-east-1.
- Migraciones 001–004 y restrict_function_grants aplicadas al proyecto nuevo.
- Importación inicial del ZIP retirada al recibir la indicación del propietario. Estado verificado: 0 productos, 0 variantes, 0 inventarios, 0 imágenes. No volver a ejecutar seed.sql. El propietario cargará sus productos.
- La vista previa usa clave publicable; no se guardó service_role ni clave secreta. `.env.local` está ignorado por Git. Las consultas fetch mandan apikey; Authorization solo se añade para compatibilidad con claves JWT legacy.
- RPC get_public_catalog comprobada con la clave publicable por HTTP y con rol anon en SQL: 5 categorías, 0 productos; página local cargada sin loader de error.
- Anon no puede hacer SELECT directo sobre products, product_variants, inventory_private, product_slug_aliases ni audit_log; todas tienen FORCE RLS. Storage permite SELECT de objetos solo a admin.
- Solo las cuatro RPC de lectura conservan SECURITY DEFINER accesible a anon. Los [avisos 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) restantes corresponden a esas RPC deliberadamente públicas y a is_admin/is_authorized_admin para usuarios autenticados. Los helpers internos ya no pueden invocarse directamente.
- `pnpm run verify`: 38/38. Falta configurar cuenta admin/MFA y ajustes de Auth en el servicio antes de administrar productos; no se creó una cuenta ni contraseña por el propietario. No hay despliegue de Cloudflare configurado.

Para reconstruir la vista: `pnpm run build:local`. Para iniciar el servidor: `pnpm run preview`. El sitio está en http://localhost:8080/.

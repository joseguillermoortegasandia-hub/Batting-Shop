# Revisión de seguridad y rendimiento

Rama: fix/store-security-performance. Base: ca168f6 (v4.0.0-stage3-original).

## Inventario y organización

Los 106 originales: 48 públicos, 42 privados y 16 de raíz. El total del repositorio no mide el peso que carga un visitante. Las referencias, SQL, seeds, tests e informes no se publican; el build los excluye. Los informes Stage 2/3 se movieron a private/docs/archive-stage2-stage3 conservando su contenido. Los archivos nuevos son migración/rollback, Worker legible, pruebas y procesamiento de imágenes; no se borraron versiones históricas.

Las fotos originales incluidas son referencias pequeñas; la mayor imagen pública es logo.png (119302 bytes), no hay fotos de 5 MB en esta entrega. El riesgo estaba en futuras subidas sin compresión; ahora se procesa la imagen antes de enviarla. Los 25 JPG de referencia generados pesan entre 4155 y 24806 bytes cada uno. artifacts y node_modules están ignorados y no se suben.

schema.sql es una instalación acumulativa; las migraciones son necesarias para bases existentes. Mantener ambos duplica SQL deliberadamente y no afecta a la tienda pública. Se valida sintaxis SQL/PLpgSQL localmente; eso no comprueba permisos ni ejecución contra Supabase real.

## Dependencias y claves

Única dependencia directa: @supabase/supabase-js 2.117.2, fijada; pnpm-lock.yaml conserva integridad y 9 paquetes resueltos. pnpm audit consultó el registro y devolvió 0 vulnerabilidades conocidas en todas las severidades. No implica ausencia absoluta de vulnerabilidades. El SDK solo se carga en admin; el público usa fetch con timeout y un reintento. Instalación realizada con ignore-scripts y paquete gestor fijado; preinstall rechaza instalación con npm.

No se encontraron tokens privados reconocibles en los archivos versionados revisados. .env.example contiene placeholders. Configuración pública y build rechazan claves service_role/sb_secret. El origen Supabase se inyecta exactamente en CSP; costos/SKU/seeds permanecen fuera de dist. La cuenta/repo se mantienen privados; no se cambiaron credenciales ni configuración del servicio.

## Cambios y límites

Favoritos con 40px visuales/44px táctiles, corazón 20px relleno rojo activo; ficha 44px junto al título. Carrito por líneas, controles 40px, revalidación al abrir y wa.me nativo con ventana de 2 minutos; precio cambiado/agotado exige nueva pulsación. Loader con logo/softball 56px, 350ms/400ms/12s y salida por WhatsApp. Error de red distinto a catálogo vacío. Texto público >=12px y summaries >=44px.

Worker solo producto, follow de redirección de asset una vez, timeout 2.5s, caché de datos 60s y OG canónico/JPG. Storage 004 limita listar a admin y RPC carrito a 50 ids. Catálogo envía categorías una sola vez con category_id. Admin valida correo, números, slugs, CSV, URLs e imágenes, y cierra sesión inactiva a 30min. Los cambios de infraestructura/Auth listados en README siguen pendientes de aplicación manual en los servicios reales.

Duplicados exactos detectados en la base (se conservan si forman parte de entregas históricas):

## Resultado final de pruebas locales

- `npm run build`: PASS, salida 0. No se instalaron dependencias con npm.
- `pnpm run verify`: 38/38 PASS, salida 0. Incluye sintaxis SQL de 10 archivos, PL/pgSQL 004, entradas CSV/sesión admin, build preview/producción, claves reconocibles y contrato simulado del Worker.
- `npm run test:browser`: 237/237 PASS, salida 0, Google Chrome en Windows con RPC interceptadas.
- `pnpm audit --json`: 0 vulnerabilidades conocidas, 9 dependencias resueltas. Se consultó el registro de seguridad.
- Instalación offline con `pnpm install --frozen-lockfile --offline --ignore-scripts`: PASS.
- Capturas: 24 PNG de las seis vistas en 320/390/768/1366; también se validó diseño en 360/412/1024/1920. Salida en artifacts/screenshots; no se incluyen fixtures en el sitio desplegado.

Logs completos locales: artifacts/build-final.log, artifacts/verify-final.log, artifacts/browser-final.log y artifacts/dependency-audit.json. Los JPG de las 25 referencias están en artifacts/reference-derivatives. Los artefactos generados no forman parte del código de producción.

No ejecutado: migración/rollback y políticas en Supabase real, login/MFA real, Storage remoto, Cloudflare Pages/Workers y sus headers en producción, acceso al bucket como anon/admin real, vistas previas reales de WhatsApp/Facebook y navegación en iPhone/Instagram. No se desplegó ni se alteró la infraestructura. Antes de desplegar: aplicar 004, revisar políticas adicionales y variables de build/runtime en ambos entornos, y realizar esas pruebas de integración. El registro de npm y la descarga de dependencias sí estuvieron accesibles durante esta revisión.

# Revisión previa al despliegue — 2026-11-04

## Resultado

El código compila y pasa las pruebas. La publicación todavía requiere crear/configurar los dos proyectos de Cloudflare y cerrar los pendientes de Auth. No se publicó ningún sitio ni se agregaron productos reales.

| Comprobación | Resultado |
|---|---|
| Instalación pnpm --frozen-lockfile | Correcta |
| pnpm run verify | 44/44 |
| npm run test:browser | 379/379 |
| pnpm run test:panel | Correcto: cuenta no autorizada rechazada, formulario validado y publicación con color, fotos, cantidad e inventario simulados |
| pnpm run test:pages | 15/15 con Pages/workerd nativo; RPC simulada |
| pnpm run check:live | 9/9 comprobaciones reales de lectura/permisos; signup pendiente |
| pnpm audit | 0 vulnerabilidades conocidas, 100 paquetes resueltos (incluidas herramientas y opcionales) |
| Sintaxis, separación y búsqueda de claves privadas versionadas | Incluidas en verify; correctas |

Node probado: v24.14.1. .node-version selecciona la línea mantenida 24 para los builds y package.json exige >=24 <25. pnpm 11.5.1, Wrangler 4.157.0, runtime workerd 1.20261103.1. Las acciones de GitHub se fijan a commits oficiales; el workflow no despliega y todavía no se ha verificado su ejecución remota.

## Cambios de preparación

- Dos plantillas de Pages, salidas dist y dist-panel, compatibility_date 2026-11-04 y selector explícito de plantilla para CLI.
- Plantilla de variables de producción, sin secretos. Archivos locales reales, .dev.vars y estado de Wrangler ignorados por Git.
- Builds públicos rechazan HTTP remoto, URLs con rutas, parámetros o credenciales. Se conservan localhost para pruebas y noindex en previews.
- Configuración pnpm trasladada de .npmrc a pnpm-workspace.yaml, conforme a pnpm 11; workerd es el único script de dependencia autorizado.
- Verificación automática de GitHub, con lectura de repositorio y sin permisos de despliegue.

## Comprobaciones reales de Supabase

Proyecto iacpoemfzvfcvpqwhsgw, ACTIVE_HEALTHY. Migraciones aplicadas hasta product_order_quantity. Propietario confirmado con rol owner; conserva su acceso por contraseña sin 2FA obligatorio.

Products, product_variants, inventory_private, product_slug_aliases y audit_log tienen RLS y FORCE RLS. Anon no tiene SELECT directo. El catálogo y carrito funcionan por RPC; 51 ids producen el error esperado. Anon no lista fotos. Bucket product-images público para URLs conocidas, límite de 5 MB y MIME JPEG/PNG/WebP; las cuatro políticas de administración exigen is_admin(). La base estaba sin productos durante esta revisión.

## Pendientes antes de abrir el panel remoto

1. Desactivar Allow new users to sign up en Supabase Auth: /auth/v1/settings todavía devuelve disable_signup=false. Esto impide nuevas cuentas; no elimina al propietario. No se pudo cambiar desde el conector y la automatización de Chrome se detuvo al no poder verificar con confianza la URL. No se intentó eludir esa restricción.
2. Crear/conectar cuenta Cloudflare, escoger los dos nombres y configurar variables de build/runtime tanto en producción como preview, según private/deploy/PAGES.md. Los nombres de las plantillas son propuestas sin reservar.
3. Configurar y probar Access en el hostname de producción del panel y en sus previews/alternativas. El interruptor de Pages para previews no protege por sí solo el hostname de producción. El Worker responde 503/403 mientras no se complete la configuración y no entrega el panel.
4. Revisar límites de login y URL de recuperación cuando se elijan las direcciones finales. No se cambió la contraseña ni se activó CAPTCHA. La protección contra contraseñas filtradas continúa desactivada; el asesor de Supabase lo señala.

## Límites de la revisión

El flujo de publicación/fotos se probó con API y archivos locales simulados. No se insertaron productos ni fotos de prueba en Supabase. La primera carga real la hará el propietario y permitirá verificar las URLs públicas y las tarjetas de WhatsApp/Facebook. La prueba nativa de Pages es local: DNS, certificados, caché distribuida, políticas reales de Access y Safari/iPhone/Instagram deben probarse después del despliegue de revisión.

Los asesores de Supabase también señalan las funciones SECURITY DEFINER públicas: corresponden a las cuatro RPC intencionales y dos funciones de permisos; sus grants no se ampliaron en esta preparación. Mantienen search_path fijo y filtros de publicación/autorización. Documentación del aviso: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable .

Evidencias: artifacts/predeploy-verify.log, predeploy-browser.log, predeploy-panel.log, predeploy-pages.log, predeploy-live.json y predeploy-dependency-audit.json. Capturas de móvil/escritorio en artifacts/screenshots y artifacts/panel-editor-unified-*.png.

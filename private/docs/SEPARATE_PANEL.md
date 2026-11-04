# Tienda y panel en aplicaciones independientes

La tienda y el panel comparten únicamente los datos autorizados de Supabase. No se copiaron ni agregaron productos a la base de datos durante esta separación.

| Aplicación | Fuente | Comando de build | Carpeta que se publica | Vista local |
| --- | --- | --- | --- | --- |
| Tienda | public/ | pnpm run build | dist/ | http://localhost:8080/ |
| Panel | panel/ | pnpm run build:panel | dist-panel/ | http://localhost:8081/ |

Para reconstruir con la configuración local ignorada por Git: `pnpm run build:local` y `pnpm run build:panel:local`. Después, en terminales separadas, ejecutar `pnpm run preview` y `pnpm run preview:panel`. Ambos servidores están enlazados exclusivamente a 127.0.0.1. Nunca publicar la raíz del repositorio ni servirla como carpeta web.

## Qué se retiró del sitio público

public/admin fue trasladado a panel/. La salida dist/ no contiene HTML, CSS, JavaScript, plantillas de importación, enlaces, configuración ni SDK de autenticación del panel. La compilación pública ya no necesita ni copia supabase-js; sus consultas siguen siendo fetch a las cuatro RPC públicas. Las rutas antiguas /admin, /admin/, /admin/index.html, /admin/assets/* y las rutas del panel no tienen archivos en dist/ y devuelven 404. No hay redirección desde la tienda a la ubicación privada.

Un control del build rechaza archivos/rutas o referencias del panel en la salida pública. Las pruebas HTTP verifican también rutas antiguas y codificadas, no solo el menú. El repositorio continúa siendo privado; su contenido completo no se publica como un único sitio.

## El diseño con catálogo vacío

El inicio conserva la presentación, el logo, los beneficios, la guía de tallas y el pie aunque todavía no existan productos. Próximamente aparece únicamente en la sección del catálogo. Esto permite revisar el diseño sin cargar productos ficticios. El panel incluye un enlace Ver tienda al origen público, incluso en la pantalla de login; la tienda no incluye el enlace inverso.

## Publicación futura en Cloudflare

Actualmente no hay cuenta Cloudflare ni dominio conectados. La separación está implementada y disponible localmente; los dos sitios todavía no se han publicado en Internet. No se creó una cuenta externa ni se contrató un dominio.

Se pueden crear dos proyectos de Pages conectados al mismo repositorio privado, con los comandos y carpetas de la tabla. Un único dominio puede usar www y panel como subdominios. También es posible comenzar con direcciones del proveedor; no hace falta comprar dos dominios.

Variables del build de tienda: SUPABASE_URL, SUPABASE_ANON_KEY (clave publicable), SITE_URL en producción. El Worker de fichas requiere también las variables públicas de Supabase en runtime, como antes.

Variables del build del panel: SUPABASE_URL, SUPABASE_ANON_KEY, PANEL_URL (o CF_PAGES_URL), STOREFRONT_URL. En Internet, ambos orígenes deben ser HTTPS y distintos. No introducir claves service_role ni sb_secret. La CSP permite únicamente el origen exacto del proyecto Supabase.

Crear una aplicación de Cloudflare Access para el hostname completo del panel y una política Allow limitada a los correos del propietario/personal autorizado. Proteger también previews y direcciones alternativas. No usar políticas Everyone o Bypass para el panel.

Variables **de ejecución** del Worker del panel (en producción y preview):

- CF_ACCESS_TEAM_DOMAIN: https://TU-EQUIPO.cloudflareaccess.com
- CF_ACCESS_AUD: AUD de la aplicación Access del panel.
- PANEL_ALLOWED_EMAILS: correos autorizados separados por comas; esta lista no se incorpora al código que recibe el navegador.

El Worker protege todos los archivos, incluidas imágenes, configuración y SDK. Sin variables válidas responde 503 sin entregar la aplicación. Sin token Access válido responde 403; verifica firma RS256 con las claves oficiales del equipo, emisor, audiencia, caducidad y correo permitido. Un header con un correo escrito a mano no autentica. El Worker no tiene bypass para localhost; las vistas locales usan servidores estáticos enlazados a loopback.

Cloudflare Access es una puerta adicional. El panel conserva su login Supabase, comprobación de admin_users y RLS. Tener la URL, el HTML o la clave publicable no concede permiso para editar inventario. El propietario ya está autorizado; falta configurar Cloudflare Access al publicar. La separación no convierte una cuenta normal de Supabase en administrador.

Para el primer acceso: crear el usuario de la tienda en Authentication → Users del proyecto Supabase, con una contraseña definida por el propietario. Esto no requiere crear otra cuenta del servicio Supabase ni compartir la contraseña con el asistente. Una vez creado y verificado, se añade su UUID a public.admin_users con role owner mediante una operación autorizada de administración. El panel permite entrar con correo y contraseña, sin exigir 2FA por decisión del propietario. No escribir hashes de contraseñas ni crear identidades directamente mediante SQL.

`pnpm run test:panel` prueba login con contraseña, rechazo de cuentas sin permiso, validación de un formulario vacío y guardado de producto/variante/inventario como borrador con una API simulada. No crea productos ni usuarios en el proyecto real. Los errores de guardar se muestran como avisos y el botón se bloquea mientras termina la operación para evitar duplicados.

## Verificación

`pnpm run verify` incluye builds separados, ausencia de recursos privados en tienda, nueve rutas con 404 y pruebas criptográficas del Worker con tokens reales generados localmente (válidos/falsificados/expirados, emisor/audiencia/correo incorrectos). `pnpm run test:browser` abre tienda y panel en dos orígenes, comprueba almacenamiento separado, pantalla de login y enlace Ver tienda, además del smoke de diseño y procesamiento de fotos. Todas estas pruebas usan fixtures locales, sin escribir productos en Supabase.

Pendiente al publicar: comprobar DNS, política real de Access, correos autorizados, HTTPS, Auth y los headers de ambos sitios en los dominios definitivos. No afirmar que Access está activado antes de configurarlo en la cuenta real.

Resultado local: verify 41/41; smoke de navegador 272/272; auditoría pnpm sin vulnerabilidades conocidas (37 paquetes resueltos, incluidas variantes opcionales de plataforma). Logs en artifacts/split-verify-final.log, artifacts/split-browser-final.log y artifacts/split-dependency-audit.json. jose 6.2.15 valida los JWT; esbuild 0.28.2 lo incorpora al Worker privado. Ambas versiones están fijadas y no se cargan en la tienda. También se generaron capturas del inicio vacío en 320/390/768/1366.

Fuentes oficiales: [dos proyectos en un repositorio](https://developers.cloudflare.com/pages/configuration/monorepos/), [protección de la aplicación](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [validación de JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Acceso del propietario sin 2FA

Por solicitud del propietario, battingshop.ve@gmail.com puede acceder con correo y contraseña. La excepción se valida en is_admin() contra el correo confirmado y el rol owner en admin_users; no se aplica a otras cuentas administradoras, que conservan AAL2. El panel consulta is_admin() antes de mostrar los datos.

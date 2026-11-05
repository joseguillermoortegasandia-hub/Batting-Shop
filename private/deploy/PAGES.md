# Preparación de Cloudflare Pages

Estado al 2026-11-04: configuración del repositorio preparada; no se crearon proyectos ni se publicó ningún sitio. Los nombres batting-shop y batting-shop-panel son propuestas, no direcciones reservadas.

## Dos proyectos desde el mismo repositorio privado

| Ajuste | Tienda | Panel |
|---|---|---|
| Framework | None | None |
| Directorio raíz | / | / |
| Rama de producción inicial | fix/store-security-performance | fix/store-security-performance |
| Comando de build | pnpm run build | pnpm run build:panel |
| Salida | dist | dist-panel |
| Node | 24 | 24 |
| pnpm | 11.5.1 | 11.5.1 |

Cuando se fusione esta rama a main, cambiar la rama de producción de ambos proyectos y PRODUCTION_BRANCH juntos. main todavía conserva la versión original: no publicarla por accidente.

Variables de build, producción y preview:

- Ambos: SUPABASE_URL=https://iacpoemfzvfcvpqwhsgw.supabase.co y SUPABASE_ANON_KEY con la clave publicable, NODE_VERSION=24, PNPM_VERSION=11.5.1.
- Tienda: SITE_URL con el origen HTTPS definitivo y PRODUCTION_BRANCH con la rama de producción elegida.
- Panel: PANEL_URL con su origen HTTPS y STOREFRONT_URL con el de la tienda; deben ser distintos.
- En previews, el build público añade noindex automáticamente. El panel siempre es noindex.

Variables de runtime, producción y preview:

- Worker de tienda: SUPABASE_URL y SUPABASE_ANON_KEY iguales a los usados para compilar.
- Worker de panel: CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD y PANEL_ALLOWED_EMAILS=battingshop.ve@gmail.com.

Configurar Cloudflare Access para el panel y sus URLs alternativas/previews, con una política limitada al propietario. La integración de Access para previews no debe confundirse con la protección de producción; comprobar ambas. Sin Access configurado el panel responde 503; sin sesión Access válida, 403. No eliminar esa comprobación para hacer funcionar el despliegue. El login de Supabase del propietario permanece con correo y contraseña, sin 2FA obligatorio.

La plantilla .env.production.example no contiene credenciales privadas. Copiar sus valores reales al dashboard; no subir .env.production.local al repositorio. No introducir service_role, sb_secret ni tokens de Cloudflare en variables públicas.

## Configuración de Wrangler

wrangler.store.jsonc y wrangler.panel.jsonc son plantillas de selección. Pages lee wrangler.jsonc; no selecciona automáticamente los dos archivos por nombre. Para uso local o publicación futura mediante CLI:

- pnpm run configure:pages store copia la plantilla de tienda a wrangler.jsonc.
- pnpm run configure:pages panel copia la plantilla de panel a wrangler.jsonc.

El comando solo prepara configuración; no publica. wrangler.jsonc está ignorado para no mezclar las dos aplicaciones. Con Git integration, usar la matriz del dashboard y fijar compatibility_date=2026-11-04. No configurar variables en una plantilla de Wrangler sin definir también los entornos correspondientes: pueden sobreescribir los valores del dashboard.

## Supabase antes de publicar

En Authentication, desactivar Allow new users to sign up. La consulta real /auth/v1/settings todavía devuelve disable_signup=false. El propietario ya existe y está confirmado; desactivar nuevos registros no elimina su cuenta. El conector no permite cambiar Auth y la automatización de Chrome se detuvo porque no pudo determinar la URL con confianza: este ajuste no está hecho.

Configurar Site URL/Redirect URLs al origen final del panel si se activa recuperación de contraseña. El flujo actual solo usa correo/contraseña; no depende de redirects OAuth. Revisar los límites de intentos de Auth antes de abrir el panel a Internet. No se configuró CAPTCHA ni se cambió la contraseña del propietario.

## Verificaciones tras desplegar

1. Home, catálogo y tallas: HTTPS y 200; HTML sin caché, JS/CSS 1 hora, imágenes 1 día.
2. /admin/ y recursos del panel en la tienda: 404.
3. Panel, configuración y assets: no accesibles sin Access; probar cuenta autorizada y login de Supabase.
4. Cuando el propietario publique su primer producto, probar fotos reales y GET /producto/<slug>/ con title y og:title correctos; WhatsApp/Facebook y Safari/iPhone/Instagram requieren comprobación en dispositivos reales.
5. Revisar DNS/certificados, headers, canonical y robots en los orígenes definitivos. Si la tienda está vacía, se mantiene Próximamente en el catálogo.

Pruebas preparadas: pnpm run verify, pnpm run test:browser, pnpm run test:panel, pnpm run test:pages y pnpm run check:live. La última consulta Supabase real sin modificar productos y registra pendientes de Auth en artifacts/predeploy-live.json.

Referencias: https://developers.cloudflare.com/pages/configuration/build-configuration/ , https://developers.cloudflare.com/pages/functions/wrangler-configuration/ , https://developers.cloudflare.com/pages/configuration/preview-deployments/ .

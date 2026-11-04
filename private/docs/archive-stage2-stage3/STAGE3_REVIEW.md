# Batting Shop V4 — Revisión Etapa 3

## Alcance completado

Esta entrega parte de Etapa 2 y completa lo reservado para Etapa 3: alias de slugs, redirección de enlaces históricos y CSV dinámico `attr:`. Mantiene todas las funciones previas: categorías dinámicas, Pelotas inactiva, precio por variante, barra móvil, Favoritos, pedido por WhatsApp, loader, OG dinámico, admin con Auth/MFA/RLS y estado Próximamente.

## Decisiones importantes

### Slugs

Los slugs viejos no se borran. Un trigger los registra automáticamente como alias cuando cambia un slug. Para productos, `get_public_product()` acepta el alias y devuelve el producto con su slug actual; el Worker redirige a la URL canónica. Para categorías, la lista pública incluye sus alias y el catálogo reemplaza la URL antigua por la actual.

### CSV

El CSV ya no conoce categorías de forma rígida. El Admin consulta `categories` y `category_attributes`, por lo que una categoría nueva creada desde el Admin puede usar `attr:<clave>` sin modificar JavaScript. Las columnas de atributos vacías que pertenecen a otras categorías se ignoran; una columna `attr:` con valor que no exista para esa categoría sí se rechaza.

Todos los imports entran como borrador. Precio vacío sigue siendo `NULL`/Consultar precio, y stock debe ser un entero >= 0. No se inventan imágenes ni inventario.

## Riesgos pendientes de lanzamiento

- La migración 003 debe ejecutarse primero en un proyecto Supabase de staging real.
- Las fotos HD autorizadas y el stock/precio final siguen dependiendo de los datos reales del negocio.
- Cloudflare Access debe configurarse externamente para proteger `/admin/*` antes del lanzamiento.
- Debe probarse un enlace real antiguo después de cambiar un slug en staging para confirmar la redirección en el runtime de Cloudflare.

# Formulario único de productos

Información, cantidad por pedido, colores/tallas, stock, fotos y vista previa se muestran en un solo formulario. El botón Publicar producto guarda y publica; no hay selector de estado ni botón de borrador. Las importaciones CSV conservan su revisión independiente.

Las fotos nuevas se convierten y previsualizan localmente; solo se suben al publicar, como WebP, miniatura WebP y JPG para redes. El registro se mantiene internamente como draft mientras se completan variantes, inventario e imágenes; pasa a published al terminar. Esto evita exponer una carga incompleta. Si una operación falla, se puede corregir y reintentar desde el mismo editor; no se garantiza atomicidad entre Storage y las distintas peticiones REST.

max_order_quantity permite una unidad o hasta 99 por producto en el pedido, compartido entre sus variantes. La ficha ofrece selector de cantidad y el carrito respeta el límite tras consultar la RPC. Es un límite del flujo de pedido por WhatsApp, no una reserva ni un cobro automático de inventario.

El cursor de bate SVG de 32×32 se sirve en ambos sitios. Los campos de escritura mantienen cursor de texto y selección; el contenido normal usa el bate, sin caret visible. Se conserva la navegación con teclado.

Migración: 20261104141323_product_order_quantity.sql; rollback en private/supabase/rollback/ con el mismo nombre. La migración solo añade configuración y amplía los payloads públicos; no agrega productos.

Pruebas del editor y fotos: API simulada. No se subieron fotos ni se publicaron productos de prueba en Supabase real. Se comprobó en el proyecto real la columna, el acceso anon a las RPC y la ausencia de productos. Los avisos de SECURITY DEFINER corresponden a las RPC públicas y funciones de permisos ya existentes; no se amplían grants. Protección contra contraseñas filtradas permanece desactivada: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

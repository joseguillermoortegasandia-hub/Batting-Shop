# Batting Shop V4 — Changelog Etapa 2

## Experiencia móvil

- Barra inferior móvil: Inicio, Categorías, Pedido, Favoritos, Tallas.
- Pedido central elevado con contador.
- Carrito removido del header en móvil y conservado en escritorio.
- Favoritos locales sin cuenta.
- Bottom sheet de categorías dinámicas.
- Safe areas y padding inferior para que la barra no tape contenido/footer.

## WhatsApp

- Botón flotante de 56 px con color AA `#0b7a3e`.
- Número centralizado en configuración.
- Mensaje general fuera de la ficha y contextual dentro de producto.
- Se oculta/neutraliza cuando un overlay o CTA sensible requiere espacio.

## Loader

- Softball amarilla SVG propia (<3 KB).
- Delay de 350 ms para evitar parpadeos.
- Mínimo visible ~400 ms.
- Timeout 12 s y soporte de reintento.
- Reduced-motion cambia rodamiento por pulso.
- `BattingUI.withLoader()` disponible para catálogo y operaciones largas de admin.

## Categorías escalables

- Vista Categorías en Admin.
- Crear/editar/ordenar/activar/ocultar.
- `variant_mode` dinámico.
- Atributos con `scope product|variant`, tipo, opciones, filtros, obligatoriedad y orden.
- Vista previa de filtros.
- Editor de producto generado según categoría.
- Home, catálogo, filtros y búsqueda leen categorías/atributos de Supabase.

## Pelotas

- Categoría sembrada inactiva.
- Tipo, Tamaño, Material y Presentación.
- Presentación es atributo de variante.
- Precio por variante compatible con Unidad/Docena/Caja.

## URLs / social sharing

- Producto usa `/producto/<slug>/`.
- Redirección desde `/producto/?slug=`.
- Cloudflare worker inserta `og:title`, `og:description`, `og:url` y `og:image` por producto.
- Si la consulta de OG falla, se sirve el HTML genérico normal.

## Datos / RPC

- `product_colors.display_name` para nombres públicos traducidos.
- RPC pública actualizada para categorías, atributos y colores visibles.
- `get_public_cart_state()` revalida varias variantes de una vez.

## Límite de etapa

- No se añadieron alias de slugs.
- No se añadió CSV `attr:` dinámico.
- El Admin avisa que cambiar un slug rompe la URL anterior hasta completar Etapa 3.

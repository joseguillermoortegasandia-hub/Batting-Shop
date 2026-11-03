# Batting Shop V4 — Changelog Etapa 3

## Alias de URLs

- Se agregaron `product_slug_aliases` y `category_slug_aliases`.
- Cambiar el slug de un producto o categoría guarda automáticamente el slug anterior.
- La RPC `get_public_product()` resuelve slug actual o alias y devuelve el slug canónico actual.
- El Worker de Cloudflare ya existente detecta esa diferencia y redirige la URL antigua a la nueva.
- El catálogo público recibe alias de categoría y normaliza `?categoria=<slug-antiguo>` al slug actual sin mostrar error.
- Los alias están protegidos por RLS; no se exponen como tablas públicas directas.
- Se agregó auditoría para creación/cambio/eliminación de alias.

## CSV dinámico `attr:`

- La importación deja de depender de `audience` o de columnas rígidas por categoría.
- Columnas base: `code`, `slug`, `name`, `brand`, `category`, `price`, color/talla cuando aplique, `sale_price`, `stock`, costo y datos privados de proveedor.
- Atributos configurables usan `attr:<clave>`, por ejemplo `attr:edad_nivel`, `attr:material`, `attr:presentacion`.
- El Admin valida cada `attr:` contra la categoría real y su scope (`product` o `variant`).
- `select`, `multiselect`, `number` y `boolean` se validan según la definición de la categoría.
- Multiselect usa `|` dentro de la celda.
- Las variantes se identifican mediante una `variant_key` determinista construida desde color, talla y atributos de variante.
- Todos los productos importados quedan en `draft`.
- Importar una categoría distinta limpia atributos que no pertenecen a la categoría nueva, sin tocar otros datos fuera del alcance de la importación.
- Una plantilla CSV dinámica se genera desde el Admin con los atributos actualmente configurados.

## Seguridad / mantenimiento

- La migración 003 es idempotente y no elimina datos.
- El prelaunch audit revisa colisiones entre slugs actuales y alias.
- `schema.sql` quedó actualizado como snapshot acumulado 001+002+003.
- El plan de rollback conserva alias para evitar romper enlaces históricos.

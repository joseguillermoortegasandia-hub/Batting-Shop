# Revisión de variantes, fotos, dashboard y cursor

## Campos de cada variante

Una variante es una combinación de color, talla y opciones con su propio inventario. Un producto nuevo empieza con una sola fila; al agregar variantes se muestran sus números. Cuatro filas no son cuatro funciones distintas ni una cantidad obligatoria. Combinaciones repetidas se rechazan antes de guardar.

| Campo | Uso |
|---|---|
| Color | Nombre base del color/diseño. |
| Nombre para el cliente | Etiqueta opcional que verá el comprador. Si Color está vacío, también se usa como nombre base. |
| Muestra de color (antes Hex) | Tono del selector; para Blanco escoger #FFFFFF. Es independiente del texto. |
| Precio variante USD | Opcional; vacío utiliza el precio general. |
| Stock | Unidades de esta variante. |
| Costo USD | Costo por unidad, privado; alimenta el valor de inventario. |
| SKU proveedor | Código de referencia del proveedor, opcional y privado. |
| URL proveedor | Enlace HTTPS de referencia, opcional y privado. |

Color asociado se llena con los colores de las variantes. Antes solo leía el nombre interno, por eso escribir Blanco únicamente en Color visible dejaba el selector vacío. Ahora admite ese caso, conserva la elección al editar otros campos y explica qué falta si todavía no hay colores. Las fotos elegidas se preparan localmente y se suben al publicar.

## Datos del dashboard

Los productos publicados/borradores se calculan con los productos leídos de Supabase; variantes no disponibles y valor del inventario salen de variantes e inventario privado. No se usan cifras de ejemplo. Cero se presenta como $0.00; si hay stock sin costo, el valor indica Por calcular. Se corrigió también la lectura de max_order_quantity al volver a editar un producto.

Los textos, nombres de columnas y reglas de negocio siguen siendo parte de la interfaz; no son datos de productos inventados. Las pruebas cambian los fixtures y comprueban que los indicadores se actualizan.

## CSV

Sirve para cargar varios productos desde Excel/Sheets como CSV UTF-8 separado por comas. Se descarga una plantilla con columnas base y atributos actuales, sin marca/categoría/producto de ejemplo prellenados. Se completa una fila por color/talla; las variantes de un producto comparten code. category usa el slug mostrado en Categorías. La importación mantiene borradores para que el propietario revise fotos antes de publicar. Subir una plantilla vacía muestra una explicación y no habilita importar.

## Cursor y estilos

La imagen entregada se aisló con transparencia y se exportó a PNG de 32×32, con hotspot 29,3. Ambos sitios usan el mismo asset. Los campos editables mantienen el cursor de texto. Los builds versionan los assets CSS/JS y el cursor según su contenido, para evitar estilos o cursores anteriores después de reconstruir.

Se retiró Sesión iniciada. El editor y la sección de fotos tienen padding adaptable, y las variantes se identifican por número. El servidor local ahora resuelve /producto/<slug>/ y envía no-store; sigue limitado a loopback y a dist/dist-panel del proyecto.

## Verificación

- verify: 44/44.
- browser_smoke: 462/462, incluyendo cursor en móvil/escritorio, navegación y recarga de cinco páginas, PNG de 32×32 y alfa transparente.
- admin_workflow_test: color visible sin nombre interno, una/cuatro filas, selección de foto, rechazo de combinaciones duplicadas, publicación simulada, cantidades persistidas, indicadores dinámicos, costos desconocidos, plantilla CSV vacía y cursor entre secciones/recarga.
- Capturas de fotos en 320/390/768/1366: artifacts/panel-fotos-*.png.
- Vistas reales de home, catálogo, tallas, ficha inexistente y login del panel: HTTP 200, no-store, assets/cursor versionados y recarga sin errores JavaScript. La ficha inexistente muestra el estado de producto no disponible; no se creó un producto para probarla.

No se agregaron productos ni fotos de producto al Supabase real. Las pruebas de publicación usaron una API simulada. Logs: artifacts/admin-refinements-test.log, admin-refinements-verify.log y cursor-browser-test.log.

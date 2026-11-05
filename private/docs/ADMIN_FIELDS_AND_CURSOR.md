# Revisión de variantes, fotos, dashboard y cursor

## Formulario de producto

Un producto nuevo tiene una sola presentación: Color, Muestra de color, Talla si la categoría la requiere, Stock y Costo USD (privado, para calcular el inventario). Solo se usa el precio general. Se retiraron la ayuda desplegable, Agregar variante, precio por variante, SKU y URL del proveedor. La plantilla CSV nueva tampoco ofrece esos tres últimos campos; el lector conserva compatibilidad con archivos antiguos.

Color asociado toma el color escrito en el formulario. Las fotos se preparan localmente y se suben al publicar. Si un producto antiguo tiene varias presentaciones guardadas, se edita una por vez mediante un selector; no se eliminan registros existentes al abrir ni al guardar. Los datos antiguos de proveedor se conservan sin mostrarse; al publicar se aplica el precio general a todas las presentaciones.

Los errores de publicación aparecen en un mensaje persistente dentro del pie del editor, visible incluso a 320 px. Las notificaciones y el loader se trasladan al diálogo abierto para que la capa modal no los oculte. Al cerrar vuelven al documento principal. Un fallo de red al publicar permite reintentar usando los identificadores ya guardados, sin crear un segundo producto.

## Datos del dashboard

Los productos publicados/borradores se calculan con los productos leídos de Supabase; variantes no disponibles y valor del inventario salen de variantes e inventario privado. No se usan cifras de ejemplo. Cero se presenta como $0.00; si hay stock sin costo, el valor indica Por calcular. Se corrigió también la lectura de max_order_quantity al volver a editar un producto.

Los textos, nombres de columnas y reglas de negocio siguen siendo parte de la interfaz; no son datos de productos inventados. Las pruebas cambian los fixtures y comprueban que los indicadores se actualizan.

## CSV

Sirve para cargar varios productos desde Excel/Sheets como CSV UTF-8 separado por comas. Se descarga una plantilla con columnas base y atributos actuales, sin marca/categoría/producto de ejemplo prellenados. Se completa una fila por color/talla; las variantes de un producto comparten code. category usa el slug mostrado en Categorías. La importación mantiene borradores para que el propietario revise fotos antes de publicar. Subir una plantilla vacía muestra una explicación y no habilita importar.

## Cursor y estilos

La imagen entregada se aisló con transparencia y se exportó a PNG de 40×40, con hotspot 36,4. Ambos sitios usan el mismo asset. Los campos editables mantienen el cursor de texto. Los builds versionan los assets CSS/JS y el cursor según su contenido, para evitar estilos o cursores anteriores después de reconstruir.

Se retiró Sesión iniciada. El editor y la sección de fotos tienen padding adaptable, y se muestra un solo bloque de color/talla/stock. El servidor local ahora resuelve /producto/<slug>/ y envía no-store; sigue limitado a loopback y a dist/dist-panel del proyecto.

## Verificación

- verify: 44/44.
- browser_smoke: 494/494, incluyendo cursor en móvil/escritorio, navegación y recarga de cinco páginas, PNG de 40×40 y alfa transparente.
- admin_workflow_test: formulario único, talla según categoría, color y fotos, errores sobre el modal (320 px), reintento sin duplicados, conservación de presentaciones antiguas, cantidades, indicadores dinámicos y plantilla CSV.
- Capturas de fotos en 320/390/768/1366: artifacts/panel-fotos-*.png.
- Vistas reales de home, catálogo, tallas, ficha inexistente y login del panel: HTTP 200, no-store, assets/cursor versionados y recarga sin errores JavaScript. La ficha inexistente muestra el estado de producto no disponible; no se creó un producto para probarla.

No se agregaron productos ni fotos de producto al Supabase real. Las pruebas de publicación usaron una API simulada. Logs actuales: artifacts/panel-final.log y artifacts/browser-final.log. El loader se mide con MutationObserver dentro del navegador; no mediante esperas del proceso externo.

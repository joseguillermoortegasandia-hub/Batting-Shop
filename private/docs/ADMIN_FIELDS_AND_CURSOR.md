# Productos, colores, tallas, facturas y cursor

## Carga de producto

1. Completar información y precio general del producto.
2. Escribir el primer Color. Los nombres comunes en español/inglés proponen un tono; Muestra de color permite ajustarlo.
3. Agregar tallas con stock y costo por talla si la categoría usa tallas. En categorías sin talla, completar directamente el inventario del color.
4. Agregar color crea otro grupo dentro del mismo producto. No crea otra tarjeta pública.
5. Fotos de este color selecciona el destino en Fotos del producto. Se pueden cargar varias fotos por color, ordenar y elegir su portada. Se exige al menos una foto para cada color con stock.
6. Publicar sube fotos preparadas y publica al terminar. Los errores permanecen visibles dentro del pie del diálogo, también a 320 px. Se puede reintentar sin duplicar el producto.

Cada combinación color/talla tiene su stock. Se rechazan combinaciones repetidas. La ficha pública cambia la galería y las tallas al cambiar de color; conserva la talla anterior si sigue disponible. Las tallas agotadas quedan deshabilitadas; los colores agotados permiten ver las fotos sin agregarlos al pedido. El carrito conserva color, talla e imagen de la combinación elegida.

## Productos e inventario

La selección individual y Seleccionar visibles actualizan el contador. Eliminar y Eliminar seleccionados exigen confirmación. Se eliminan registros dependientes mediante las relaciones CASCADE existentes; no se ejecutaron eliminaciones reales durante el desarrollo.

Duplicar conserva nombre, marca, descripción, atributos, precio, estado, destacado, límite de unidades, colores, tallas, stock, costo e imágenes. Solo genera las identidades, código y URL que deben ser únicos. Si el original estaba publicado, la copia también se publica. La operación bloquea clics repetidos; si falla, intenta retirar únicamente la copia incompleta que acaba de crear.

Las fotos comparten los archivos ya subidos con registros separados: eliminar una copia o quitar su imagen no borra el archivo del original. La limpieza física de huérfanos se deja para mantenimiento independiente. Los archivos nuevos de una subida fallida sí se retiran si aún no tienen un registro guardado.

Los indicadores del dashboard se calculan desde productos e inventario reales. Stock sin costo indica Por calcular. No se insertaron productos de demostración.

## Facturas

Facturas reemplaza Importar CSV; se retiraron navegación, formulario, lector y plantilla CSV. Se guarda nombre, número e imagen JPG/PNG/WebP (máximo 10 MB). La imagen se valida antes de enviarla. El bucket purchase-invoices es privado; la tabla purchase_invoices tiene RLS forzada y permiso solo para is_admin(). No existe lectura pública ni RPC de catálogo que incluya facturas.

El panel muestra URLs firmadas de cinco minutos, que se renuevan al entrar en Facturas. Eliminar factura requiere confirmación. La migración 20261105025353_private_purchase_invoices fue aplicada; su rollback exige exportar y vaciar las facturas antes de retirar el módulo. No toca productos.

## Portada y cursor

La portada utiliza columnas minmax(0,fr), limita fotos a su contenedor y evita que el tamaño intrínseco de una foto de producto agrande la página. Se comprobó con el catálogo real: escritorio a 1366 y 1920 px, portada de 380 px, imágenes de 242 px y sin desbordamiento.

El bate original transparente se empaqueta conservando proporciones y margen en un cursor nativo CUR de 48×48 con PNG de respaldo. El punto de clic está en el centro (24,24). En Productos, la casilla, la foto y los datos forman una sola zona de selección. Los campos editables conservan el cursor de texto. Ambos builds versionan CSS/JS y cursor por contenido para evitar caché antigua. El tamaño visual final también depende de la escala de pantalla y del sistema operativo.

## Pruebas

- verify: sintaxis JS/SQL, builds, separación y claves expuestas.
- admin_workflow_test: cuenta sin permiso, publicación incompleta, errores visibles sobre el modal a 320 px, reintento sin duplicados, colores/tallas/fotos, detección y ajuste de tono, conservación de datos anteriores, copia exacta del inventario, selección, cancelar/confirmar eliminación individual y múltiple, facturas con URL firmada y persistencia tras recargar. Todo mediante API simulada.
- browser_smoke: ocho anchos, navegación/recarga, galería por color, talla agotada, conservación de talla, carrito con color e imagen, loader, búsqueda y procesamiento de fotos.
- pages_runtime_test: 15 comprobaciones con workerd nativo; no es un despliegue remoto.
- Supabase real: esquema/bucket privados verificados; rol autenticado sin permiso ve cero facturas/archivos. check:live añade rechazo anon de facturas y listado del bucket.
- Logs: artifacts/panel-colors-final.log, browser-colors-final.log, verify-colors-final.log, pages-colors-final.log. Capturas: artifacts/home-real-corregida-*.png y artifacts/screenshots/ficha-colores-390.png.

No se crearon, editaron ni eliminaron productos reales. No se cargaron facturas reales. Login del propietario y subida real deben comprobarse con su sesión. Cloudflare remoto, distribución edge, WhatsApp/Facebook e iPhone/Instagram requieren validación tras configurar y desplegar los dos sitios.

## Referencias revisadas

- Nike Air Force 1: https://www.nike.com/t/air-force-1-07-mens-shoes-DZejrQoC/CW2288-111
- Adidas Essentials Gloves: https://www.adidas.com.au/essentials-gloves/JV5747.html
- Buckets privados: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Políticas Storage: https://supabase.com/docs/guides/storage/security/access-control

Las páginas públicas muestran producto, galería y tallas. Su administración interna no es pública; el editor se diseñó para el flujo de Batting Shop.

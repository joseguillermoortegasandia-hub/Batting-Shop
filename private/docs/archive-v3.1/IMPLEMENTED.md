# V3.1 implementado

Correcciones principales: separación `public/private`, build seguro a `dist`, precio desconocido sin `$0`, gutters móviles, catálogo sin overflow horizontal, carrito corregido, búsqueda en español, seed no destructivo con stock 0, validación de precios masivos, Supabase fijado, URLs de producto sin `_redirects`, dominio por entorno, eliminación de imágenes recortadas del build público, upload HD obligatorio, Auth+MFA+RLS, auditoría, Storage policies y validación previa a publicación.

Además, `available` ahora es derivado por triggers de base de datos: stock > 0 **y** imagen final en Storage para el color. No depende de un booleano editable manualmente. Una eliminación de la última imagen de un color hace que sus variantes dejen de estar disponibles públicamente hasta cargar una imagen válida.

V3.1 también endurece la exposición de imágenes heredadas (`external_url` no tiene SELECT público), añade soporte de Espacio en tarjetas y gestión de foco en drawers, y mantiene CSS/JS sin caché larga para evitar código obsoleto después de un despliegue.

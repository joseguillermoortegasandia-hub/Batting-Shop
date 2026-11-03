# Plan de rollback — Batting Shop V4 Etapa 3

## Regla principal

Antes de cada migración en producción, crea un backup/snapshot de Supabase. Aplica y valida primero en staging. Ningún rollback debe borrar inventario, costos, SKU, auditoría ni alias de URL ya usados por clientes.

## Orden de migraciones

1. `001_stage1_dynamic_catalog.sql`
2. `002_stage2_categories_pelotas.sql`
3. `003_stage3_slug_aliases.sql`

## Reversión

### 001 — Catálogo dinámico
Las columnas legacy se conservan para facilitar una reversión temporal. Si ya recibió datos reales, una reversión completa debe hacerse desde backup.

### 002 — Categorías escalables / Pelotas
`rollback/002_stage2_categories_pelotas.rollback.sql` hace una reversión conservadora. Para volver totalmente a una etapa anterior después de recibir datos reales, usa backup.

### 003 — Alias de slugs
`rollback/003_stage3_slug_aliases.rollback.sql` desactiva los triggers de captura/validación sin borrar las tablas de alias. Esto es deliberado: borrar alias puede romper enlaces viejos compartidos por WhatsApp, Instagram o Marketplace.

Si necesitas deshacer totalmente 003, restaura el backup previo. No borres manualmente alias en producción sin revisar primero qué enlaces ya fueron publicados.

## Si una migración falla

No continúes con la siguiente. Las migraciones están transaccionadas. Corrige en staging y vuelve a ejecutar la migración idempotente. Ejecuta `prelaunch-audit.sql` al terminar.

## Qué no hacer

- No ejecutar `seed.sql` para reconstruir stock o precios finales.
- No eliminar categorías con productos; desactívalas.
- No eliminar alias antiguos para “limpiar” la base si ya pudieron compartirse públicamente.
- No publicar la carpeta raíz del proyecto: Cloudflare debe servir únicamente `dist/`.

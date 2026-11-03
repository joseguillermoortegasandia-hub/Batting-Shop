-- Rollback conservador de Etapa 3.
-- IMPORTANTE: si los slugs ya cambiaron en producción, no borres los alias sin aceptar que enlaces antiguos dejarán de resolver.
begin;

drop trigger if exists products_capture_slug_alias on public.products;
drop trigger if exists products_guard_slug on public.products;
drop trigger if exists categories_capture_slug_alias on public.categories;
drop trigger if exists categories_guard_slug on public.categories;

-- No se eliminan tablas ni alias por defecto para preservar URLs antiguas.
-- Para una reversión completa, restaura el backup previo a la migración 003.

commit;

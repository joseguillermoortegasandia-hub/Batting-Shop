-- Batting Shop V4 Etapa 3 — auditoría previa al lanzamiento.
-- SOLO CONSULTA: no modifica inventario, precios, categorías ni productos.

-- 1) Inventario privado completo para verificar cantidades reales, costos y SKU.
select
  p.code,
  p.name,
  ccat.slug as category,
  p.status,
  p.price as general_price,
  pc.name as color_internal,
  coalesce(nullif(pc.display_name,''),pc.name) as color_public,
  v.size_label,
  v.normalized_size,
  v.size_sort_order,
  v.attributes as variant_attributes,
  v.sale_price as variant_price,
  v.available as public_available,
  i.stock,
  i.cost,
  i.provider_sku,
  i.provider_source_url
from public.products p
join public.categories ccat on ccat.id=p.category_id
join public.product_variants v on v.product_id=p.id
left join public.product_colors pc on pc.id=v.color_id
left join public.inventory_private i on i.variant_id=v.id
order by p.code,coalesce(pc.sort_order,0),v.size_sort_order,v.sort_order;

-- 2) Productos publicados que violarían alguna regla de publicación.
-- Precio NULL es válido: la tienda mostrará "Consultar precio".
select distinct p.code,p.name,p.status,c.slug as category
from public.products p
join public.categories c on c.id=p.category_id
where p.status='published' and (
  not c.is_active
  or not public.validate_category_attribute_payload(p.category_id,p.attributes,'{}'::jsonb,'product')
  or not exists (
    select 1 from public.product_variants v
    join public.inventory_private i on i.variant_id=v.id
    where v.product_id=p.id and i.stock>0
  )
  or exists (
    select 1 from public.product_variants v
    join public.inventory_private i on i.variant_id=v.id
    where v.product_id=p.id and i.stock>0
      and not public.variant_has_public_image(v.product_id,v.color_id)
  )
  or exists (
    select 1 from public.product_variants v
    join public.inventory_private i on i.variant_id=v.id
    where v.product_id=p.id and i.stock>0
      and not public.validate_category_attribute_payload(p.category_id,p.attributes,v.attributes,'variant')
  )
)
order by p.code;

-- 3) Imágenes legacy/externas. Antes de publicar, las imágenes finales deben estar en Storage.
select p.code,p.name,pi.id,pi.external_url,pi.storage_path,pi.active
from public.product_images pi
join public.products p on p.id=pi.product_id
where pi.external_url is not null or pi.storage_path is null
order by p.code,pi.sort_order;

-- 4) Productos con categoría/atributos inconsistentes.
select p.code,p.name,c.slug as category,p.attributes
from public.products p
join public.categories c on c.id=p.category_id
where not public.validate_category_attribute_payload(p.category_id,p.attributes,'{}'::jsonb,'product')
order by p.code;

-- 5) Variantes con stock positivo pero atributos de variante inválidos.
select p.code,p.name,v.id,v.size_label,v.attributes,i.stock
from public.products p
join public.product_variants v on v.product_id=p.id
join public.inventory_private i on i.variant_id=v.id
where i.stock>0
  and not public.validate_category_attribute_payload(p.category_id,p.attributes,v.attributes,'variant')
order by p.code,v.sort_order;

-- 6) Destacados: el total activo nunca debe superar seis.
select count(*) as featured_not_archived
from public.products
where featured and status<>'archived';

-- 7) Categorías y configuración visible actual.
select c.slug,c.name,c.is_active,c.show_on_home,c.variant_mode,c.option_label,c.sort_order,
       count(distinct p.id) as products_total,
       count(distinct p.id) filter(where p.status='published') as products_published
from public.categories c
left join public.products p on p.category_id=c.id
group by c.id
order by c.sort_order,c.name;

-- 8) Revisión de grants sensibles. anon NO debe tener SELECT directo sobre estas tablas.
select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('anon','authenticated')
  and table_name in ('products','product_colors','product_variants','inventory_private','product_images','audit_log')
order by grantee,table_name,privilege_type;

-- 9) Productos/categorías cuyos slugs no cumplen el formato esperado (debería ser imposible por CHECK).
select 'product' as entity,slug from public.products where slug !~ '^[a-z0-9-]+$'
union all
select 'category',slug from public.categories where slug !~ '^[a-z0-9-]+$';


-- 10) Alias que por error coincidan con el slug actual de otra entidad (debe devolver 0 filas).
select 'product' as entity,a.slug,a.product_id
from public.product_slug_aliases a
join public.products p on p.slug=a.slug and p.id<>a.product_id
union all
select 'category',a.slug,a.category_id
from public.category_slug_aliases a
join public.categories c on c.slug=a.slug and c.id<>a.category_id;

-- 11) Historial de alias para revisión antes del lanzamiento.
select 'product' as entity,p.code as owner,a.slug as old_slug,p.slug as current_slug,a.created_at
from public.product_slug_aliases a join public.products p on p.id=a.product_id
union all
select 'category',c.name,a.slug,c.slug,a.created_at
from public.category_slug_aliases a join public.categories c on c.id=a.category_id
order by created_at desc;

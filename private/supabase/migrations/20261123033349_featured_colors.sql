-- Cada color se destaca de forma independiente; conservar un color de cada modelo destacado.
alter table public.product_colors add column if not exists featured boolean not null default false;
with candidates as (
 select pc.id,row_number() over(partition by pc.product_id order by
   exists(select 1 from public.product_variants v where v.color_id=pc.id and v.available) desc,
   pc.sort_order,pc.name,pc.id) as position
 from public.product_colors pc join public.products p on p.id=pc.product_id
 where pc.active and p.featured
)
update public.product_colors pc set featured=true from candidates c where pc.id=c.id and c.position=1;
-- No limitar por cantidad de modelos: los destacados se eligen por color.
drop trigger if exists products_limit_featured on public.products;
CREATE OR REPLACE FUNCTION public.build_public_product(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object(
  'id',p.id,'slug',p.slug,'name',p.name,'brand',p.brand,'description',p.description,'price',p.price,'maxQuantity',p.max_order_quantity,'showOnCover',p.show_on_cover,
  'attributes',coalesce(p.attributes,'{}'::jsonb),'featured',case when exists(select 1 from public.product_colors x where x.product_id=p.id and x.active) then exists(select 1 from public.product_colors x where x.product_id=p.id and x.active and x.featured) else p.featured end,'createdAt',p.created_at,
  'category',jsonb_build_object(
    'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,'sortOrder',c.sort_order,
    'showOnHome',c.show_on_home,'homeLimit',c.home_limit,'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,
    'aliases',coalesce((select jsonb_agg(a.slug order by a.created_at,a.slug) from public.category_slug_aliases a where a.category_id=c.id),'[]'::jsonb),
    'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)
  ),
  'colors',coalesce((select jsonb_agg(jsonb_build_object(
    'id',pc.id,'name',pc.name,'label',coalesce(nullif(pc.display_name,''),pc.name),'hex',pc.hex,'sortOrder',pc.sort_order,'featured',pc.featured,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'thumbnailPath',im.thumbnail_path,'ogStoragePath',im.og_storage_path,'width',im.width,'height',im.height,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover) order by im.is_cover desc,im.sort_order,im.id) from public.product_images im where im.product_id=p.id and im.color_id=pc.id and im.active and im.storage_path is not null),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,'available',v.available,'maxAvailableQuantity',least(p.max_order_quantity,greatest(0,coalesce((select i.stock from public.inventory_private i where i.variant_id=v.id),0))),'sortOrder',v.sort_order) order by v.size_sort_order,v.sort_order,v.id) from public.product_variants v where v.product_id=p.id and v.color_id=pc.id),'[]'::jsonb)
  ) order by pc.sort_order,coalesce(nullif(pc.display_name,''),pc.name)) from public.product_colors pc where pc.product_id=p.id and pc.active),'[]'::jsonb),
  'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,'available',v.available,'maxAvailableQuantity',least(p.max_order_quantity,greatest(0,coalesce((select i.stock from public.inventory_private i where i.variant_id=v.id),0))),'sortOrder',v.sort_order) order by v.size_sort_order,v.sort_order,v.id) from public.product_variants v where v.product_id=p.id and v.color_id is null),'[]'::jsonb),
  'images',coalesce((select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'thumbnailPath',im.thumbnail_path,'ogStoragePath',im.og_storage_path,'width',im.width,'height',im.height,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover) order by im.is_cover desc,im.sort_order,im.id) from public.product_images im where im.product_id=p.id and im.color_id is null and im.active and im.storage_path is not null),'[]'::jsonb)
)
from public.products p join public.categories c on c.id=p.category_id
where p.id=p_product_id and p.status='published' and c.is_active;
$function$
;
revoke all on function public.build_public_product(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';

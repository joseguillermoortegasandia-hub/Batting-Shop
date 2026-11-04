begin;
drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_admin_read on storage.objects;
create policy product_images_admin_read on storage.objects for select to authenticated
using (bucket_id='product-images' and public.is_admin());
-- El bucket sigue público: las URLs conocidas siguen funcionando; listar requiere admin.
alter table public.product_images add column if not exists thumbnail_path text;
alter table public.product_images add column if not exists og_storage_path text;
alter table public.product_images add column if not exists width integer check(width>0);
alter table public.product_images add column if not exists height integer check(height>0);
create or replace function public.get_public_cart_state(p_variant_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
if coalesce(cardinality(p_variant_ids),0)>50 then raise exception 'El pedido admite un máximo de 50 ids.' using errcode='22023'; end if;
return (select coalesce(jsonb_agg(jsonb_build_object(
 'variantId',v.id,'slug',p.slug,'name',p.name,'available',v.available,
 'price',coalesce(v.sale_price,p.price),'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,
 'imagePath',coalesce((select im.storage_path from public.product_images im where im.product_id=p.id and im.active and im.storage_path is not null and ((v.color_id is not null and im.color_id=v.color_id) or (v.color_id is null and im.color_id is null)) order by im.is_cover desc,im.sort_order,im.id limit 1),(select im.storage_path from public.product_images im where im.product_id=p.id and im.active and im.storage_path is not null order by im.is_cover desc,im.sort_order,im.id limit 1)),
 'options',coalesce((select jsonb_agg(x.obj order by x.sort_order) from (
   select 5 sort_order,jsonb_build_object('label','Color','value',coalesce(nullif(pc.display_name,''),pc.name)) obj where pc.id is not null
   union all select 10,jsonb_build_object('label',coalesce(c.option_label,'Talla'),'value',v.size_label) where v.size_label is not null and coalesce(v.normalized_size,'')<>'ONE'
   union all select 100+a.sort_order,jsonb_build_object('label',a.label,'value',coalesce((select o->>'label' from jsonb_array_elements(a.options) o where coalesce(o->>'value',o->>'label')=v.attributes->>a.key limit 1),v.attributes->>a.key)) from public.category_attributes a where a.category_id=p.category_id and a.scope='variant' and v.attributes ? a.key
 ) x),'[]'::jsonb)
) order by array_position(p_variant_ids,v.id)),'[]'::jsonb)
from public.product_variants v join public.products p on p.id=v.product_id join public.categories c on c.id=p.category_id and c.is_active left join public.product_colors pc on pc.id=v.color_id
where v.id=any(p_variant_ids) and p.status='published');
end;
$$;
create or replace function public.build_public_product(p_product_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'id',p.id,'slug',p.slug,'name',p.name,'brand',p.brand,'description',p.description,'price',p.price,
  'attributes',coalesce(p.attributes,'{}'::jsonb),'featured',p.featured,'createdAt',p.created_at,
  'category',jsonb_build_object(
    'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,'sortOrder',c.sort_order,
    'showOnHome',c.show_on_home,'homeLimit',c.home_limit,'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,
    'aliases',coalesce((select jsonb_agg(a.slug order by a.created_at,a.slug) from public.category_slug_aliases a where a.category_id=c.id),'[]'::jsonb),
    'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)
  ),
  'colors',coalesce((select jsonb_agg(jsonb_build_object(
    'id',pc.id,'name',pc.name,'label',coalesce(nullif(pc.display_name,''),pc.name),'hex',pc.hex,'sortOrder',pc.sort_order,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'thumbnailPath',im.thumbnail_path,'ogStoragePath',im.og_storage_path,'width',im.width,'height',im.height,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover) order by im.is_cover desc,im.sort_order,im.id) from public.product_images im where im.product_id=p.id and im.color_id=pc.id and im.active and im.storage_path is not null),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,'available',v.available,'sortOrder',v.sort_order) order by v.size_sort_order,v.sort_order,v.id) from public.product_variants v where v.product_id=p.id and v.color_id=pc.id),'[]'::jsonb)
  ) order by pc.sort_order,coalesce(nullif(pc.display_name,''),pc.name)) from public.product_colors pc where pc.product_id=p.id and pc.active),'[]'::jsonb),
  'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,'available',v.available,'sortOrder',v.sort_order) order by v.size_sort_order,v.sort_order,v.id) from public.product_variants v where v.product_id=p.id and v.color_id is null),'[]'::jsonb),
  'images',coalesce((select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'thumbnailPath',im.thumbnail_path,'ogStoragePath',im.og_storage_path,'width',im.width,'height',im.height,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover) order by im.is_cover desc,im.sort_order,im.id) from public.product_images im where im.product_id=p.id and im.color_id is null and im.active and im.storage_path is not null),'[]'::jsonb)
)
from public.products p join public.categories c on c.id=p.category_id
where p.id=p_product_id and p.status='published' and c.is_active;
$$;
create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,'sortOrder',c.sort_order,
   'showOnHome',c.show_on_home,'homeLimit',c.home_limit,'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,
   'aliases',coalesce((select jsonb_agg(a.slug order by a.created_at,a.slug) from public.category_slug_aliases a where a.category_id=c.id),'[]'::jsonb),
   'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)
 ) order by c.sort_order,c.name) from public.categories c where c.is_active),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(((public.build_public_product(p.id)-'category')||jsonb_build_object('category_id',p.category_id)) order by p.featured desc,p.created_at desc,p.name) from public.products p join public.categories c on c.id=p.category_id and c.is_active where p.status='published' and exists(select 1 from public.product_variants v where v.product_id=p.id and v.available)),'[]'::jsonb)
);
$$;
commit;

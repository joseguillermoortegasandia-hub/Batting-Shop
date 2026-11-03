-- Batting Shop V4 · Etapa 2
-- Categorías escalables, etiquetas de color, Pelotas inactiva y validación dinámica.
-- Idempotente; no elimina columnas ni datos existentes.
begin;

alter table public.product_colors add column if not exists display_name text;
update public.product_colors set display_name=case name
  when 'Black' then 'Negro' when 'Maroon' then 'Vinotinto' when 'Grey' then 'Gris' when 'Gray' then 'Gris'
  when 'Carolina Blue' then 'Azul Carolina' when 'Carolina Blue/Navy' then 'Azul Carolina / Azul marino'
  when 'Yellow/Red/Blue' then 'Amarillo / Rojo / Azul' when 'White/Black' then 'Blanco / Negro'
  when 'Royal/Black' then 'Azul royal / Negro' when 'White' then 'Blanco' when 'Black/Digi Camo' then 'Negro / Camo digital'
  when 'Red/White/Blue' then 'Rojo / Blanco / Azul' when 'Navy/Gold' then 'Azul marino / Dorado'
  when 'Blue/Green' then 'Azul / Verde' when 'Orange' then 'Naranja' when 'Black/White' then 'Negro / Blanco'
  when 'White/Red/Blue' then 'Blanco / Rojo / Azul' when 'Neon/Lime' then 'Neón / Lima'
  when 'Red/White' then 'Rojo / Blanco' when 'Green Camo' then 'Camo verde' when 'Blue' then 'Azul'
  when 'Green' then 'Verde' when 'Red' then 'Rojo' when 'Gold' then 'Dorado' when 'Navy' then 'Azul marino'
  when 'Pink' then 'Rosado' when 'Purple' then 'Morado' when 'Yellow' then 'Amarillo' when 'Brown' then 'Marrón'
  when 'Camo' then 'Camuflaje' else name end
where display_name is null or btrim(display_name)='';

insert into public.categories(slug,name,description,sort_order,is_active,show_on_home,home_limit,variant_mode,option_label,search_keywords)
values('pelotas','Pelotas','Pelotas de béisbol, softball y práctica.',60,false,false,8,'option','Presentación',array['pelota','pelotas','baseball','softball','practica','práctica','ball','balls'])
on conflict(slug) do nothing;

insert into public.category_attributes(category_id,key,label,type,options,unit,scope,is_filterable,is_required,show_in_card,sort_order)
select c.id,'tipo','Tipo','select','[{"value":"softball","label":"Softball","sort_order":10},{"value":"beisbol","label":"Béisbol","sort_order":20},{"value":"practica","label":"Práctica","sort_order":30}]'::jsonb,null,'product',true,true,true,10
from public.categories c where c.slug='pelotas' on conflict(category_id,key) do nothing;
insert into public.category_attributes(category_id,key,label,type,options,unit,scope,is_filterable,is_required,show_in_card,sort_order)
select c.id,'tamano','Tamaño','select','[{"value":"9","label":"9\"","sort_order":10},{"value":"11","label":"11\"","sort_order":20},{"value":"12","label":"12\"","sort_order":30}]'::jsonb,null,'product',true,true,true,20
from public.categories c where c.slug='pelotas' on conflict(category_id,key) do nothing;
insert into public.category_attributes(category_id,key,label,type,options,unit,scope,is_filterable,is_required,show_in_card,sort_order)
select c.id,'material','Material','text','[]'::jsonb,null,'product',true,false,true,30
from public.categories c where c.slug='pelotas' on conflict(category_id,key) do nothing;
insert into public.category_attributes(category_id,key,label,type,options,unit,scope,is_filterable,is_required,show_in_card,sort_order)
select c.id,'presentacion','Presentación','select','[{"value":"unidad","label":"Unidad","sort_order":10},{"value":"docena","label":"Docena","sort_order":20},{"value":"caja","label":"Caja","sort_order":30}]'::jsonb,null,'variant',true,true,false,40
from public.categories c where c.slug='pelotas' on conflict(category_id,key) do nothing;

create or replace function public.validate_category_attribute_payload(p_category_id uuid,p_product_attributes jsonb,p_variant_attributes jsonb default '{}'::jsonb,p_scope text default 'product')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a record; v jsonb; txt text; valid boolean;
begin
  for a in select * from public.category_attributes where category_id=p_category_id and scope=p_scope loop
    v:=case when p_scope='product' then coalesce(p_product_attributes,'{}'::jsonb)->a.key else coalesce(p_variant_attributes,'{}'::jsonb)->a.key end;
    if a.is_required and (v is null or v='null'::jsonb or v='""'::jsonb or v='[]'::jsonb) then return false; end if;
    if v is null or v='null'::jsonb then continue; end if;
    if a.type='select' then
      txt:=trim(both '"' from v::text);
      select exists(select 1 from jsonb_array_elements(a.options) o where coalesce(o->>'value',o->>'label')=txt) into valid;
      if jsonb_array_length(a.options)>0 and not valid then return false; end if;
    elsif a.type='multiselect' and jsonb_typeof(v)<>'array' then return false;
    elsif a.type='number' and jsonb_typeof(v) not in ('number','string') then return false;
    elsif a.type='boolean' and jsonb_typeof(v)<>'boolean' then return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.validate_category_attribute_payload(uuid,jsonb,jsonb,text) from public;

create or replace function public.validate_product_publication()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='published' then
    if not exists(select 1 from public.categories c where c.id=new.category_id and c.is_active) then raise exception 'La categoría debe estar activa antes de publicar el producto.'; end if;
    if not public.validate_category_attribute_payload(new.category_id,new.attributes,'{}'::jsonb,'product') then raise exception 'Faltan atributos obligatorios o hay opciones inválidas para la categoría.'; end if;
    if not exists(select 1 from public.product_variants v join public.inventory_private i on i.variant_id=v.id where v.product_id=new.id and i.stock>0) then raise exception 'Un producto publicado necesita stock real mayor que 0.'; end if;
    if exists(select 1 from public.product_variants v join public.inventory_private i on i.variant_id=v.id where v.product_id=new.id and i.stock>0 and not public.variant_has_public_image(v.product_id,v.color_id)) then raise exception 'Cada variante/color con stock necesita una imagen final en Storage antes de publicar.'; end if;
    if exists(select 1 from public.product_variants v join public.inventory_private i on i.variant_id=v.id where v.product_id=new.id and i.stock>0 and not public.validate_category_attribute_payload(new.category_id,new.attributes,v.attributes,'variant')) then raise exception 'Una variante con stock no cumple los atributos obligatorios de su categoría.'; end if;
  end if;
  return new;
end $$;

create or replace function public.limit_featured_products()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.featured and new.status<>'archived' then
    if (select count(*) from public.products p where p.featured and p.status<>'archived' and p.id<>new.id)>=6 then
      raise exception 'Batting Shop permite un máximo de 6 productos destacados. Quita uno antes de destacar otro.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_limit_featured on public.products;
create trigger products_limit_featured before insert or update of featured,status on public.products for each row execute function public.limit_featured_products();

commit;

-- Batting Shop V4 · Etapa 2 (RPCs)
-- Actualiza payload público para display_name, categorías/atributos y revalidación del carrito por lote.
-- No incluye alias de slugs; eso queda para la Etapa 3.
begin;

create or replace function public.build_public_product(p_product_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'id',p.id,'slug',p.slug,'name',p.name,'brand',p.brand,'description',p.description,'price',p.price,
  'attributes',coalesce(p.attributes,'{}'::jsonb),'featured',p.featured,'createdAt',p.created_at,
  'category',jsonb_build_object(
    'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,'sortOrder',c.sort_order,
    'showOnHome',c.show_on_home,'homeLimit',c.home_limit,'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,
    'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)
  ),
  'colors',coalesce((select jsonb_agg(jsonb_build_object(
    'id',pc.id,'name',pc.name,'label',coalesce(nullif(pc.display_name,''),pc.name),'hex',pc.hex,'sortOrder',pc.sort_order,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover) order by im.is_cover desc,im.sort_order,im.id) from public.product_images im where im.product_id=p.id and im.color_id=pc.id and im.active and im.storage_path is not null),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,'available',v.available,'sortOrder',v.sort_order) order by v.size_sort_order,v.sort_order,v.id) from public.product_variants v where v.product_id=p.id and v.color_id=pc.id),'[]'::jsonb)
  ) order by pc.sort_order,coalesce(nullif(pc.display_name,''),pc.name)) from public.product_colors pc where pc.product_id=p.id and pc.active),'[]'::jsonb),
  'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,'available',v.available,'sortOrder',v.sort_order) order by v.size_sort_order,v.sort_order,v.id) from public.product_variants v where v.product_id=p.id and v.color_id is null),'[]'::jsonb),
  'images',coalesce((select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover) order by im.is_cover desc,im.sort_order,im.id) from public.product_images im where im.product_id=p.id and im.color_id is null and im.active and im.storage_path is not null),'[]'::jsonb)
)
from public.products p join public.categories c on c.id=p.category_id
where p.id=p_product_id and p.status='published' and c.is_active;
$$;
revoke all on function public.build_public_product(uuid) from public;

create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,'sortOrder',c.sort_order,'showOnHome',c.show_on_home,'homeLimit',c.home_limit,'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)) order by c.sort_order,c.name) from public.categories c where c.is_active),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(public.build_public_product(p.id) order by p.featured desc,p.created_at desc,p.name) from public.products p join public.categories c on c.id=p.category_id and c.is_active where p.status='published' and exists(select 1 from public.product_variants v where v.product_id=p.id and v.available)),'[]'::jsonb)
);
$$;

create or replace function public.get_public_product(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
select public.build_public_product(p.id) from public.products p join public.categories c on c.id=p.category_id and c.is_active
where p.status='published' and p.slug=p_slug limit 1;
$$;

create or replace function public.get_related_products(p_product_id uuid,p_limit integer default 4)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(public.build_public_product(q.id) order by q.same_category desc,q.featured desc,q.created_at desc),'[]'::jsonb) from (
 select p.id,p.featured,p.created_at,(p.category_id=base.category_id) same_category from public.products p join public.categories c on c.id=p.category_id and c.is_active cross join (select category_id from public.products where id=p_product_id) base
 where p.id<>p_product_id and p.status='published' and exists(select 1 from public.product_variants v where v.product_id=p.id and v.available)
 order by same_category desc,p.featured desc,p.created_at desc limit greatest(0,least(coalesce(p_limit,4),12))
) q;
$$;

create or replace function public.get_public_cart_state(p_variant_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object(
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
where v.id=any(p_variant_ids) and p.status='published';
$$;

revoke all on function public.get_public_catalog() from public;
revoke all on function public.get_public_product(text) from public;
revoke all on function public.get_related_products(uuid,integer) from public;
revoke all on function public.get_public_cart_state(uuid[]) from public;
grant execute on function public.get_public_catalog() to anon,authenticated;
grant execute on function public.get_public_product(text) to anon,authenticated;
grant execute on function public.get_related_products(uuid,integer) to anon,authenticated;
grant execute on function public.get_public_cart_state(uuid[]) to anon,authenticated;
commit;


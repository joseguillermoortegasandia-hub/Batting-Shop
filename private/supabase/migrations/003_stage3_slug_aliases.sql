-- Batting Shop V4 · Etapa 3
-- Alias de slugs para productos/categorías y RPCs públicas compatibles.
-- Idempotente y no destructiva: no elimina slugs actuales ni datos existentes.
begin;

create table if not exists public.product_slug_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now(),
  unique(product_id,slug)
);

create table if not exists public.category_slug_aliases (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now(),
  unique(category_id,slug)
);

create index if not exists product_slug_aliases_product_idx on public.product_slug_aliases(product_id);
create index if not exists category_slug_aliases_category_idx on public.category_slug_aliases(category_id);

create or replace function public.guard_product_slug()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.product_slug_aliases a where a.slug=new.slug and a.product_id<>new.id) then
    raise exception 'El slug % ya existe como alias de otro producto.', new.slug;
  end if;
  return new;
end $$;

drop trigger if exists products_guard_slug on public.products;
create trigger products_guard_slug before insert or update of slug on public.products
for each row execute function public.guard_product_slug();

create or replace function public.capture_product_slug_alias()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.slug is distinct from new.slug then
    delete from public.product_slug_aliases where product_id=new.id and slug=new.slug;
    insert into public.product_slug_aliases(product_id,slug)
    values(new.id,old.slug)
    on conflict(slug) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists products_capture_slug_alias on public.products;
create trigger products_capture_slug_alias after update of slug on public.products
for each row execute function public.capture_product_slug_alias();

create or replace function public.guard_category_slug()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.category_slug_aliases a where a.slug=new.slug and a.category_id<>new.id) then
    raise exception 'El slug % ya existe como alias de otra categoría.', new.slug;
  end if;
  return new;
end $$;

drop trigger if exists categories_guard_slug on public.categories;
create trigger categories_guard_slug before insert or update of slug on public.categories
for each row execute function public.guard_category_slug();

create or replace function public.capture_category_slug_alias()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.slug is distinct from new.slug then
    delete from public.category_slug_aliases where category_id=new.id and slug=new.slug;
    insert into public.category_slug_aliases(category_id,slug)
    values(new.id,old.slug)
    on conflict(slug) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists categories_capture_slug_alias on public.categories;
create trigger categories_capture_slug_alias after update of slug on public.categories
for each row execute function public.capture_category_slug_alias();

-- Auditoría de alias.
drop trigger if exists product_slug_aliases_audit on public.product_slug_aliases;
create trigger product_slug_aliases_audit after insert or update or delete on public.product_slug_aliases
for each row execute function public.write_audit_log();
drop trigger if exists category_slug_aliases_audit on public.category_slug_aliases;
create trigger category_slug_aliases_audit after insert or update or delete on public.category_slug_aliases
for each row execute function public.write_audit_log();

-- RLS: los alias no se consultan directamente desde la tienda; solo el admin puede leer/escribir.
alter table public.product_slug_aliases enable row level security;
alter table public.category_slug_aliases enable row level security;
alter table public.product_slug_aliases force row level security;
alter table public.category_slug_aliases force row level security;

drop policy if exists product_slug_aliases_admin_all on public.product_slug_aliases;
create policy product_slug_aliases_admin_all on public.product_slug_aliases for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists category_slug_aliases_admin_all on public.category_slug_aliases;
create policy category_slug_aliases_admin_all on public.category_slug_aliases for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_slug_aliases,public.category_slug_aliases from anon,authenticated;
grant select,insert,update,delete on public.product_slug_aliases,public.category_slug_aliases to authenticated;

-- Payload público actualizado: las categorías incluyen alias para normalizar enlaces antiguos.
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
 'categories',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,'sortOrder',c.sort_order,
   'showOnHome',c.show_on_home,'homeLimit',c.home_limit,'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,
   'aliases',coalesce((select jsonb_agg(a.slug order by a.created_at,a.slug) from public.category_slug_aliases a where a.category_id=c.id),'[]'::jsonb),
   'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)
 ) order by c.sort_order,c.name) from public.categories c where c.is_active),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(public.build_public_product(p.id) order by p.featured desc,p.created_at desc,p.name) from public.products p join public.categories c on c.id=p.category_id and c.is_active where p.status='published' and exists(select 1 from public.product_variants v where v.product_id=p.id and v.available)),'[]'::jsonb)
);
$$;

-- Resuelve tanto slug actual como alias. El payload devuelve siempre el slug canónico actual.
create or replace function public.get_public_product(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
select public.build_public_product(p.id)
from public.products p
join public.categories c on c.id=p.category_id and c.is_active
where p.status='published'
  and (p.slug=p_slug or exists(select 1 from public.product_slug_aliases a where a.product_id=p.id and a.slug=p_slug))
limit 1;
$$;

revoke all on function public.get_public_catalog() from public;
revoke all on function public.get_public_product(text) from public;
grant execute on function public.get_public_catalog() to anon,authenticated;
grant execute on function public.get_public_product(text) to anon,authenticated;

commit;

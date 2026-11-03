-- Batting Shop V4 · Etapa 1
-- Migración idempotente desde V3.1 y esquema base para proyectos nuevos.
-- No elimina datos de negocio ni borra columnas legacy todavía.

begin;
create extension if not exists pgcrypto;

-- ---------- Base administrativa ----------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','owner')),
  created_at timestamptz not null default now()
);

-- ---------- Categorías dinámicas ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text not null default '',
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  show_on_home boolean not null default true,
  home_limit integer not null default 8 check (home_limit between 1 and 24),
  variant_mode text not null default 'single' check (variant_mode in ('color_size','color_only','size_only','option','single')),
  option_label text,
  search_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  type text not null check (type in ('text','number','select','multiselect','boolean')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options)='array'),
  unit text,
  scope text not null default 'product' check (scope in ('product','variant')),
  is_filterable boolean not null default false,
  is_required boolean not null default false,
  show_in_card boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id,key)
);

-- Cinco categorías actuales. ON CONFLICT DO NOTHING preserva cambios posteriores del dueño.
insert into public.categories(slug,name,description,sort_order,is_active,show_on_home,home_limit,variant_mode,option_label,search_keywords)
values
  ('guantines','Guantines de bateo','Guantines de bateo por marca, color, talla y edad/nivel.',10,true,true,8,'color_size','Talla',array['guante','guantes','guantin','guantines','batting gloves','bateo']),
  ('batgrips','Bat Grips','Cintas y grips para el mango del bate.',20,true,true,8,'color_only','Diseño',array['bat grip','bat grips','grip','cinta','agarre','bate']),
  ('eyeblack','Eye Black','Productos anti-reflejo para juego y práctica.',30,true,true,6,'single',null,array['eye black','antireflejo','anti reflejo','negro']),
  ('protectores','Protectores de pulgar','Protectores y entrenadores de agarre para bateo.',40,true,true,6,'single',null,array['protector','pulgar','thumb guard','gator grip','antivibrador']),
  ('mangas','Mangas de compresión','Mangas de compresión para béisbol y softball.',50,true,true,6,'color_size','Talla',array['manga','mangas','compresion','compression sleeve'])
on conflict(slug) do nothing;

-- Edad/nivel deja de ser una columna rígida y pasa a ser atributo configurable.
insert into public.category_attributes(category_id,key,label,type,options,scope,is_filterable,is_required,show_in_card,sort_order)
select c.id,'edad_nivel','Edad / nivel','select',
  '[{"value":"Adulto","label":"Adulto","sort_order":10},{"value":"Juvenil","label":"Juvenil","sort_order":20},{"value":"Tee Ball","label":"Tee Ball","sort_order":30}]'::jsonb,
  'product',true,true,true,10
from public.categories c where c.slug='guantines'
on conflict(category_id,key) do nothing;

insert into public.category_attributes(category_id,key,label,type,options,scope,is_filterable,is_required,show_in_card,sort_order)
select c.id,'edad_nivel','Edad / nivel','select',
  '[{"value":"Adulto","label":"Adulto","sort_order":10},{"value":"Juvenil","label":"Juvenil","sort_order":20},{"value":"Tee Ball","label":"Tee Ball","sort_order":30}]'::jsonb,
  'product',true,false,true,10
from public.categories c where c.slug='mangas'
on conflict(category_id,key) do nothing;

-- ---------- Productos / variantes ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique,
  name text not null,
  brand text not null,
  category text,
  audience text,
  description text not null default '',
  price numeric(10,2),
  status text not null default 'draft',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists category_id uuid references public.categories(id);
alter table public.products add column if not exists attributes jsonb not null default '{}'::jsonb;

-- Elimina restricciones legacy que impedirían categorías/atributos dinámicos, pero conserva las columnas.
alter table public.products drop constraint if exists products_category_check;
alter table public.products drop constraint if exists products_audience_check;
alter table public.products alter column category drop not null;
alter table public.products alter column audience drop not null;

alter table public.products drop constraint if exists products_price_check;
alter table public.products add constraint products_price_check check (price is null or price > 0);
alter table public.products drop constraint if exists products_published_price_check;
alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check check (status in ('draft','published','archived'));

-- Migra las categorías legacy conocidas y la antigua audiencia.
update public.products p
set category_id=c.id
from public.categories c
where p.category_id is null and p.category=c.slug;

update public.products p
set attributes=jsonb_set(coalesce(p.attributes,'{}'::jsonb),'{edad_nivel}',to_jsonb(p.audience),true)
where p.audience is not null
  and not (coalesce(p.attributes,'{}'::jsonb) ? 'edad_nivel')
  and exists(select 1 from public.category_attributes a where a.category_id=p.category_id and a.key='edad_nivel');

-- Limpia la antigua audiencia en categorías donde Edad / nivel no aplica.
update public.products p
set attributes=coalesce(p.attributes,'{}'::jsonb)-'edad_nivel'
where coalesce(p.attributes,'{}'::jsonb) ? 'edad_nivel'
  and not exists(select 1 from public.category_attributes a where a.category_id=p.category_id and a.key='edad_nivel');

-- Corrige únicamente los nombres legacy conocidos de V3.1. Si el dueño renombra después,
-- una re-ejecución de esta migración no pisa ese cambio.
update public.products p
set name='AMASPORT Bat Grip'
where p.code in ('BG-001','BG-002','BG-003','BG-004','BG-005','BG-006','BG-007','BG-008')
  and p.name in (
    'AMASPORT Bat Grip – Blue/Green','AMASPORT Bat Grip - Blue/Green',
    'AMASPORT Bat Grip – Orange','AMASPORT Bat Grip - Orange',
    'AMASPORT Bat Grip – Black/White','AMASPORT Bat Grip - Black/White',
    'AMASPORT Bat Grip – White/Red/Blue','AMASPORT Bat Grip - White/Red/Blue',
    'AMASPORT Bat Grip – Neon/Lime','AMASPORT Bat Grip - Neon/Lime',
    'AMASPORT Bat Grip – Red/White','AMASPORT Bat Grip - Red/White',
    'AMASPORT Bat Grip – USA','AMASPORT Bat Grip - USA',
    'AMASPORT Bat Grip – Green Camo','AMASPORT Bat Grip - Green Camo'
  );

-- Si hay productos legacy con una categoría no migrable, se detiene con un mensaje claro.
do $$
begin
  if exists(select 1 from public.products where category_id is null) then
    raise exception 'Hay productos con categoría legacy no reconocida. Corrige category antes de completar V4.';
  end if;
end $$;
alter table public.products alter column category_id set not null;

-- Compatibilidad V3.1: mientras no eliminemos columnas legacy, cualquier edición nueva mantiene
-- category/audience sincronizados para poder revertir el frontend sin perder datos.
create or replace function public.sync_legacy_product_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  select c.slug into new.category from public.categories c where c.id=new.category_id;
  new.audience:=nullif(new.attributes->>'edad_nivel','');
  return new;
end $$;

do $$ begin
  drop trigger if exists products_sync_legacy_fields on public.products;
  create trigger products_sync_legacy_fields before insert or update of category_id,attributes on public.products
  for each row execute function public.sync_legacy_product_fields();
end $$;

create table if not exists public.product_colors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  hex text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,name)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid references public.product_colors(id) on delete cascade,
  size_label text,
  normalized_size text,
  available boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_variants alter column color_id drop not null;
alter table public.product_variants alter column size_label drop not null;
alter table public.product_variants alter column normalized_size drop not null;
alter table public.product_variants add column if not exists variant_key text;
alter table public.product_variants add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.product_variants add column if not exists sale_price numeric(10,2);
alter table public.product_variants add column if not exists size_sort_order integer not null default 0;
alter table public.product_variants drop constraint if exists product_variants_sale_price_check;
alter table public.product_variants add constraint product_variants_sale_price_check check (sale_price is null or sale_price > 0);

-- Backfill de claves y orden de tallas actuales. El frontend nunca contiene esta lista:
-- a futuro el orden se administra como dato mediante size_sort_order/opciones de atributo.
update public.product_variants
set variant_key=coalesce(color_id::text,'none') || ':' || coalesce(normalized_size,size_label,'default')
where variant_key is null or btrim(variant_key)='';

update public.product_variants set size_sort_order=case
  when normalized_size='XS' then 5
  when normalized_size='S' then 10
  when normalized_size='S/M' then 20
  when normalized_size='M' then 30
  when normalized_size='M/L' then 40
  when normalized_size='L' then 50
  when normalized_size='XL' then 60
  when normalized_size='XXL' then 70
  when coalesce(normalized_size,size_label,'') ~ '^[0-9]+([.][0-9]+)?$' then 100 + round(coalesce(normalized_size,size_label)::numeric*10)::integer
  when normalized_size='ONE' or size_label='Talla única' then 1000
  else coalesce(nullif(size_sort_order,0),500)
end
where size_sort_order=0;

alter table public.product_variants alter column variant_key set not null;
alter table public.product_variants alter column variant_key set default gen_random_uuid()::text;
create unique index if not exists product_variants_product_key_uidx on public.product_variants(product_id,variant_key);
create unique index if not exists product_variants_product_color_size_uidx on public.product_variants(product_id,color_id,size_label);

create table if not exists public.inventory_private (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  cost numeric(10,2) check (cost is null or cost >= 0),
  provider_sku text,
  provider_source_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid references public.product_colors(id) on delete cascade,
  storage_path text,
  external_url text,
  alt text not null default '',
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

create table if not exists public.audit_log (
  id bigint generated by default as identity primary key,
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Índices ----------
create index if not exists categories_active_sort_idx on public.categories(is_active,sort_order);
create index if not exists category_attributes_category_sort_idx on public.category_attributes(category_id,sort_order);
create index if not exists products_status_idx on public.products(status);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_attributes_gin_idx on public.products using gin(attributes);
create index if not exists colors_product_idx on public.product_colors(product_id);
create index if not exists variants_product_idx on public.product_variants(product_id);
create index if not exists variants_color_idx on public.product_variants(color_id);
create index if not exists variants_available_idx on public.product_variants(available);
create index if not exists variants_attributes_gin_idx on public.product_variants using gin(attributes);
create index if not exists images_product_idx on public.product_images(product_id);
create index if not exists audit_created_idx on public.audit_log(created_at desc);

-- ---------- updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at=now(); return new; end $$;

do $$ begin
  drop trigger if exists categories_updated_at on public.categories;
  create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
  drop trigger if exists category_attributes_updated_at on public.category_attributes;
  create trigger category_attributes_updated_at before update on public.category_attributes for each row execute function public.set_updated_at();
  drop trigger if exists products_updated_at on public.products;
  create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
  drop trigger if exists colors_updated_at on public.product_colors;
  create trigger colors_updated_at before update on public.product_colors for each row execute function public.set_updated_at();
  drop trigger if exists variants_updated_at on public.product_variants;
  create trigger variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
  drop trigger if exists inventory_updated_at on public.inventory_private;
  create trigger inventory_updated_at before update on public.inventory_private for each row execute function public.set_updated_at();
  drop trigger if exists images_updated_at on public.product_images;
  create trigger images_updated_at before update on public.product_images for each row execute function public.set_updated_at();
end $$;

-- ---------- Disponibilidad derivada ----------
create or replace function public.variant_has_public_image(p_product_id uuid,p_color_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.product_images im
    where im.product_id=p_product_id and im.active and im.storage_path is not null
      and ((p_color_id is null and im.color_id is null) or (p_color_id is not null and im.color_id=p_color_id))
  );
$$;
revoke all on function public.variant_has_public_image(uuid,uuid) from public;

create or replace function public.enforce_derived_variant_availability()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.available := coalesce((select i.stock>0 from public.inventory_private i where i.variant_id=new.id),false)
                   and public.variant_has_public_image(new.product_id,new.color_id);
  return new;
end $$;

do $$ begin
  drop trigger if exists variants_enforce_availability on public.product_variants;
  create trigger variants_enforce_availability before insert or update on public.product_variants
  for each row execute function public.enforce_derived_variant_availability();
end $$;

create or replace function public.recompute_variant_availability(p_variant_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.product_variants v
  set available=coalesce((select i.stock>0 from public.inventory_private i where i.variant_id=v.id),false)
                and public.variant_has_public_image(v.product_id,v.color_id)
  where v.id=p_variant_id;
end $$;
revoke all on function public.recompute_variant_availability(uuid) from public;

create or replace function public.sync_variant_availability()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.recompute_variant_availability(coalesce(new.variant_id,old.variant_id));
  return coalesce(new,old);
end $$;

do $$ begin
  drop trigger if exists inventory_sync_availability on public.inventory_private;
  create trigger inventory_sync_availability after insert or update or delete on public.inventory_private
  for each row execute function public.sync_variant_availability();
end $$;

create or replace function public.sync_image_variant_availability()
returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
  pid:=coalesce(new.product_id,old.product_id);
  update public.product_variants v
  set available=coalesce((select i.stock>0 from public.inventory_private i where i.variant_id=v.id),false)
                and public.variant_has_public_image(v.product_id,v.color_id)
  where v.product_id=pid;
  return coalesce(new,old);
end $$;

do $$ begin
  drop trigger if exists images_sync_availability on public.product_images;
  create trigger images_sync_availability after insert or update or delete on public.product_images
  for each row execute function public.sync_image_variant_availability();
end $$;

-- Puede publicarse sin precio: la tienda mostrará "Consultar precio". Sí exige stock+imagen real.
create or replace function public.validate_product_publication()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='published' then
    if not exists(
      select 1 from public.product_variants v
      join public.inventory_private i on i.variant_id=v.id
      where v.product_id=new.id and i.stock>0
    ) then raise exception 'Un producto publicado necesita stock real mayor que 0.'; end if;
    if exists(
      select 1 from public.product_variants v
      join public.inventory_private i on i.variant_id=v.id
      where v.product_id=new.id and i.stock>0 and not public.variant_has_public_image(v.product_id,v.color_id)
    ) then raise exception 'Cada variante/color con stock necesita una imagen final en Storage antes de publicar.'; end if;
  end if;
  return new;
end $$;

do $$ begin
  drop trigger if exists products_validate_publication on public.products;
  create trigger products_validate_publication before insert or update of status on public.products
  for each row execute function public.validate_product_publication();
end $$;

-- No borrar categorías con productos; en producción se archivan (is_active=false).
create or replace function public.prevent_category_delete_with_products()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.products p where p.category_id=old.id) then
    raise exception 'No puedes borrar una categoría con productos. Desactívala en su lugar.';
  end if;
  return old;
end $$;

do $$ begin
  drop trigger if exists categories_block_delete on public.categories;
  create trigger categories_block_delete before delete on public.categories
  for each row execute function public.prevent_category_delete_with_products();
end $$;

-- ---------- Administración / MFA ----------
create or replace function public.is_authorized_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()));
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_authorized_admin() and coalesce((select auth.jwt()->>'aal'),'aal1')='aal2';
$$;
revoke all on function public.is_authorized_admin() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_authorized_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- Auditoría ----------
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path='' as $$
declare rid text;
begin
  rid:=coalesce((to_jsonb(new)->>'id'),(to_jsonb(old)->>'id'),(to_jsonb(new)->>'variant_id'),(to_jsonb(old)->>'variant_id'));
  insert into public.audit_log(user_id,table_name,record_id,action,old_data,new_data)
  values((select auth.uid()),tg_table_name,rid,tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new,old);
end $$;

do $$ begin
  drop trigger if exists categories_audit on public.categories;
  create trigger categories_audit after insert or update or delete on public.categories for each row execute function public.write_audit_log();
  drop trigger if exists category_attributes_audit on public.category_attributes;
  create trigger category_attributes_audit after insert or update or delete on public.category_attributes for each row execute function public.write_audit_log();
  drop trigger if exists products_audit on public.products;
  create trigger products_audit after insert or update or delete on public.products for each row execute function public.write_audit_log();
  drop trigger if exists colors_audit on public.product_colors;
  create trigger colors_audit after insert or update or delete on public.product_colors for each row execute function public.write_audit_log();
  drop trigger if exists variants_audit on public.product_variants;
  create trigger variants_audit after insert or update or delete on public.product_variants for each row execute function public.write_audit_log();
  drop trigger if exists inventory_audit on public.inventory_private;
  create trigger inventory_audit after insert or update or delete on public.inventory_private for each row execute function public.write_audit_log();
  drop trigger if exists images_audit on public.product_images;
  create trigger images_audit after insert or update or delete on public.product_images for each row execute function public.write_audit_log();
end $$;

-- ---------- JSON público curado ----------
-- Función interna: nunca incluye code, costo, stock, SKU ni proveedor.
create or replace function public.build_public_product(p_product_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'id',p.id,
  'slug',p.slug,
  'name',p.name,
  'brand',p.brand,
  'description',p.description,
  'price',p.price,
  'attributes',coalesce(p.attributes,'{}'::jsonb),
  'featured',p.featured,
  'createdAt',p.created_at,
  'category',jsonb_build_object(
    'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,
    'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords
  ),
  'colors',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',pc.id,'name',pc.name,'hex',pc.hex,'sortOrder',pc.sort_order,
      'images',coalesce((
        select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover)
          order by im.is_cover desc,im.sort_order,im.id)
        from public.product_images im where im.product_id=p.id and im.color_id=pc.id and im.active and im.storage_path is not null
      ),'[]'::jsonb),
      'variants',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,
          'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,
          'available',v.available,'sortOrder',v.sort_order
        ) order by v.size_sort_order,v.sort_order,v.id)
        from public.product_variants v where v.product_id=p.id and v.color_id=pc.id
      ),'[]'::jsonb)
    ) order by pc.sort_order,pc.name)
    from public.product_colors pc where pc.product_id=p.id and pc.active
  ),'[]'::jsonb),
  'variants',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',v.id,'sizeLabel',v.size_label,'normalizedSize',v.normalized_size,'sizeSortOrder',v.size_sort_order,
      'variantKey',v.variant_key,'attributes',coalesce(v.attributes,'{}'::jsonb),'salePrice',v.sale_price,
      'available',v.available,'sortOrder',v.sort_order
    ) order by v.sort_order,v.id)
    from public.product_variants v where v.product_id=p.id and v.color_id is null
  ),'[]'::jsonb),
  'images',coalesce((
    select jsonb_agg(jsonb_build_object('id',im.id,'storagePath',im.storage_path,'alt',im.alt,'sortOrder',im.sort_order,'isCover',im.is_cover)
      order by im.is_cover desc,im.sort_order,im.id)
    from public.product_images im where im.product_id=p.id and im.color_id is null and im.active and im.storage_path is not null
  ),'[]'::jsonb)
)
from public.products p
join public.categories c on c.id=p.category_id
where p.id=p_product_id and p.status='published' and c.is_active;
$$;
revoke all on function public.build_public_product(uuid) from public;

create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'categories',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,'imagePath',c.image_path,
      'sortOrder',c.sort_order,'showOnHome',c.show_on_home,'homeLimit',c.home_limit,
      'variantMode',c.variant_mode,'optionLabel',c.option_label,'searchKeywords',c.search_keywords,
      'attributes',coalesce((select jsonb_agg(jsonb_build_object(
        'id',a.id,'key',a.key,'label',a.label,'type',a.type,'options',a.options,'unit',a.unit,'scope',a.scope,
        'isFilterable',a.is_filterable,'isRequired',a.is_required,'showInCard',a.show_in_card,'sortOrder',a.sort_order
      ) order by a.sort_order,a.label) from public.category_attributes a where a.category_id=c.id),'[]'::jsonb)
    ) order by c.sort_order,c.name)
    from public.categories c where c.is_active
  ),'[]'::jsonb),
  'products',coalesce((
    select jsonb_agg(public.build_public_product(p.id) order by p.featured desc,p.created_at desc,p.name)
    from public.products p
    join public.categories c on c.id=p.category_id and c.is_active
    where p.status='published'
      and exists(select 1 from public.product_variants v where v.product_id=p.id and v.available)
  ),'[]'::jsonb)
);
$$;

create or replace function public.get_public_product(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.build_public_product(p.id)
  from public.products p join public.categories c on c.id=p.category_id and c.is_active
  where p.slug=p_slug and p.status='published'
  limit 1;
$$;

create or replace function public.get_related_products(p_product_id uuid,p_limit integer default 4)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(public.build_public_product(q.id) order by q.same_category desc,q.featured desc,q.created_at desc),'[]'::jsonb)
  from (
    select p.id,p.featured,p.created_at,(p.category_id=base.category_id) as same_category
    from public.products p
    join public.categories c on c.id=p.category_id and c.is_active
    cross join (select category_id from public.products where id=p_product_id) base
    where p.id<>p_product_id and p.status='published'
      and exists(select 1 from public.product_variants v where v.product_id=p.id and v.available)
    order by same_category desc,p.featured desc,p.created_at desc
    limit greatest(0,least(coalesce(p_limit,4),12))
  ) q;
$$;

revoke all on function public.get_public_catalog() from public;
revoke all on function public.get_public_product(text) from public;
revoke all on function public.get_related_products(uuid,integer) from public;
grant execute on function public.get_public_catalog() to anon,authenticated;
grant execute on function public.get_public_product(text) to anon,authenticated;
grant execute on function public.get_related_products(uuid,integer) to anon,authenticated;

-- ---------- RLS ----------
alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.category_attributes enable row level security;
alter table public.products enable row level security;
alter table public.product_colors enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_private enable row level security;
alter table public.product_images enable row level security;
alter table public.audit_log enable row level security;

alter table public.admin_users force row level security;
alter table public.categories force row level security;
alter table public.category_attributes force row level security;
alter table public.products force row level security;
alter table public.product_colors force row level security;
alter table public.product_variants force row level security;
alter table public.inventory_private force row level security;
alter table public.product_images force row level security;
alter table public.audit_log force row level security;

drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon using (is_active);
drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists category_attributes_public_read on public.category_attributes;
create policy category_attributes_public_read on public.category_attributes for select to anon using (
  exists(select 1 from public.categories c where c.id=category_id and c.is_active)
);
drop policy if exists category_attributes_admin_all on public.category_attributes;
create policy category_attributes_admin_all on public.category_attributes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Los productos y sus variantes no tienen lectura directa anon: el catálogo público sale solo de RPCs curadas.
drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_write on public.products;
drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists colors_public_read on public.product_colors;
drop policy if exists colors_admin_write on public.product_colors;
drop policy if exists colors_admin_all on public.product_colors;
create policy colors_admin_all on public.product_colors for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists variants_public_read on public.product_variants;
drop policy if exists variants_admin_write on public.product_variants;
drop policy if exists variants_admin_all on public.product_variants;
create policy variants_admin_all on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists inventory_admin_all on public.inventory_private;
create policy inventory_admin_all on public.inventory_private for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists images_public_read on public.product_images;
drop policy if exists images_admin_write on public.product_images;
drop policy if exists images_admin_all on public.product_images;
create policy images_admin_all on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

-- Grants mínimos. `anon` no puede seleccionar products/variants y por ello tampoco ve `code`.
revoke all on public.admin_users,public.categories,public.category_attributes,public.products,public.product_colors,public.product_variants,public.inventory_private,public.product_images,public.audit_log from anon,authenticated;
grant select on public.categories,public.category_attributes to anon;
grant select on public.admin_users to authenticated;
grant select,insert,update,delete on public.categories,public.category_attributes,public.products,public.product_colors,public.product_variants,public.product_images,public.inventory_private to authenticated;
grant select on public.audit_log to authenticated;

-- ---------- Storage ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects for select to public using (bucket_id='product-images');
drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects for insert to authenticated with check (bucket_id='product-images' and public.is_admin());
drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects for update to authenticated using (bucket_id='product-images' and public.is_admin()) with check (bucket_id='product-images' and public.is_admin());
drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects for delete to authenticated using (bucket_id='product-images' and public.is_admin());

commit;

-- Dashboard Supabase (manual): Authentication > Providers > Email > desactivar registro público.
-- Crea el usuario admin manualmente y añade su UUID a public.admin_users.

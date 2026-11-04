-- Batting Shop V4 · Etapa 2 — snapshot acumulado para instalación nueva/revisión.
-- En una base existente, aplica las migraciones numeradas en orden y no este snapshot encima.

-- ===== 001_stage1_dynamic_catalog.sql =====
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

-- ---------- Administración / cuentas autorizadas ----------
create or replace function public.is_authorized_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()));
$$;
-- Solo la cuenta propietaria autorizada puede acceder sin 2FA.
-- Las demás cuentas administradoras conservan el requisito AAL2.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_authorized_admin() and (
    coalesce((select auth.jwt()->>'aal'),'aal1')='aal2'
    or exists (
      select 1 from public.admin_users a join auth.users u on u.id=a.user_id
      where a.user_id=(select auth.uid()) and a.role='owner'
        and lower(u.email)='battingshop.ve@gmail.com'
        and u.email_confirmed_at is not null
    )
  );
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

-- ===== 002_stage2_categories_pelotas.sql =====
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


-- ===== 003_stage3_slug_aliases.sql =====
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

-- Migración 004 acumulativa
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
begin;
-- Supabase concede EXECUTE explícito a anon/authenticated en funciones nuevas.
-- Retirarlo de los helpers; solo las cuatro RPC de lectura son API pública.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.prosecdef
 loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.get_public_catalog(),public.get_public_product(text),public.get_related_products(uuid,integer),public.get_public_cart_state(uuid[]) to anon,authenticated;
grant execute on function public.is_admin(),public.is_authorized_admin() to authenticated;
-- Estos validadores se ejecutan bajo las políticas del usuario admin.
alter function public.validate_category_attribute_payload(uuid,jsonb,jsonb,text) security invoker;
alter function public.variant_has_public_image(uuid,uuid) security invoker;
grant execute on function public.validate_category_attribute_payload(uuid,jsonb,jsonb,text),public.variant_has_public_image(uuid,uuid) to authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
commit;

-- Configuración de unidades por pedido
begin;
alter table public.products add column if not exists max_order_quantity integer not null default 99 check (max_order_quantity between 1 and 99);
CREATE OR REPLACE FUNCTION public.build_public_product(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object(
  'id',p.id,'slug',p.slug,'name',p.name,'brand',p.brand,'description',p.description,'price',p.price,'maxQuantity',p.max_order_quantity,
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
$function$

;
CREATE OR REPLACE FUNCTION public.get_public_cart_state(p_variant_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
if coalesce(cardinality(p_variant_ids),0)>50 then raise exception 'El pedido admite un máximo de 50 ids.' using errcode='22023'; end if;
return (select coalesce(jsonb_agg(jsonb_build_object(
 'variantId',v.id,'productId',p.id,'maxQuantity',p.max_order_quantity,'slug',p.slug,'name',p.name,'available',v.available,
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
$function$

;
commit;

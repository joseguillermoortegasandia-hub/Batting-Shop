begin;
-- Facturas privadas. No crea ni modifica productos.
create table public.purchase_invoices (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 1 and 180),
 invoice_number text not null check (char_length(btrim(invoice_number)) between 1 and 100),
 storage_path text not null unique check (char_length(storage_path) between 1 and 500),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.purchase_invoices enable row level security;
alter table public.purchase_invoices force row level security;
revoke all on public.purchase_invoices from anon,authenticated;
grant select,insert,update,delete on public.purchase_invoices to authenticated;
create policy invoices_admin_all on public.purchase_invoices for all to authenticated
 using ((select public.is_admin())) with check ((select public.is_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('purchase-invoices','purchase-invoices',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy invoices_admin_read on storage.objects for select to authenticated using (bucket_id='purchase-invoices' and (select public.is_admin()));
create policy invoices_admin_insert on storage.objects for insert to authenticated with check (bucket_id='purchase-invoices' and (select public.is_admin()));
create policy invoices_admin_update on storage.objects for update to authenticated using (bucket_id='purchase-invoices' and (select public.is_admin())) with check (bucket_id='purchase-invoices' and (select public.is_admin()));
create policy invoices_admin_delete on storage.objects for delete to authenticated using (bucket_id='purchase-invoices' and (select public.is_admin()));
commit;

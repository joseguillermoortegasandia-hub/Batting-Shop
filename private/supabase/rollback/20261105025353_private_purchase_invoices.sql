-- Requiere exportar y vaciar las facturas desde Storage antes de retirar el módulo.
begin;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='purchase-invoices') or exists(select 1 from public.purchase_invoices) then
  raise exception 'Exporta las facturas y vacía el bucket y la tabla antes del rollback.';
 end if;
end $$;
drop policy invoices_admin_read on storage.objects;
drop policy invoices_admin_insert on storage.objects;
drop policy invoices_admin_update on storage.objects;
drop policy invoices_admin_delete on storage.objects;
delete from storage.buckets where id='purchase-invoices';
drop table public.purchase_invoices;
commit;

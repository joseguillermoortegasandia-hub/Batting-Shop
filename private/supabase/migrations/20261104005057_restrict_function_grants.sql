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

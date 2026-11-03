-- Rollback conservador de Etapa 2. NO elimina datos existentes.
begin;
update public.categories set is_active=false,show_on_home=false where slug='pelotas';
drop trigger if exists products_limit_featured on public.products;
-- display_name y atributos se conservan para no perder ediciones realizadas por el dueño.
commit;

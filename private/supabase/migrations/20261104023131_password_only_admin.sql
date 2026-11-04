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
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

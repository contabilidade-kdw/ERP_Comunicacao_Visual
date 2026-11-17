-- Execute este arquivo no SQL Editor do projeto Supabase.
-- Cria isolamento por empresa no banco; não substitui boas práticas de senha e acesso.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('staff', 'client')) default 'client',
  created_at timestamptz not null default now()
);

-- Toda conta criada no Auth recebe automaticamente um perfil de cliente de forma segura.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role) 
  values (new.id, 'client')
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Evita que falhas no trigger derrubem a criação do usuário no auth.users
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.dashboard_data (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  payload jsonb not null,
  source_name text not null default 'Planilha cadastrada pela equipe',
  updated_at timestamptz not null default now()
);

create index if not exists organization_members_user_id_idx
  on public.organization_members(user_id);

-- SECURITY DEFINER impede recursão das políticas ao consultar perfis e vínculos.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'staff'
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
  );
$$;

-- Revoga acessos públicos e concede apenas a usuários autenticados
revoke all on function public.is_staff() from public;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

-- Permissões básicas de tabela para autenticados (as políticas RLS farão o filtro fino)
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.dashboard_data to authenticated;

-- Ativa RLS em todas as tabelas
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.dashboard_data enable row level security;

-- Políticas para profiles
drop policy if exists "profiles_read_self_or_staff" on public.profiles;
create policy "profiles_read_self_or_staff" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

-- Perfis e privilégios só são criados/alterados por operador confiável no painel SQL;
-- nunca conceda INSERT/UPDATE de profiles ao cliente web diretamente.

-- Políticas para organizations
drop policy if exists "organizations_read_member_or_staff" on public.organizations;
create policy "organizations_read_member_or_staff" on public.organizations
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_org_member(id)));

drop policy if exists "organizations_manage_staff" on public.organizations;
create policy "organizations_manage_staff" on public.organizations
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Políticas para organization_members
drop policy if exists "members_read_self_or_staff" on public.organization_members;
create policy "members_read_self_or_staff" on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "members_manage_staff" on public.organization_members;
create policy "members_manage_staff" on public.organization_members
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Políticas para dashboard_data
drop policy if exists "dashboard_read_member_or_staff" on public.dashboard_data;
create policy "dashboard_read_member_or_staff" on public.dashboard_data
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_org_member(organization_id)));

drop policy if exists "dashboard_manage_staff" on public.dashboard_data;
create policy "dashboard_manage_staff" on public.dashboard_data
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- INSTRUÇÃO PARA O PRIMEIRO ACESSO (STAFF):
-- Depois de criar o primeiro usuário interno no painel Supabase > Authentication > Users,
-- copie o UUID dele e execute o comando abaixo no SQL Editor para torná-lo staff:
--
-- insert into public.profiles (id, role)
-- values ('COLE_AQUI_O_UUID_DO_USUARIO_INTERNO', 'staff')
-- on conflict (id) do update set role = 'staff';
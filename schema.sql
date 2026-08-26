create extension if not exists "pgcrypto";

-- =============================================
-- ORGANIZATIONS (Multi-tenancy)
-- =============================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'inactive',
  subscription_current_period_end timestamptz,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =============================================
-- PROFILES (Extended user info)
-- =============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- =============================================
-- ORG MEMBERS (Role-based access)
-- =============================================
create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner_admin','manager','tenant','owner','vendor','admin')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  invite_email text,
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- =============================================
-- PROPERTIES
-- =============================================
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid references public.profiles(id),
  name text not null,
  address text,
  city text,
  country text,
  property_type text default 'residential',
  status text default 'active',
  created_at timestamptz not null default now()
);

-- =============================================
-- UNITS
-- =============================================
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  bedrooms int,
  bathrooms numeric,
  area_sqft numeric,
  rent_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) default 0,
  status text default 'vacant' check (status in ('vacant','occupied','reserved','maintenance')),
  created_at timestamptz not null default now()
);

-- =============================================
-- LEASES
-- =============================================
create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  tenant_user_id uuid not null references public.profiles(id),
  start_date date not null,
  end_date date not null,
  monthly_rent numeric(12,2) not null,
  security_deposit numeric(12,2),
  status text default 'active',
  signed_by_tenant boolean default false,
  signed_by_manager boolean default false,
  tenant_signature_url text,
  manager_signature_url text,
  lease_doc_url text,
  created_at timestamptz not null default now()
);

-- =============================================
-- RENT SCHEDULE (Auto-generated)
-- =============================================
create table if not exists public.rent_charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  tenant_user_id uuid not null references public.profiles(id),
  due_date date not null,
  amount numeric(12,2) not null,
  amount_paid numeric(12,2) default 0,
  status text default 'pending',
  created_at timestamptz not null default now()
);

-- =============================================
-- PAYMENTS
-- =============================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lease_id uuid references public.leases(id),
  charge_id uuid references public.rent_charges(id),
  payer_user_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  currency text default 'usd',
  method text default 'card',
  status text default 'pending',
  stripe_payment_intent text,
  receipt_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- =============================================
-- MAINTENANCE
-- =============================================
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id),
  property_id uuid not null references public.properties(id),
  reporter_user_id uuid not null references public.profiles(id),
  assigned_vendor_user_id uuid references public.profiles(id),
  title text not null,
  description text,
  priority text default 'medium',
  status text default 'open',
  photos jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- =============================================
-- DOCUMENTS (Private with signed URLs)
-- =============================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  uploaded_by uuid not null references public.profiles(id),
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- =============================================
-- AI CONVERSATIONS
-- =============================================
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- =============================================
-- INDEXES
-- =============================================
create index if not exists idx_org_members_org on org_members(org_id);
create index if not exists idx_org_members_user on org_members(user_id);
create index if not exists idx_properties_org on properties(org_id);
create index if not exists idx_units_org on units(org_id);
create index if not exists idx_units_prop on units(property_id);
create index if not exists idx_leases_org on leases(org_id);
create index if not exists idx_leases_tenant on leases(tenant_user_id);
create index if not exists idx_charges_org on rent_charges(org_id);
create index if not exists idx_charges_tenant on rent_charges(tenant_user_id);
create index if not exists idx_payments_org on payments(org_id);
create index if not exists idx_maint_org on maintenance_requests(org_id);
create index if not exists idx_maint_vendor on maintenance_requests(assigned_vendor_user_id);
create index if not exists idx_docs_org on documents(org_id);

-- =============================================
-- ENABLE RLS
-- =============================================
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.leases enable row level security;
alter table public.rent_charges enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.documents enable row level security;
alter table public.ai_messages enable row level security;

-- =============================================
-- HELPER FUNCTION
-- =============================================
create or replace function public.user_is_member_of(p_org_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.user_role_in(p_org_id uuid)
returns text language sql security definer as $$
  select role from public.org_members
  where org_id = p_org_id and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Organizations: users can see orgs they belong to
create policy "orgs_select" on public.organizations
for select to authenticated
using (public.user_is_member_of(id));

-- Profiles: users see their own + other members in same org
create policy "profiles_select" on public.profiles
for select to authenticated using (true);

create policy "profiles_insert_self" on public.profiles
for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Org members: only members of org can see/add/update
create policy "members_select" on public.org_members
for select to authenticated using (public.user_is_member_of(org_id));

create policy "members_insert" on public.org_members
for insert to authenticated
with check (
  public.user_is_member_of(org_id)
  and public.user_role_in(org_id) in ('owner_admin','manager','admin')
);

-- Properties, Units, Leases, Charges, Payments, Maintenance, Documents
create policy "org_data_select" on public.properties
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.units
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.leases
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.rent_charges
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.payments
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.maintenance_requests
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.documents
for select to authenticated using (public.user_is_member_of(org_id));

create policy "org_data_select" on public.ai_messages
for select to authenticated using (public.user_is_member_of(org_id));

-- Insert policies (only managers/admins/owners can create core data, tenants can submit maintenance)
create policy "properties_insert" on public.properties
for insert to authenticated
with check (
  public.user_is_member_of(org_id)
  and public.user_role_in(org_id) in ('owner_admin','manager','admin')
);

create policy "units_insert" on public.units
for insert to authenticated
with check (
  public.user_is_member_of(org_id)
  and public.user_role_in(org_id) in ('owner_admin','manager','admin')
);

create policy "leases_insert" on public.leases
for insert to authenticated
with check (
  public.user_is_member_of(org_id)
  and public.user_role_in(org_id) in ('owner_admin','manager','admin')
);

create policy "maintenance_insert" on public.maintenance_requests
for insert to authenticated
with check (public.user_is_member_of(org_id));

create policy "ai_insert" on public.ai_messages
for insert to authenticated with check (
  public.user_is_member_of(org_id) and user_id = auth.uid()
);

-- =============================================
-- PRIVATE STORAGE BUCKET
-- =============================================
insert into storage.buckets (id, name, public)
values ('private-files', 'private-files', false)
on conflict (id) do update set public = false;

create policy "storage_insert_members"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'private-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "storage_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'private-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "storage_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'private-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
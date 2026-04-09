create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  resource_name text not null,
  resource_description text not null,
  links text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_resources_created_at on public.resources(created_at desc);

alter table public.resources enable row level security;

drop policy if exists "read resources" on public.resources;
create policy "read resources" on public.resources for select to authenticated using (true);

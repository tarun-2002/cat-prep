create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  week_end_date date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (week_end_date >= week_start_date)
);

create table if not exists public.weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  subtopic_id uuid not null references public.subtopics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (weekly_plan_id, subtopic_id)
);

create index if not exists idx_weekly_plans_date_range on public.weekly_plans(week_start_date, week_end_date);
create index if not exists idx_weekly_plan_items_plan_id on public.weekly_plan_items(weekly_plan_id);

alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_items enable row level security;

drop policy if exists "read weekly plans" on public.weekly_plans;
create policy "read weekly plans" on public.weekly_plans for select to authenticated using (true);

drop policy if exists "read weekly plan items" on public.weekly_plan_items;
create policy "read weekly plan items" on public.weekly_plan_items for select to authenticated using (true);

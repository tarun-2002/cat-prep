create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics(id) on delete cascade,
  label text not null,
  url text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (subtopic_id, url)
);

create index if not exists idx_videos_subtopic_id on public.videos(subtopic_id);

alter table public.videos enable row level security;

drop policy if exists "read videos" on public.videos;
create policy "read videos" on public.videos for select to authenticated using (true);

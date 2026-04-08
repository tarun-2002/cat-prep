create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('QUANT', 'DILR', 'VARC')),
  title text not null,
  study_link text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  topic_questions_done int not null default 0,
  pyq_questions_done int not null default 0,
  topic_question_proof_urls text[] not null default '{}',
  pyq_proof_urls text[] not null default '{}',
  short_notes_urls text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.topic_submissions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('approved', 'rejected')),
  comment text,
  created_at timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);

alter table public.topics enable row level security;
alter table public.topic_submissions enable row level security;
alter table public.submission_reviews enable row level security;

drop policy if exists "read topics" on public.topics;
create policy "read topics" on public.topics for select to authenticated using (true);

drop policy if exists "owner reads own submissions" on public.topic_submissions;
create policy "owner reads own submissions" on public.topic_submissions for select to authenticated using (auth.uid() = user_id);

drop policy if exists "owner inserts own submissions" on public.topic_submissions;
create policy "owner inserts own submissions" on public.topic_submissions for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "reviewer reads review rows" on public.submission_reviews;
create policy "reviewer reads review rows" on public.submission_reviews for select to authenticated using (true);

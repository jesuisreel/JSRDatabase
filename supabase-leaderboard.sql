-- Shared leaderboard for merge-balls.html
-- Run this script in the Supabase SQL editor for the project used by the game.

create table if not exists public.merge_balls_scores (
  id bigint generated always as identity primary key,
  nickname text not null,
  score integer not null,
  created_at timestamptz not null default now(),
  constraint merge_balls_scores_nickname_length
    check (char_length(btrim(nickname)) between 1 and 20),
  constraint merge_balls_scores_score_positive
    check (score > 0)
);

create index if not exists merge_balls_scores_score_idx
  on public.merge_balls_scores (score desc, created_at asc);

create index if not exists merge_balls_scores_created_at_idx
  on public.merge_balls_scores (created_at desc);

alter table public.merge_balls_scores enable row level security;

-- The browser uses only the publishable/anon key. Anyone may read scores.
drop policy if exists "Anyone can read merge balls scores" on public.merge_balls_scores;
create policy "Anyone can read merge balls scores"
  on public.merge_balls_scores
  for select
  to anon, authenticated
  using (true);

-- Anyone may submit a positive score with a 1–20 character nickname.
-- There are intentionally no UPDATE or DELETE policies.
drop policy if exists "Anyone can submit merge balls scores" on public.merge_balls_scores;
create policy "Anyone can submit merge balls scores"
  on public.merge_balls_scores
  for insert
  to anon, authenticated
  with check (
    score > 0
    and char_length(btrim(nickname)) between 1 and 20
  );

-- Keep the API privileges explicit. RLS still controls which operations are allowed.
grant select, insert on table public.merge_balls_scores to anon, authenticated;
grant usage, select on sequence public.merge_balls_scores_id_seq to anon, authenticated;
revoke update, delete, truncate, references, trigger on table public.merge_balls_scores from anon, authenticated;

-- Optional abuse-control reminder: this public endpoint accepts client-reported
-- scores by design. Add authenticated users or server-side verification if needed.

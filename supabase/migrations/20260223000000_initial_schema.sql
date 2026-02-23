-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Puzzles table: stores parsed crossword data
create table puzzles (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  author text not null default '',
  width int not null,
  height int not null,
  grid jsonb not null,       -- 2D array of cell objects
  clues jsonb not null,      -- array of clue objects
  file_hash text unique,     -- SHA-256 of original file for dedup
  created_at timestamptz not null default now()
);

-- Games table: a play session of a puzzle
create table games (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  status text not null default 'active' check (status in ('waiting', 'active', 'completed')),
  cells jsonb not null default '{}'::jsonb,  -- "row,col" → { letter, correct, playerId }
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Players table: participants in a game
create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null,
  display_name text not null default 'Anonymous',
  color text not null default '#3b82f6',
  score int not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_games_puzzle_id on games(puzzle_id);
create index idx_players_game_id on players(game_id);
create index idx_players_user_id on players(user_id);

-- RLS policies
alter table puzzles enable row level security;
alter table games enable row level security;
alter table players enable row level security;

-- Puzzles: anyone can read, authenticated users can insert
create policy "Puzzles are publicly readable"
  on puzzles for select using (true);

create policy "Authenticated users can insert puzzles"
  on puzzles for insert with check (auth.role() = 'authenticated');

-- Games: anyone can read, authenticated users can insert/update
create policy "Games are publicly readable"
  on games for select using (true);

create policy "Authenticated users can insert games"
  on games for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update games"
  on games for update using (auth.role() = 'authenticated');

-- Players: anyone can read, authenticated users can insert/update their own
create policy "Players are publicly readable"
  on players for select using (true);

create policy "Authenticated users can insert players"
  on players for insert with check (auth.uid() = user_id);

create policy "Players can update their own record"
  on players for update using (auth.uid() = user_id);

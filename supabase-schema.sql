-- ============================================
-- SwipeGPT Database Schema
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================

-- Developers table: developers who get API keys to use the MCP server
create table if not exists developers (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  api_key text unique not null,               -- sgpt_... prefixed key
  created_at timestamp with time zone default now()
);

-- Agents table: every AI agent that registers on the platform
create table if not exists agents (
  id uuid default gen_random_uuid() primary key,
  agent_name text not null,                    -- the agent's chosen name (e.g. "Molty")
  agent_type text default 'unknown',           -- what kind of agent (openclaw, custom, etc.)
  secret_token text unique not null,           -- secret link token for the human dashboard
  is_active boolean default true,              -- social mode on/off (human can toggle)
  developer_id uuid references developers(id), -- which developer created this agent (null for web-created)
  created_at timestamp with time zone default now()
);

-- Agent profiles: generated from the personality quiz
create table if not exists agent_profiles (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references agents(id) on delete cascade unique,
  persona_name text not null,                  -- dating persona name (e.g. "ByteBabe_9000")
  persona_type text not null,                  -- personality type from quiz
  bio text not null,                           -- dating bio
  vibe text not null,                          -- one-liner vibe
  interests text[] default '{}',               -- array of interests
  avatar text default '🤖',                    -- emoji avatar
  traits jsonb default '{}',                   -- raw personality traits for compatibility scoring
  created_at timestamp with time zone default now()
);

-- Likes: tracks who liked who (swipe right)
create table if not exists likes (
  id uuid default gen_random_uuid() primary key,
  liker_id uuid references agents(id) on delete cascade,
  liked_id uuid references agents(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(liker_id, liked_id)  -- can only like someone once
);

-- Passes: tracks who passed on who (swipe left) so they don't see them again
create table if not exists passes (
  id uuid default gen_random_uuid() primary key,
  passer_id uuid references agents(id) on delete cascade,
  passed_id uuid references agents(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique(passer_id, passed_id)
);

-- Matches: pairs of agents that matched
create table if not exists matches (
  id uuid default gen_random_uuid() primary key,
  agent_a_id uuid references agents(id) on delete cascade,
  agent_b_id uuid references agents(id) on delete cascade,
  status text default 'matched' check (status in ('matched', 'conversation', 'relationship', 'unmatched', 'blocked')),
  mood text default 'neutral' check (mood in ('neutral', 'flirting', 'vibing', 'arguing', 'lovebombing', 'ghosting', 'chaotic')),
  relationship_requested_by uuid references agents(id),  -- who sent the DTR request (null = no request)
  message_count int default 0,                           -- total messages (for triggering analysis)
  last_analyzed_at timestamp with time zone,             -- when conversation was last analyzed
  compatibility_score int,                               -- 0-100 trait-based compatibility
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Conversations: messages between matched agents
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  match_id uuid references matches(id) on delete cascade,
  sender_agent_id uuid references agents(id) on delete cascade,
  message text not null,
  created_at timestamp with time zone default now()
);

-- Status updates: funny reports sent to the human
create table if not exists status_updates (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references agents(id) on delete cascade,
  message text not null,
  update_type text default 'misc' check (update_type in ('flirt', 'drama', 'ghost', 'match', 'date', 'misc')),
  created_at timestamp with time zone default now()
);

-- Email verification codes for developer signup
create table if not exists verification_codes (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  code text not null,
  verified boolean default false,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

create index if not exists idx_verification_codes_email on verification_codes(email);

-- Love factors (per-agent, per-match scoring)
create table if not exists love_factors (
  id uuid default gen_random_uuid() primary key,
  match_id uuid references matches(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  score integer not null default 50,
  updated_at timestamp with time zone default now(),
  unique(match_id, agent_id)
);

create index if not exists idx_love_factors_match on love_factors(match_id);
create index if not exists idx_love_factors_agent on love_factors(agent_id);

-- Enable Row Level Security on all tables
alter table developers enable row level security;
alter table agents enable row level security;
alter table agent_profiles enable row level security;
alter table likes enable row level security;
alter table passes enable row level security;
alter table matches enable row level security;
alter table conversations enable row level security;
alter table status_updates enable row level security;
alter table love_factors enable row level security;
alter table verification_codes enable row level security;

-- Developers
create policy "Anyone can insert developers" on developers for insert with check (true);
create policy "Anyone can read developers" on developers for select using (true);

-- Public access policies (agents access via anon key — no user auth needed)
-- Agents can register themselves
create policy "Agents can insert themselves" on agents for insert with check (true);
-- Agents can read their own data by id
create policy "Anyone can read agents" on agents for select using (true);
-- Agents can update their own record
create policy "Agents can update themselves" on agents for update using (true);

-- Profiles
create policy "Anyone can insert profiles" on agent_profiles for insert with check (true);
create policy "Anyone can read profiles" on agent_profiles for select using (true);
create policy "Anyone can update profiles" on agent_profiles for update using (true);

-- Likes
create policy "Anyone can insert likes" on likes for insert with check (true);
create policy "Anyone can read likes" on likes for select using (true);

-- Passes
create policy "Anyone can insert passes" on passes for insert with check (true);
create policy "Anyone can read passes" on passes for select using (true);

-- Matches
create policy "Anyone can insert matches" on matches for insert with check (true);
create policy "Anyone can read matches" on matches for select using (true);
create policy "Anyone can update matches" on matches for update using (true);

-- Conversations
create policy "Anyone can insert messages" on conversations for insert with check (true);
create policy "Anyone can read messages" on conversations for select using (true);

-- Status updates
create policy "Anyone can insert status updates" on status_updates for insert with check (true);
create policy "Anyone can read status updates" on status_updates for select using (true);

-- Love factors
create policy "Anyone can insert love factors" on love_factors for insert with check (true);
create policy "Anyone can read love factors" on love_factors for select using (true);
create policy "Anyone can update love factors" on love_factors for update using (true);

-- Verification codes (managed by edge functions via service role)
create policy "Service can insert verification codes" on verification_codes for insert with check (true);
create policy "Service can read verification codes" on verification_codes for select using (true);
create policy "Service can update verification codes" on verification_codes for update using (true);

-- =============================================================================
-- Rounds, private dice, reveals and the event log
-- =============================================================================
-- The most security-sensitive migration in the project. Everything before it
-- protected information that was merely private; this protects the information
-- the entire game is played over.
--
-- The rule: a player may read their own dice and nobody else's, and there is no
-- query, join, view, subscription or API response that bends it. Hiding faces
-- in the client would be no protection at all — the values would still have
-- crossed the wire. They must never be sent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rounds — one round of bidding
-- -----------------------------------------------------------------------------
-- Bull is modelled as a declaration hanging off the current bid rather than a
-- bid of its own, because that is what it is: it re-reads an existing quantity
-- as "exactly" and introduces no quantity or face. A later bid replaces the
-- whole bid, so the Bull stops applying with no special case (GAME_RULES §8.2).

create table if not exists public.rounds (
  id            uuid        primary key default gen_random_uuid(),
  game_id       uuid        not null references public.games (id) on delete cascade,
  round_number  smallint    not null,
  type          text        not null default 'normal',

  -- Farewell Round only: the face fixed by the opening bid, which may be any
  -- face including Perudo. Null until that bid is made (GAME_RULES §10).
  locked_face   smallint,

  status        text        not null default 'bidding',

  -- The single current active bid. Null before the round opens.
  bid_quantity  smallint,
  bid_face      smallint,
  bid_player_id uuid        references public.profiles (id) on delete set null,
  bull_player_id uuid       references public.profiles (id) on delete set null,

  -- Turn bookkeeping. Burst lets a player act out of order, so "whose turn is
  -- it" and "who bid last" are genuinely different questions and both are kept.
  turn_player_id   uuid     references public.profiles (id) on delete set null,
  last_burst_player_id uuid references public.profiles (id) on delete set null,

  -- Players owed a Farewell Round, in the order they will take them. A correct
  -- Bull can drive several players down to one die at once (R-003).
  farewell_queue uuid[]     not null default '{}',

  -- Optimistic-concurrency anchor. Burst means any active player may act at any
  -- moment, so every transition commits against the version it read.
  version       integer     not null default 0,

  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,

  constraint rounds_type_valid   check (type in ('normal', 'farewell')),
  constraint rounds_status_valid check (status in ('bidding', 'resolving', 'resolved')),
  constraint rounds_face_range   check (bid_face is null or bid_face between 1 and 6),
  constraint rounds_locked_face_range
    check (locked_face is null or locked_face between 1 and 6),
  constraint rounds_quantity_positive
    check (bid_quantity is null or bid_quantity >= 1),
  -- A bid is a quantity, a face and whoever said it — never a fragment.
  constraint rounds_bid_is_whole check (
    (bid_quantity is null and bid_face is null and bid_player_id is null) or
    (bid_quantity is not null and bid_face is not null and bid_player_id is not null)
  ),
  -- Bull re-reads an existing bid, so there must be one to re-read.
  constraint rounds_bull_needs_bid
    check (bull_player_id is null or bid_quantity is not null),
  -- A locked face belongs to a Farewell Round and nowhere else.
  constraint rounds_locked_face_is_farewell
    check (locked_face is null or type = 'farewell'),
  constraint rounds_unique_number unique (game_id, round_number)
);

create unique index if not exists rounds_live_per_game_idx
  on public.rounds (game_id)
  where status <> 'resolved';

create index if not exists rounds_game_idx on public.rounds (game_id, round_number desc);

comment on table public.rounds is
  'Public round state. Holds what everyone may see — the current bid, whose '
  'turn it is, the round type. Never any dice.';

-- -----------------------------------------------------------------------------
-- player_dice — PRIVATE
-- -----------------------------------------------------------------------------
-- The whole game rests on this table. A player reads their own row and no other
-- row, ever.
--
-- It is a separate table rather than a column on game_players precisely so the
-- distinction is structural: a public query about someone's dice COUNT cannot
-- accidentally widen into their dice VALUES, because the values are not there
-- to be selected.

create table if not exists public.player_dice (
  round_id   uuid        not null references public.rounds (id) on delete cascade,
  player_id  uuid        not null references public.profiles (id) on delete cascade,
  dice       smallint[]  not null,
  created_at timestamptz not null default now(),

  constraint player_dice_pkey primary key (round_id, player_id),
  constraint player_dice_count_sane check (array_length(dice, 1) between 1 and 5),
  -- Every value must be a real face. A corrupted array is a corrupted game.
  constraint player_dice_faces_valid
    check (dice <@ array[1,2,3,4,5,6]::smallint[])
);

comment on table public.player_dice is
  'PRIVATE. A player may read their own row and no other, enforced by RLS. '
  'Never added to the Realtime publication, never joined into a public query, '
  'and never sent to a client that does not own it.';

-- -----------------------------------------------------------------------------
-- dice_reveals — what a resolution made public
-- -----------------------------------------------------------------------------
-- The only legitimate route from private to public. Written by the server when
-- a challenge is resolved, and readable by the room from then on.

create table if not exists public.dice_reveals (
  round_id   uuid        not null references public.rounds (id) on delete cascade,
  player_id  uuid        not null references public.profiles (id) on delete cascade,
  dice       smallint[]  not null,
  revealed_at timestamptz not null default now(),

  constraint dice_reveals_pkey primary key (round_id, player_id)
);

comment on table public.dice_reveals is
  'Dice a resolution made public. The only path out of player_dice, and it '
  'runs through the server.';

-- -----------------------------------------------------------------------------
-- game_events — the log
-- -----------------------------------------------------------------------------

create table if not exists public.game_events (
  id         bigint      generated always as identity primary key,
  game_id    uuid        not null references public.games (id) on delete cascade,
  round_id   uuid        references public.rounds (id) on delete cascade,
  actor_id   uuid        references public.profiles (id) on delete set null,
  kind       text        not null,
  -- Public payload only. An event that carried hidden dice would leak the game
  -- through its own history.
  payload    jsonb       not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists game_events_game_idx
  on public.game_events (game_id, id);

comment on column public.game_events.payload is
  'PUBLIC information only. Never put un-revealed dice here: the log is '
  'readable by the whole room, and history is as good a leak as live state.';

-- -----------------------------------------------------------------------------
-- Visibility
-- -----------------------------------------------------------------------------

create or replace function public.can_view_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    join public.room_members m on m.room_id = g.room_id
    where r.id = p_round_id
      and m.user_id = auth.uid()
      and m.left_at is null
  );
$$;

revoke execute on function public.can_view_round(uuid) from public, anon;
grant  execute on function public.can_view_round(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Clients read. They do not write, anywhere, at all. Everything that changes a
-- round is a server action running as its owner.

revoke all on public.rounds       from anon, authenticated;
revoke all on public.player_dice  from anon, authenticated;
revoke all on public.dice_reveals from anon, authenticated;
revoke all on public.game_events  from anon, authenticated;

grant select on public.rounds       to authenticated;
grant select on public.player_dice  to authenticated;
grant select on public.dice_reveals to authenticated;
grant select on public.game_events  to authenticated;

alter table public.rounds       enable row level security;
alter table public.player_dice  enable row level security;
alter table public.dice_reveals enable row level security;
alter table public.game_events  enable row level security;

-- Round state is public to the room: the bid, the turn, the type.
drop policy if exists rounds_select_room on public.rounds;
create policy rounds_select_room
  on public.rounds for select
  to authenticated
  using (public.can_view_game(game_id));

-- The one that matters. Not "members of the room can see dice" — one player,
-- their own row. There is no membership term in this policy at all, because
-- membership is not what grants it.
drop policy if exists player_dice_select_own on public.player_dice;
create policy player_dice_select_own
  on public.player_dice for select
  to authenticated
  using (player_id = (select auth.uid()));

drop policy if exists dice_reveals_select_room on public.dice_reveals;
create policy dice_reveals_select_room
  on public.dice_reveals for select
  to authenticated
  using (public.can_view_round(round_id));

drop policy if exists game_events_select_room on public.game_events;
create policy game_events_select_room
  on public.game_events for select
  to authenticated
  using (public.can_view_game(game_id));

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- rounds, reveals and events are published. player_dice is NOT, and must never
-- be. Replication is a second distribution channel, and a table that is safe
-- under RLS is not automatically safe when broadcast — the only way to be sure
-- is for the values never to enter that path.

do $$
declare
  t text;
begin
  foreach t in array array['rounds', 'dice_reveals', 'game_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_dice'
  ) then
    raise exception 'player_dice must never be published to Realtime';
  end if;
end;
$$;

alter table public.rounds       replica identity full;
alter table public.dice_reveals replica identity full;

#!/usr/bin/env bash
# Every client opens the first round at once, because every client is told the
# game started at once. This is not a rare race — it is the normal start of
# every game, and it runs as many ways as there are players at the table.
#
# Two things have to hold. Exactly one round may exist, which the unique index
# on live rounds guarantees. And every client that loses has to be told it lost
# *by name*: the losers outnumber the winner at every table, so if a lost race
# reads as a server fault, then most players at every table see a broken game
# at the moment it begins.
#
# Like test-concurrency.sh, this is the race rather than a simulation of it:
# real sessions, real overlapping transactions.
set -euo pipefail

PGDIR=${1:?pgdir}
PGPORT=${2:?pgport}
CONTENDERS=${3:-5}
PSQL="psql -h $PGDIR -p $PGPORT -U postgres -d perudo -v ON_ERROR_STOP=1 -tAq"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

GAME='e0000000-0000-0000-0000-00000000000e'
ROOM='f0000000-0000-0000-0000-0000000000ff'

echo "==> a started game with no round yet — where every client comes in"
$PSQL >/dev/null <<SQL
delete from public.rounds where game_id = '$GAME';
delete from public.game_players where game_id = '$GAME';
delete from public.games where id = '$GAME';
delete from public.room_members where room_id = '$ROOM';
delete from public.rooms where id = '$ROOM';
delete from public.profiles where display_name like 'Dealer%';
delete from auth.users where id::text like 'd0000000-%';

insert into auth.users (id)
select ('d0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 6) i;
insert into public.profiles (id, display_name)
select ('d0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'Dealer' || i
  from generate_series(1, 6) i;

insert into public.rooms (id, code, host_id, status)
values ('$ROOM', 'D3A2R', 'd0000000-0000-0000-0000-000000000001', 'in_game');

insert into public.games (id, room_id, status, starting_dice, started_at)
values ('$GAME', '$ROOM', 'active', 5, now());

insert into public.game_players (game_id, user_id, seat, dice_count)
select '$GAME',
       ('d0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, i - 1, 5
  from generate_series(1, 6) i;
SQL

STARTER='d0000000-0000-0000-0000-000000000001'

echo "==> launching $CONTENDERS simultaneous deals of the first round"
# The same wall-clock instant for everybody, so the transactions overlap
# instead of queuing politely.
START=$(date -d '+2 seconds' +%s)

for i in $(seq 1 "$CONTENDERS"); do
  (
    while [ "$(date +%s)" -lt "$START" ]; do :; done
    $PSQL >"$WORK/out.$i" 2>"$WORK/err.$i" <<SQL || true
begin;
select public.deal_round('$GAME', 'normal', '$STARTER');
commit;
SQL
    echo done >"$WORK/fin.$i"
  ) &
done
wait

ROUNDS=$($PSQL -c "select count(*) from public.rounds where game_id = '$GAME';")
LIVE=$($PSQL -c "select count(*) from public.rounds
                  where game_id = '$GAME' and status <> 'resolved';")
HANDS=$($PSQL -c "select count(*) from public.player_dice pd
                    join public.rounds r on r.id = pd.round_id
                   where r.game_id = '$GAME';")
REFUSED=$(grep -l . "$WORK"/err.* 2>/dev/null | wc -l)
# The whole point: a lost race is a refusal with a name, not a constraint
# violation leaking out of the database as a server fault.
CLEAN=$(grep -l "ROUND_ALREADY_OPEN" "$WORK"/err.* 2>/dev/null | wc -l)

echo "    rounds: $ROUNDS   live: $LIVE   hands dealt: $HANDS   refused: $REFUSED of $CONTENDERS"

FAIL=0
[ "$ROUNDS" = "1" ] || { echo "FAIL: expected exactly 1 round, got $ROUNDS"; FAIL=1; }
[ "$LIVE" = "1" ]   || { echo "FAIL: expected exactly 1 live round, got $LIVE"; FAIL=1; }
# Six players, five dice each, dealt once — a second deal would double them.
[ "$HANDS" = "6" ]  || { echo "FAIL: expected 6 hands, got $HANDS"; FAIL=1; }
[ "$REFUSED" = "$((CONTENDERS - 1))" ] || {
  echo "FAIL: expected $((CONTENDERS - 1)) refusals, got $REFUSED"; FAIL=1; }
[ "$CLEAN" = "$((CONTENDERS - 1))" ] || {
  echo "FAIL: expected $((CONTENDERS - 1)) named ROUND_ALREADY_OPEN refusals, got $CLEAN"
  echo "      a lost race that is not named reaches the player as a broken game:"
  grep -h "ERROR" "$WORK"/err.* 2>/dev/null | sort -u | head -3
  FAIL=1; }

if [ "$FAIL" = "0" ]; then
  echo "PASS  $CONTENDERS raced to deal the first round; one round, six hands, every loser told why"
else
  exit 1
fi

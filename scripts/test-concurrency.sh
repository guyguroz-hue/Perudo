#!/usr/bin/env bash
# The hard requirement: six players are seated, several more try to join at the
# same instant, and exactly six players exist afterwards. Never seven.
#
# This is not a simulation of the race — it is the race. Several real PostgreSQL
# sessions, in real concurrent transactions, contending for the same seat. It
# runs against the schema WITHOUT any application-level locking, because the
# point is that the schema alone already makes a seventh player impossible. The
# row lock the join RPC will take is an optimisation for error messages, not the
# thing keeping the guarantee.
set -euo pipefail

PGDIR=${1:?pgdir}
PGPORT=${2:?pgport}
CONTENDERS=${3:-5}
PSQL="psql -h $PGDIR -p $PGPORT -U postgres -d perudo -v ON_ERROR_STOP=1 -tAq"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "==> seating five players, leaving exactly one seat free"
$PSQL >/dev/null <<'SQL'
delete from public.room_members where room_id = 'f0000000-0000-0000-0000-00000000000f';
delete from public.rooms where id = 'f0000000-0000-0000-0000-00000000000f';
delete from public.profiles where display_name like 'Racer%';
delete from auth.users where id in (
  select id from auth.users where id::text like 'c0000000-%');

insert into auth.users (id)
select ('c0000000-0000-0000-0000-00000000000' || i)::uuid from generate_series(1, 9) i;
insert into public.profiles (id, display_name)
select ('c0000000-0000-0000-0000-00000000000' || i)::uuid, 'Racer' || i
  from generate_series(1, 9) i;

insert into public.rooms (id, code, host_id)
values ('f0000000-0000-0000-0000-00000000000f', 'R4CER',
        'c0000000-0000-0000-0000-000000000001');

insert into public.room_members (room_id, user_id, seat)
select 'f0000000-0000-0000-0000-00000000000f',
       ('c0000000-0000-0000-0000-00000000000' || i)::uuid, i - 1
  from generate_series(1, 5) i;
SQL

echo "==> launching $CONTENDERS simultaneous joins for the last seat"
# Every contender waits for the same wall-clock instant before acting, so the
# transactions genuinely overlap instead of queuing politely.
START=$(date -d '+2 seconds' +%s)

for i in $(seq 6 $((5 + CONTENDERS))); do
  (
    while [ "$(date +%s)" -lt "$START" ]; do :; done
    $PSQL >"$WORK/out.$i" 2>"$WORK/err.$i" <<SQL || true
begin;
insert into public.room_members (room_id, user_id, seat)
select 'f0000000-0000-0000-0000-00000000000f',
       'c0000000-0000-0000-0000-00000000000$i'::uuid,
       min(s.seat)
  from generate_series(0, 5) s(seat)
 where not exists (
   select 1 from public.room_members m
    where m.room_id = 'f0000000-0000-0000-0000-00000000000f'
      and m.seat = s.seat
      and m.left_at is null);
commit;
SQL
    echo done >"$WORK/fin.$i"
  ) &
done
wait

SEATED=$($PSQL -c "select count(*) from public.room_members
                    where room_id = 'f0000000-0000-0000-0000-00000000000f'
                      and left_at is null;")
DISTINCT=$($PSQL -c "select count(distinct seat) from public.room_members
                      where room_id = 'f0000000-0000-0000-0000-00000000000f'
                        and left_at is null;")
REJECTED=$(grep -l . "$WORK"/err.* 2>/dev/null | wc -l)

echo "    seated: $SEATED   distinct seats: $DISTINCT   rejected: $REJECTED of $CONTENDERS"

FAIL=0
[ "$SEATED" = "6" ]   || { echo "FAIL: expected exactly 6 seated, got $SEATED"; FAIL=1; }
[ "$DISTINCT" = "6" ] || { echo "FAIL: seats collided, $DISTINCT distinct for $SEATED members"; FAIL=1; }
[ "$REJECTED" = "$((CONTENDERS - 1))" ] || {
  echo "FAIL: expected $((CONTENDERS - 1)) rejections, got $REJECTED"; FAIL=1; }

if [ "$FAIL" = "0" ]; then
  echo "PASS  $CONTENDERS raced for one seat; exactly one won and the room holds six"
else
  exit 1
fi

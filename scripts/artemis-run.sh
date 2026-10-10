#!/usr/bin/env bash
# Full-pack balance run on artemis.jeiang.vpn without overloading it.
# Spec: docs/spec/tools/artemis-run.md
#
# usage: scripts/artemis-run.sh [--dry-run] [--jobs N] <slug> <ref> [-- harness args...]
#
# Run it from any machine: it ships itself to artemis over ssh (BatchMode) and
# re-executes there in the hidden `--remote` mode. Progress goes to stderr; the
# last stdout line is the report path on artemis (report.md).
set -euo pipefail

HOST=${ARTEMIS_HOST:-artemis.jeiang.vpn}
SAFE='^[A-Za-z0-9._/@+=-]+$'
USAGE='usage: scripts/artemis-run.sh [--dry-run] [--jobs N] <slug> <ref> [-- harness args...]
  slug   [a-z0-9-]+; names the worktree ~/Projects/life-sim/<slug> on artemis
  ref    branch, tag or commit of jeiang/life-sim
  env    ARTEMIS_SLOTS (concurrent runs, default 2)  ARTEMIS_TIMEOUT (seconds, default 7200)
         ARTEMIS_QUEUE_WAIT (seconds to queue for a slot or low load, default 900)
         ARTEMIS_HOST  ARTEMIS_LOADAVG_FILE (test fixture, default /proc/loadavg)
  default harness args: --lives 10000; --jobs defaults to min(4, cores-2) and is capped at cores-2'

log() { printf '%s artemis-run[%s]: %s\n' "$(date -u +%FT%TZ)" "${slug:-?}" "$*" >&2; }
die() { log "$*"; exit "${2:-1}"; }

# ---------------------------------------------------------------- remote side
remote_main() {
  local dry=$1 jobs=$2 slug=$3 ref=$4
  shift 4
  local hargs=("$@")
  # bare, wt, watchdog and runpid are global: the EXIT/signal traps outlive this function's scope.
  local base=$HOME/Projects/life-sim locks store reports
  bare=$base/.bare locks=$base/.locks store=$base/.pnpm-store reports=$base/reports wt=$base/$slug
  local cores slots timeout_s queue_wait loadfile max_jobs deadline
  cores=$(nproc)
  slots=${ARTEMIS_SLOTS:-2}
  timeout_s=${ARTEMIS_TIMEOUT:-7200}
  queue_wait=${ARTEMIS_QUEUE_WAIT:-900}
  loadfile=${ARTEMIS_LOADAVG_FILE:-/proc/loadavg}
  [[ $slots =~ ^[1-9][0-9]*$ && $timeout_s =~ ^[1-9][0-9]*$ && $queue_wait =~ ^[0-9]+$ ]] \
    || die "ARTEMIS_SLOTS/ARTEMIS_TIMEOUT must be positive integers, ARTEMIS_QUEUE_WAIT a non-negative integer" 2
  max_jobs=$((cores - 2))
  ((max_jobs >= 1)) || max_jobs=1
  if [[ -z $jobs ]]; then
    jobs=4
    ((jobs <= max_jobs)) || jobs=$max_jobs
  elif ((jobs > max_jobs)); then
    log "--jobs $jobs exceeds cores-2; capped to $max_jobs"
    jobs=$max_jobs
  elif ((jobs < 1)); then
    die "--jobs must be at least 1" 2
  fi
  local has_lives=0 h
  for h in "${hargs[@]}"; do [[ $h == --lives || $h == --lives=* ]] && has_lives=1; done
  ((has_lives)) || hargs=(--lives 10000 "${hargs[@]}")
  for h in "${hargs[@]}"; do
    [[ $h == --jobs || $h == --jobs=* || $h == --out || $h == --out=* ]] \
      && die "do not pass $h through; use the script's --jobs, --out is managed" 2
  done

  load1() { cut -d' ' -f1 "$loadfile"; }
  load_high() { awk -v l="$(load1)" -v c="$cores" 'BEGIN { exit !(l > c) }'; }

  if [[ $dry == 1 ]]; then
    cat >&2 <<EOF
plan (dry run, nothing changed):
  host          $(hostname) ($cores cores, 1-min load $(load1), refuse/queue above $cores)
  bare clone    $bare (fetch heads and tags of https://github.com/jeiang/life-sim.git)
  worktree      $wt at $ref (detached), removed at the end and on signal
  pnpm store    $store (shared)
  slots         $slots concurrent run(s) via flock in $locks, queue up to ${queue_wait}s then refuse
  limits        nice -n 10, ionice -c3, --jobs $jobs (max $max_jobs), timeout ${timeout_s}s
  steps         nix develop -c pnpm install --frozen-lockfile --store-dir <store>
                nix develop -c pnpm harness ${hargs[*]} --jobs $jobs --out $reports/$slug-<sha7>-<utc>
  report        $reports/$slug-<sha7>-<utc>/report.md (printed as the last line)
EOF
    printf '%s\n' "$reports/$slug-<sha7>-<utc>/report.md"
    return 0
  fi

  mkdir -p "$locks" "$reports" "$store"
  deadline=$((SECONDS + queue_wait))

  # Per-slug lock: one run per slug (same worktree path).
  local slugfd
  exec {slugfd}>"$locks/slug.$slug"
  flock -n "$slugfd" || die "slug '$slug' already has a run in progress; refusing" 75

  # Global slot: flock on one of N slot files; queue until the deadline.
  local fd i slot=
  while [[ -z $slot ]]; do
    for ((i = 1; i <= slots; i++)); do
      exec {fd}>"$locks/slot.$i"
      if flock -n "$fd"; then
        slot=$i
        break
      fi
      exec {fd}>&-
    done
    [[ -n $slot ]] && break
    ((SECONDS < deadline)) || die "all $slots slot(s) busy for ${queue_wait}s; refusing" 75
    log "queued: all $slots slot(s) busy"
    sleep 5
  done
  log "slot $slot/$slots acquired"

  # Load gate: queue until the 1-minute load average is at most the core count.
  while load_high; do
    ((SECONDS < deadline)) || die "1-min load $(load1) > $cores cores for ${queue_wait}s; refusing" 75
    log "queued: 1-min load $(load1) > $cores cores"
    sleep 5
  done
  log "load $(load1) <= $cores cores, proceeding"

  # Bare clone (shared) and ref resolution.
  (
    flock -w 600 9 || exit 1
    if [[ ! -d $bare ]]; then
      log "cloning bare repo"
      git clone -q --bare https://github.com/jeiang/life-sim.git "$bare"
    fi
    git -C "$bare" fetch -q --force --tags origin '+refs/heads/*:refs/remotes/origin/*'
  ) 9>"$locks/bare" </dev/null || die "could not update the bare clone"
  local sha
  sha=$(git -C "$bare" rev-parse --verify --quiet "refs/remotes/origin/$ref^{commit}" \
    || git -C "$bare" rev-parse --verify --quiet "refs/tags/$ref^{commit}" \
    || git -C "$bare" rev-parse --verify --quiet "$ref^{commit}") || die "cannot resolve ref '$ref'" 2
  log "ref $ref = ${sha:0:12}"

  local out=$reports/$slug-${sha:0:7}-$(date -u +%Y%m%dT%H%M%SZ)
  local main_pid=$$
  watchdog= runpid=
  cleanup() {
    [[ -n $watchdog ]] && { pkill -P "$watchdog" 2>/dev/null; kill "$watchdog" 2>/dev/null; } || true
    if [[ -e $wt ]]; then
      git -C "$bare" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
      git -C "$bare" worktree prune 2>/dev/null || true
      log "worktree removed"
    fi
  }
  trap cleanup EXIT
  # The run is a background job we `wait` on, so a signal is handled at once
  # (bash defers traps while a foreground child runs).
  trap 'log "signal received; stopping the run"; [[ -n $runpid ]] && { kill -TERM "$runpid" 2>/dev/null; wait "$runpid" 2>/dev/null; }; exit 143' INT TERM HUP

  # The ssh stdin pipe stays open for the run; EOF means the client went away.
  # (Background jobs get /dev/null as stdin, so dup the real one first.)
  local sin
  exec {sin}<&0
  # It must not inherit the slot and slug locks, or they outlive the run.
  ( exec {fd}>&- {slugfd}>&-; cat <&"$sin" >/dev/null; kill -TERM "$main_pid" 2>/dev/null ) &
  watchdog=$!

  if [[ -e $wt ]]; then
    log "removing stale worktree $wt"
    git -C "$bare" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
  fi
  git -C "$bare" worktree prune
  git -C "$bare" worktree add -q --detach "$wt" "$sha" </dev/null
  mkdir -p "$out"

  log "running: --jobs $jobs ${hargs[*]} (timeout ${timeout_s}s, nice 10, ionice idle)"
  local rc=0
  (
    cd "$wt"
    export npm_config_store_dir=$store
    exec timeout --kill-after=30 "$timeout_s" nice -n 10 ionice -c3 \
      nix develop -c bash -c 'set -e; pnpm install --frozen-lockfile --store-dir "$1"; shift; exec pnpm harness "$@"' \
      _ "$store" "${hargs[@]}" --jobs "$jobs" --out "$out"
  ) </dev/null >&2 &
  runpid=$!
  wait "$runpid" || rc=$?
  runpid=
  case $rc in
    0) log "harness finished" ;;
    124 | 137) log "wall-clock timeout (${timeout_s}s) hit" ;;
    *) log "harness exited with status $rc" ;;
  esac
  if [[ -f $out/report.md ]]; then
    trap - EXIT
    cleanup
    printf '%s\n' "$out/report.md"
    return "$rc"
  fi
  return "${rc/#0/1}"
}

# ----------------------------------------------------------------- local side
main() {
  local dry=0 jobs= remote=0 pos=() pass=()
  while (($#)); do
    case $1 in
      --remote) remote=1 ;;
      --dry-run) dry=1 ;;
      --jobs) jobs=${2:-}; shift ;;
      --jobs=*) jobs=${1#--jobs=} ;;
      -h | --help) echo "$USAGE"; exit 0 ;;
      --) shift; pass=("$@"); break ;;
      -*) die "unknown option $1
$USAGE" 2 ;;
      *) pos+=("$1") ;;
    esac
    shift
  done
  ((${#pos[@]} == 2)) || die "expected <slug> <ref>
$USAGE" 2
  slug=${pos[0]} ref=${pos[1]}
  [[ $slug =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "slug must match [a-z0-9][a-z0-9-]*" 2
  [[ $ref =~ $SAFE && $ref != -* && $ref != *..* ]] || die "ref has unsupported characters" 2
  [[ -z $jobs || $jobs =~ ^[0-9]+$ ]] || die "--jobs must be an integer" 2
  local a
  for a in ${pass[@]+"${pass[@]}"}; do
    [[ $a =~ $SAFE ]] || die "harness arg '$a' has unsupported characters" 2
  done

  if ((remote)); then
    remote_main "$dry" "$jobs" "$slug" "$ref" ${pass[@]+"${pass[@]}"}
    return
  fi

  # Ship this script over stdin and keep the pipe open until we exit.
  local envs=() v
  for v in ARTEMIS_SLOTS ARTEMIS_TIMEOUT ARTEMIS_QUEUE_WAIT ARTEMIS_LOADAVG_FILE; do
    if [[ -n ${!v:-} ]]; then
      [[ ${!v} =~ $SAFE ]] || die "$v has unsupported characters" 2
      envs+=("$v=${!v}")
    fi
  done
  local self=$$ args=(--remote)
  ((dry)) && args+=(--dry-run)
  [[ -n $jobs ]] && args+=(--jobs "$jobs")
  args+=("$slug" "$ref")
  ((${#pass[@]})) && args+=(-- "${pass[@]}")
  log "connecting to $HOST"
  ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 "$HOST" \
    env ${envs[@]+"${envs[@]}"} bash -s -- "${args[@]}" \
    < <(cat "$0"; while kill -0 "$self" 2>/dev/null; do sleep 2; done)
}

# `main` and `exit` share one line, and this is the last line: the remote side
# reads this script from ssh stdin and its stdin watchdog must find nothing
# left to eat.
slug= ref= bare= wt= watchdog= runpid=
main "$@"; exit $?

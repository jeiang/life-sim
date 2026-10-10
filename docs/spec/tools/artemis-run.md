# `scripts/artemis-run.sh`

Decided in the restructure (decision 12, issue #206). One command for full-pack balance runs on `artemis.jeiang.vpn` (NixOS, 8 cores, 93 GB). Ad hoc heavy runs on artemis are not allowed; use this script. It never overloads the machine.

```
scripts/artemis-run.sh [--dry-run] [--jobs N] <slug> <ref> [-- harness args...]
```

- `slug`: `[a-z0-9][a-z0-9-]*`; names the worktree `~/Projects/life-sim/<slug>` on artemis. One run per slug at a time.
- `ref`: branch, tag or commit of `jeiang/life-sim` (the ref must be pushed).
- After `--`: extra `pnpm harness` arguments (`--profile`, `--seed`, ...). Default is `--lives 10000`. `--jobs` and `--out` are managed by the script and rejected after `--`.
- Progress and the plan go to stderr. The last stdout line is the report path on artemis (`.../reports/<slug>-<sha7>-<utc>/report.md`, next to `report.json`). The exit status is the harness status (1 on engine faults; the path is still printed). Exit 75 means the run was refused (queue deadline passed or slug busy), 2 means a usage error.

## How it runs

The script copies itself to artemis over `ssh -o BatchMode=yes` (stdin, no install needed; the login shell there is fish, so only a `bash -s` is sent) and re-executes in a hidden `--remote` mode. Arguments are restricted to `[A-Za-z0-9._/@+=-]` because they cross a fish command line.

On artemis:

1. Take a per-slug `flock`, then one of N global slot locks (`~/Projects/life-sim/.locks/slot.<i>`). When all are busy, it logs `queued` and retries every 5 s.
2. Queue while the 1-minute load average is above the core count.
3. Update the bare clone `~/Projects/life-sim/.bare` (heads and tags of the public GitHub repo) and resolve `ref` (`origin/<ref>`, then tag, then any commit).
4. `git worktree add --detach ~/Projects/life-sim/<slug> <sha>`.
5. `nix develop -c pnpm install --frozen-lockfile --store-dir ~/Projects/life-sim/.pnpm-store` (store shared by all slugs), then `pnpm harness <args> --jobs J --out <report dir>`.
6. Remove the worktree, also on `INT`, `TERM`, `HUP`, and when the ssh connection drops (the script watches its stdin pipe).

Steps 5 runs as `timeout --kill-after=30 $ARTEMIS_TIMEOUT nice -n 10 ionice -c3 ...`, so install and run share the wall-clock limit and run at idle I/O priority.

## Limits

| Knob | Default | Notes |
|---|---|---|
| `ARTEMIS_SLOTS` | 2 | Concurrent runs across all users of the script. |
| `--jobs` | `min(4, cores-2)` | Capped at `cores-2` (6 on artemis); larger requests are clamped with a log line. |
| `ARTEMIS_TIMEOUT` | 7200 s | Wall clock for install plus run. |
| `ARTEMIS_QUEUE_WAIT` | 900 s | How long to queue for a slot or low load before refusing with status 75. |
| `ARTEMIS_LOADAVG_FILE` | `/proc/loadavg` | Test fixture: point it at a file containing a high load average to exercise the gate. |
| `ARTEMIS_HOST` | `artemis.jeiang.vpn` | |

`--dry-run` prints the plan (cores, current load, paths, limits, commands) and changes nothing on artemis.

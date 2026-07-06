# Background sessions — tests

Reproducible tests for three problems with process/session handling in serverless-style usage.

- Docs: https://www.daytona.io/docs/en/process-code-execution/#session-operations
- Workaround (using `executeCommand`, cgroups and polling): https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-jobs

## Results (last run: 2026-07-06, `@daytonaio/sdk` 0.193.0, live platform)

Each test asserts the **desired** behavior, so it **FAILS while the bug is present** and turns green when Daytona fixes it. The suite exits non-zero today — the failures *are* the demonstrated bugs. `npm test` → **3 failing / 3** (exit 1).

| # | Test | Expected (asserted) | Observed | Status |
|---|------|---------------------|----------|--------|
| 01 | log streaming resume | reconnect fetches only new output | read #1 = 3 lines, read #2 = 6 lines (re-read from byte 0) | ❌ FAIL (bug) |
| 02 | reliable liveness check | a PID / accurate running status | no `pid` field; `exitCode: 0` while daemon grew 1→4 | ❌ FAIL (bug) |
| 03 | `deleteSession` kills all descendants | detached daemon terminated too | daemon `ppid=1` kept running (8→11) after delete | ❌ FAIL (bug) |

Reproduce with `npm install && npm test`.

## Running

```bash
export DAYTONA_API_KEY=...      # required
npm install
npm test                        # runs all tests in one sandbox
# or run a single case (creates its own sandbox):
node 03-deletesession-leaks-daemon.mjs
```

Each test creates a throwaway sandbox and deletes it on exit. Node 18+.

## Test cases

Each test prints its observations and a `PROBLEM SHOWN: true/false` line.

### 01 — `getSessionCommandLogs()` can't resume after a disconnect
An async command emits one line/second. We fetch the logs twice, a few seconds apart.

```
read #1 (t=2.5s): 3 lines
read #2 (t=5.5s): 6 lines
read #2 re-includes read #1 from the start (no offset/cursor): true
```
The method is `getSessionCommandLogs(sessionId, commandId[, onStdout, onStderr])` — there is **no offset/`since` parameter**. Every read returns the log from byte 0. So if the streaming connection drops (common in serverless), you can't resume where you left off; you re-fetch everything.

### 02 — No reliable way to tell if a process is running
Two failures in one test:

- **No PID.** `getSessionCommand` returns only `["id","command","exitCode"]` — no PID is ever exposed, so you can't do a `kill -0`-style liveness check.
- **`exitCode` misreports.** A command that launches a detached daemon and returns reports `exitCode: 0` ("finished") while the daemon keeps running:

```
getSessionCommand fields: ["id","command","exitCode"] -> exposes a PID: false
command reported exitCode: 0        (getSessionCommand says FINISHED)
detached daemon heartbeat: 1 -> 4   (still running: true)
```
`exitCode` tracks the command wrapper, not the real work. The mirror case — a **killed** process whose exit code is never written, so it looks "running" forever — follows from test 03 (a killed/leaked process leaves no exit code and, once the session is deleted, no record at all).

### 03 — `deleteSession` leaks detached processes
An async command runs a foreground loop (`MAIN`) and spawns a detached daemon (`setsid` + double-fork, so it reparents to init). We confirm the daemon's `ppid=1`, then call `deleteSession`.

```
daemon process: pid=208 ppid=1 pgid=208 sid=208 ...   <- reparented to init
BEFORE deleteSession: { main: 5, daemon: 5 }
AFTER  +5s:           { main: 7, daemon: 11 }
foreground command killed: true;  detached daemon still running: true
```
`deleteSession` signals the process group and walks the session shell's child tree, but a process that creates a new session **and** reparents to init escapes both — so it keeps running. This is the common case: dev servers, databases, `pm2`, and headless browsers all detach this way. A cgroup-based kill (membership is inherited at fork, unaffected by `setsid`/reparenting) would catch it; this doesn't.

## Summary

| Test | Problem | Result |
|------|---------|--------|
| 01 | log streaming has no resume/offset | every read restarts from byte 0 |
| 02 | can't tell if a process is running | no PID; `exitCode` says done while work runs |
| 03 | `deleteSession` leaks detached processes | daemon (`ppid=1`) survives session deletion |

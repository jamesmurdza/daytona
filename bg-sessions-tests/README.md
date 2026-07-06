# Background sessions — tests

Reproducible tests for three problems with process/session handling in serverless-style usage.

- Docs: https://www.daytona.io/docs/en/process-code-execution/#session-operations
- Workaround (using `executeCommand`, cgroups and polling): https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-jobs

## Results (last run: 2026-07-06, `@daytonaio/sdk` 0.193.0, live platform)

Each test asserts the **desired** behavior, so it **FAILS while the bug is present** and turns green when Daytona fixes it. The suite exits non-zero today — the failures *are* the demonstrated bugs. `npm test` → **3 failing / 3** (exit 1).

| # | Test | Result | Status |
|---|------|--------|--------|
| 01 | Can you resume a log stream after a disconnect, or does every read restart from the beginning? | Second read re-returns the whole log from the start | ❌ FAIL (bug) |
| 02 | Can you reliably tell if a process is running (a PID, or accurate status)? | No PID; reports finished while the process still runs | ❌ FAIL (bug) |
| 03 | Does `deleteSession` kill all descendants, including a detached daemon? | The detached daemon keeps running after delete | ❌ FAIL (bug) |

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

### 01 — `getSessionCommandLogs()` can't resume after a disconnect
```js
// async command emits one line/second
const a = await sandbox.process.getSessionCommandLogs(sid, cmdId)  // read at t=2.5s
await sleep(3000)
const b = await sandbox.process.getSessionCommandLogs(sid, cmdId)  // read at t=5.5s
pass = !b.stdout.startsWith(a.stdout)   // want only-new output; actually b re-includes a from byte 0
```
The method has no offset/`since` parameter, so every read returns the log from the beginning. In serverless, where the streaming connection drops and resumes on a new invocation, that means re-downloading the entire log each time instead of picking up where you left off.

### 02 — No reliable way to tell if a process is running
```js
// launch a detached daemon, then let the command return
const { cmdId } = await sandbox.process.executeSessionCommand(sid, { command: detachDaemon, runAsync: true })
const cmd = await sandbox.process.getSessionCommand(sid, cmdId)
pass = 'pid' in cmd && cmd.exitCode == null   // want a PID and status that tracks the real process
// actually: no pid field, and exitCode is 0 ("finished") while the daemon keeps running
```
`getSessionCommand` only ever returns `id` / `command` / `exitCode`, so status can only be inferred from whether an exit code has appeared. But that code is written by the command wrapper on normal exit, so it says nothing about a detached child — or about a process that was killed before it could record one.

### 03 — `deleteSession` leaks detached processes
```js
// command spawns a detached daemon (setsid + double-fork -> reparents to init)
await sandbox.process.deleteSession(sid)
await sleep(5000)
pass = (await daemonHeartbeatStopped())   // want the daemon dead; actually it keeps running
```
`deleteSession` signals the process group and walks the session shell's child tree, but a daemon that starts a new session **and** reparents to init escapes both and survives. This is the common case — dev servers, databases, `pm2`, and headless browsers all detach this way — so cleanup silently leaves processes running that hold ports and memory.

# Background sessions — scenarios

Common background-process use cases for the SDK in serverless-style usage, and
where they fall short today.

## Scenarios (2026-07-06, `@daytonaio/sdk` 0.193.0)

Each scenario asserts the **desired** behavior, so its check FAILS while the bug
exists and goes green once it's fixed. `npm test` → 3 failing / 3 (exit 1).

| # | Scenario | Result | Status |
|---|----------|--------|--------|
| 01 | Following a long job's logs from a serverless fn that reconnects | Every read restarts from the beginning — no resume | ❌ FAIL |
| 02 | Checking whether a background job is still running | No PID; reports "finished" while it's still running | ❌ FAIL |
| 03 | Cleaning up a session that launched a dev server / DB / browser | The detached process keeps running after delete | ❌ FAIL |

- Docs: https://www.daytona.io/docs/en/process-code-execution/#session-operations
- Workaround (executeCommand + cgroups + polling): https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-jobs

## Running

```bash
export DAYTONA_API_KEY=...
npm install && npm test          # or: node 03-deletesession-leaks-daemon.mjs
```

Each scenario runs in a throwaway sandbox that's deleted on exit. Node 18+.

## How each scenario is exercised

```js
// 01 resume logs — read the same command's logs twice, a few seconds apart
const a = await sandbox.process.getSessionCommandLogs(sid, cmdId)
const b = await sandbox.process.getSessionCommandLogs(sid, cmdId)   // want: only new output; gets: whole log again

// 02 is it running — launch a detached daemon, then inspect the command
const cmd = await sandbox.process.getSessionCommand(sid, cmdId)     // want: a PID / accurate status
// gets: no pid field, exitCode 0 while the daemon keeps running

// 03 cleanup — the command spawned a detached daemon (setsid + double-fork)
await sandbox.process.deleteSession(sid)                            // want: daemon killed; gets: still running
```

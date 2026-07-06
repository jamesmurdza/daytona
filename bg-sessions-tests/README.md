# Background sessions — scenarios

Common background-process use cases for the SDK in serverless-style usage, and
where they fall short today.

## Scenarios

Each scenario asserts the **desired** behavior, so its check FAILS while the bug
exists and goes green once it's fixed. `npm test` → 3 failing / 3 (exit 1).

| # | Desired behavior | Actual behavior |
|---|------------------|-----------------|
| 01 | Following a job's logs resumes after a disconnect (fetch only new output) | Every read restarts from the beginning |
| 02 | A running background job exposes a PID / accurate status | No PID; reports "finished" while still running |
| 03 | deleteSession kills all descendants, including detached processes | Detached dev-server/DB/browser keeps running |

_Last run: 2026-07-06 · `@daytonaio/sdk` 0.193.0._

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

## References

- Docs: https://www.daytona.io/docs/en/process-code-execution/#session-operations
- Workaround (executeCommand + cgroups + polling): https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-jobs

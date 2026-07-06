# Background sessions — scenarios

Common background-process use cases for the SDK in serverless-style usage, and
where they fall short today.

## Scenarios

Each scenario asserts the **desired** behavior:

| # | Desired behavior | Actual behavior |
|---|------------------|-----------------|
| 01 | Following a job's logs resumes after a disconnect (fetch only new output) | ❌ Returns the whole log from the beginning every time |
| 02 | A running background job exposes a PID / accurate status | ❌ Exposes no PID and reports "finished" while still running |
| 03 | deleteSession kills all descendants, including detached processes | ❌ Leaves the detached dev-server/DB/browser running |

_Last run: 2026-07-06 · `@daytonaio/sdk` 0.193.0._

## Running

```bash
export DAYTONA_API_KEY=...
npm install && npm test          # or: node 03-deletesession-leaks-daemon.mjs
```

Each scenario runs in a throwaway sandbox that's deleted on exit. Node 18+.

## How each scenario is exercised

### 01 — Resume logs
Read the same command's logs twice, a few seconds apart.
```js
const a = await sandbox.process.getSessionCommandLogs(sid, cmdId)
const b = await sandbox.process.getSessionCommandLogs(sid, cmdId)   // want: only new output; gets: whole log again
```

### 02 — Is it running?
Launch a detached daemon, then inspect the command.
```js
const cmd = await sandbox.process.getSessionCommand(sid, cmdId)     // want: a PID / accurate status
// gets: no pid field, exitCode 0 while the daemon keeps running
```

### 03 — Cleanup
Delete a session whose command spawned a detached daemon (setsid + double-fork).
```js
await sandbox.process.deleteSession(sid)                            // want: daemon killed; gets: still running
```

## References

- [Daytona process & session operations docs](https://www.daytona.io/docs/en/process-code-execution/#session-operations)
- [`sandbox-jobs` — executeCommand + cgroups + polling workaround](https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-jobs)

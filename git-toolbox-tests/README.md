# Git Toolbox — error handling scenarios

Common git use cases and how the SDK surfaces their failures. Most come back as
the same generic `500 DaytonaError`, so you can't tell them apart except by
parsing go-git's message string.

## Scenarios

Each scenario asserts the **desired** behavior, so its check FAILS while the bug
exists and goes green once it's fixed. `npm test` → 3 failing / 4 (exit 1).

| Behavior | Test |
|----------|------|
| 01 — Pushing/cloning to an unreachable host (DNS/TLS/network) fails with a generic 500, not a typed network error | ❌ FAIL |
| 02 — Pushing a branch that's behind the remote fails with a generic 500, not `409` Conflict | ❌ FAIL |
| 03 — A push blocked by branch protection or a server-side hook fails with a generic 500, not a classified rejection | ❌ FAIL |
| 04 — Cloning a missing/private repo returns a typed `401` auth error (control — already fixed) | ✅ PASS |

_Last run: 2026-07-06 · `@daytonaio/sdk` 0.193.0._

Auth/missing-repo were classified into 401/404 in May 2026 (daemon PR #4592);
nothing else was, including non-fast-forward (which looks like a plain bug).

## Running

```bash
export DAYTONA_API_KEY=...
npm install && npm test          # or: node 02-non-fast-forward.mjs
```

Each scenario runs in a throwaway sandbox that's deleted on exit. Node 18+.

## How each scenario is exercised

```js
// 01 unreachable host — clone a host that doesn't resolve
await sandbox.git.clone('https://nonexistent.invalid/x.git', dir)   // want: typed error, not 500

// 02 behind the remote — push a stale branch to a diverged remote
await sandbox.git.push(`${root}/cloneB`)                            // want: 409 Conflict

// 03 blocked push — push to a repo whose pre-receive hook rejects
await sandbox.git.push(`${root}/hookclone`)                         // want: classified, not 500

// 04 control — clone a repo that doesn't exist
await sandbox.git.clone('.../does-not-exist.git', dir)             // gets: typed 401 ✓
```

## References

- Docs: https://www.daytona.io/docs/en/git-operations/
- Workaround: https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-git

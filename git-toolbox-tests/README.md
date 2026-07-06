# Git Toolbox — error handling scenarios

Common git use cases and how the SDK surfaces their failures. Most come back as
the same generic `500 DaytonaError`, so you can't tell them apart except by
parsing go-git's message string.

## Scenarios

Each scenario asserts the **desired** behavior, so its check FAILS while the bug
exists and goes green once it's fixed. `npm test` → 3 failing / 4 (exit 1).

| # | Desired behavior | Actual behavior |
|---|------------------|-----------------|
| 01 | An unreachable host (DNS/TLS/network) surfaces as a typed network error | ❌ Surfaces as a generic 500 `DaytonaError`, same as any other error |
| 02 | Pushing a branch that's behind the remote returns `409` Conflict | ❌ Falls through to a generic 500 instead of 409 |
| 03 | A push blocked by branch protection or a server-side hook is a classified rejection | ❌ Comes back as a generic 500 |
| 04 | Cloning a missing/private repo returns a typed `401` auth error | ✅ Returns a typed `401` auth error (already fixed) |

_Last run: 2026-07-06 · `@daytonaio/sdk` 0.193.0._

Auth/missing-repo were classified into 401/404 in May 2026 ([daemon PR #4592](https://github.com/daytonaio/daytona/pull/4592));
nothing else was, including non-fast-forward (which looks like a plain bug).

## Running

```bash
export DAYTONA_API_KEY=...
npm install && npm test          # or: node 02-non-fast-forward.mjs
```

Each scenario runs in a throwaway sandbox that's deleted on exit. Node 18+.

## How each scenario is exercised

### 01 — Unreachable host
Clone a host that doesn't resolve.
```js
await sandbox.git.clone('https://nonexistent.invalid/x.git', dir)   // want: typed error, not 500
```

### 02 — Behind the remote
Push a stale branch to a remote that has moved ahead.
```js
await sandbox.git.push(`${root}/cloneB`)                            // want: 409 Conflict
```

### 03 — Blocked push
Push to a repo whose pre-receive hook rejects it.
```js
await sandbox.git.push(`${root}/hookclone`)                         // want: classified, not 500
```

### 04 — Control (missing repo)
Clone a repo that doesn't exist.
```js
await sandbox.git.clone('.../does-not-exist.git', dir)             // gets: typed 401 ✓
```

## References

- Docs: https://www.daytona.io/docs/en/git-operations/
- Workaround: https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-git

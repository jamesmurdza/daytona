# Git Toolbox — error classification tests

Reproducible tests showing that **most `git` failures come back as the same generic `500 DaytonaError`**, so they can't be told apart programmatically — only by parsing go-git's message string.

## Results (last run: 2026-07-06, `@daytonaio/sdk` 0.193.0, live platform)

Each test asserts the **desired** behavior, so it **FAILS while the bug is present** and turns green when Daytona fixes it. The suite exits non-zero today — the failures *are* the demonstrated bugs. `npm test` → **3 failing / 4** (exit 1).

| # | Test | Observed | Status |
|---|------|----------|--------|
| 01 | Is a network / DNS / TLS failure a typed error, not a generic 500? | `DaytonaError` · 500 · `dial tcp: ... no such host` | ❌ FAIL (bug) |
| 02 | Is a non-fast-forward (diverged) push reported as `409` Conflict? | `DaytonaError` · 500 · `non-fast-forward update: refs/heads/main` | ❌ FAIL (bug) |
| 03 | Is a server-side push rejection (pre-receive hook) a classified error? | `DaytonaError` · 500 · `pre-receive hook declined` | ❌ FAIL (bug) |
| 04 | Control: are auth / missing-repo failures classified (already fixed)? | `DaytonaAuthenticationError` · 401 | ✅ PASS |

Reproduce with `npm install && npm test`.

Context: auth and missing-repo errors *were* classified into `401`/`404` in a change from **May 2026** (daemon PR #4592). Nothing else was — including a non-fast-forward push, which looks like an outright bug (the code tries to map it to `409` but falls through to `500`).

**Suggestion:** a dedicated `DaytonaGitError` type with structured fields (the operation, a stable `reason` enum, and the raw git output) would solve this more cleanly than trying to map every failure onto an HTTP status.

- Docs: https://www.daytona.io/docs/en/git-operations/
- Basic workaround (using `executeCommand`): https://github.com/jamesmurdza/background-agents/tree/main/packages/sandbox-git

## Running

```bash
export DAYTONA_API_KEY=...      # required
npm install
npm test                        # runs all tests in one sandbox
# or run a single case (creates its own sandbox):
node 02-non-fast-forward.mjs
```

Each test creates a throwaway sandbox and deletes it on exit. Node 18+.

## Test cases

Each test triggers a failure and asserts the desired classification.

### 01 — Network / DNS / TLS failure
```js
// clone from a host that does not resolve
try { await sandbox.git.clone('https://nonexistent.invalid/x.git', dir) }
catch (e) { pass = e.statusCode !== 500 }   // want a typed error, not a generic 500
```

### 02 — Non-fast-forward push (should be 409) — **bug**
```js
// origin has advanced; cloneB is on a stale base, so this push is non-fast-forward
try { await sandbox.git.push(`${root}/cloneB`) }
catch (e) { pass = e.statusCode === 409 }   // want 409 Conflict; actually 500
```

### 03 — Server-side rejection (pre-receive hook)
```js
// the bare repo's pre-receive hook rejects every push
try { await sandbox.git.push(`${root}/hookclone`) }
catch (e) { pass = e.statusCode !== 500 }   // want a classified rejection, not a generic 500
```
Stands in for the whole rejection family (branch protection, hooks, size/quota limits).

### 04 — CONTROL: auth / missing-repo (what *is* classified)
```js
// clone a repo that does not exist
try { await sandbox.git.clone('https://github.com/daytonaio/does-not-exist.git', dir) }
catch (e) { pass = e instanceof DaytonaAuthenticationError }   // classified 401 ✓
```
Not a bug — included for contrast. This is the "reaching the repo" case the May 2026 change fixed.

# Git Toolbox — error classification tests

Reproducible tests showing that **most `git` failures come back as the same generic `500 DaytonaError`**, so they can't be told apart programmatically — only by parsing go-git's message string.

## Results (last run: 2026-07-06, `@daytonaio/sdk` 0.193.0, live platform)

Each test asserts the **desired** behavior, so it **FAILS while the bug is present** and turns green when Daytona fixes it. The suite exits non-zero today — the failures *are* the demonstrated bugs. `npm test` → **3 failing / 4** (exit 1).

| # | Test | Result | Status |
|---|------|--------|--------|
| 01 | Is a network / DNS / TLS failure a typed error, not a generic 500? | Generic 500 — network failure not classified | ❌ FAIL (bug) |
| 02 | Is a non-fast-forward (diverged) push reported as `409` Conflict? | Generic 500 instead of 409 Conflict | ❌ FAIL (bug) |
| 03 | Is a server-side push rejection (pre-receive hook) a classified error? | Generic 500 — rejection not classified | ❌ FAIL (bug) |
| 04 | Control: are auth / missing-repo failures classified (already fixed)? | Classified as a typed 401 auth error | ✅ PASS |

Context: auth and missing-repo errors *were* classified into `401`/`404` in a change from **May 2026** (daemon PR #4592). Nothing else was — including a non-fast-forward push, which looks like an outright bug (the code tries to map it to `409` but falls through to `500`).

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
The clone fails at the transport layer and go-git's message (`no such host`) is included, but the error is the base `DaytonaError` with status 500 — identical to every other unclassified failure. TLS and certificate errors behave the same way.

### 02 — Non-fast-forward push (should be 409) — **bug**
```js
// origin has advanced; cloneB is on a stale base, so this push is non-fast-forward
try { await sandbox.git.push(`${root}/cloneB`) }
catch (e) { pass = e.statusCode === 409 }   // want 409 Conflict; actually 500
```
`classifyGitError` maps go-git's `ErrNonFastForwardUpdate` to 409, but on push go-git returns a plain formatted error that the check never matches, so it falls through to 500. A rejected push is the failure an agent pushing code hits most often, and it's indistinguishable from an internal error.

### 03 — Server-side rejection (pre-receive hook)
```js
// the bare repo's pre-receive hook rejects every push
try { await sandbox.git.push(`${root}/hookclone`) }
catch (e) { pass = e.statusCode !== 500 }   // want a classified rejection, not a generic 500
```
The server accepts the connection and then rejects the push, which go-git surfaces as an unclassified error. This stands in for the whole rejection family — branch protection, hooks, and size/quota limits all land in the same generic 500.

### 04 — CONTROL: auth / missing-repo (what *is* classified)
```js
// clone a repo that does not exist
try { await sandbox.git.clone('https://github.com/daytonaio/does-not-exist.git', dir) }
catch (e) { pass = e instanceof DaytonaAuthenticationError }   // classified 401 ✓
```
GitHub returns "authentication required" for a nonexistent repo, which go-git maps to a typed 401 — so this case already behaves correctly. It's included as the contrast to tests 01–03: "reaching the repo" is classified, everything after it is not.

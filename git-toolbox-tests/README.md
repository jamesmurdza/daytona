# Git Toolbox — error classification tests

Reproducible tests showing that **most `git` failures come back as the same generic `500 DaytonaError`**, so they can't be told apart programmatically — only by parsing go-git's message string.

## Results (last run: 2026-07-06, `@daytonaio/sdk` 0.193.0, live platform)

Each test asserts the **desired** behavior, so it **FAILS while the bug is present** and turns green when Daytona fixes it. The suite exits non-zero today — the failures *are* the demonstrated bugs. `npm test` → **3 failing / 4** (exit 1).

| # | Test | Expected (asserted) | Observed | Status |
|---|------|---------------------|----------|--------|
| 01 | network / DNS / TLS failure | a typed/classified error | `DaytonaError` · 500 · `dial tcp: ... no such host` | ❌ FAIL (bug) |
| 02 | non-fast-forward push | `409` Conflict | `DaytonaError` · 500 · `non-fast-forward update: refs/heads/main` | ❌ FAIL (bug) |
| 03 | server-side rejection (pre-receive hook) | a classified rejection error | `DaytonaError` · 500 · `pre-receive hook declined` | ❌ FAIL (bug) |
| 04 | auth / missing repo (control) | typed `401`/`404` | `DaytonaAuthenticationError` · 401 | ✅ PASS (already fixed) |

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

Each test prints the error's `class` / `statusCode` / `errorCode` / `message` and a `PROBLEM SHOWN: true/false` line.

### 01 — Network / DNS / TLS failure → generic 500
`git.clone` against an unresolvable host. The failure is real but unclassified.

```
class: DaytonaError   statusCode: 500   errorCode: INTERNAL_SERVER_ERROR
message: Get "https://nonexistent.invalid/...": dial tcp: lookup nonexistent.invalid ... no such host
```
The message tells you it's a network error; the type/status do not. TLS/cert failures behave identically.

### 02 — Non-fast-forward push → generic 500 (should be 409) — **bug**
Builds a diverged history locally (one bare repo, two clones, divergent commits) and pushes the stale clone.

```
class: DaytonaError   statusCode: 500   errorCode: INTERNAL_SERVER_ERROR
message: non-fast-forward update: refs/heads/main
```
`classifyGitError` checks `errors.Is(err, go_git.ErrNonFastForwardUpdate)` → `409`, but go-git returns a plain `fmt.Errorf("non-fast-forward update: %s")` on push that doesn't wrap the sentinel, so the check never matches and it falls through to `500`.

### 03 — Server-side rejection (pre-receive hook) → generic 500
Pushes to a bare repo whose `pre-receive` hook rejects every push. Stands in for the whole rejection family (branch protection, hooks, size/quota limits) — the server rejects after the connection succeeds, and go-git surfaces it unclassified.

```
class: DaytonaError   statusCode: 500   errorCode: INTERNAL_SERVER_ERROR
message: command error on refs/heads/main: pre-receive hook declined
```

### 04 — CONTROL: auth / missing-repo → 401/404 (what *is* classified)
Not a bug — included for contrast. Cloning a nonexistent GitHub repo is classified into a typed error:

```
class: DaytonaAuthenticationError   statusCode: 401   errorCode: UNAUTHORIZED
message: unauthorized: authentication required: Repository not found.
```
(GitHub reports missing repos as "authentication required", so it lands in 401.) This is the "reaching the repo" case that the May 2026 change fixed — contrast with the generic 500s above.

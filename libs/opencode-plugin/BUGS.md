# OpenCode + Daytona Plugin Bug Report

This document summarizes all known bugs affecting the Daytona OpenCode plugin and related OpenCode issues.

---

## Summary Table

| Bug | Severity | Effort | Location | GitHub Issue |
|-----|----------|--------|----------|--------------|
| [TUI freezes on session resume](#1-tui-freezes-on-session-resume) | High | Easy (~10 lines) | OpenCode | None found |
| [Sessions filtered per workspace](#2-sessions-filtered-per-workspace) | Low | Easy (~5 lines) | OpenCode | None found |
| [Uncommitted files not synced](#3-uncommitted-files-not-synced-to-new-workspaces) | Medium | Medium (~30 lines) | Plugin | None found |
| [Workspace creation errors swallowed](#4-workspace-creation-errors-swallowed) | High | Easy (~10 lines) | OpenCode | Related: [#21638](https://github.com/sst/opencode/issues/21638), [#24847](https://github.com/sst/opencode/issues/24847) |
| [Warp session errors swallowed](#5-warp-session-errors-swallowed) | Medium | Easy (~10 lines) | OpenCode | None found |
| [Adapter loading errors swallowed](#6-adapter-loading-errors-swallowed) | Low | Easy (~10 lines) | OpenCode | Related: [#21638](https://github.com/sst/opencode/issues/21638) |
| [No plugin logging API](#7-no-plugin-logging-api) | Medium | Medium (~50 lines) | OpenCode | Related: [#20196](https://github.com/sst/opencode/issues/20196) (closed) |
| [Can't delete empty workspaces](#8-cant-delete-empty-workspaces) | Medium | Medium (~50-100 lines) | OpenCode | None found |

---

## 1. TUI Freezes on Session Resume

**Severity:** High
**Location:** OpenCode (`packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts`)
**GitHub Issue:** None found

### Description

When resuming an existing session that belongs to a remote workspace (e.g., Daytona sandbox), the TUI freezes with a blank screen. The user can only exit with Ctrl+C.

### Steps to Reproduce

1. Start OpenCode with `OPENCODE_EXPERIMENTAL_WORKSPACES=true`
2. Create a Daytona workspace via `/warp`
3. Create a session and send a message
4. Exit OpenCode
5. Restart OpenCode and resume the session
6. **Result:** Screen goes blank, TUI hangs

### Root Cause

Race condition in workspace routing middleware:

```typescript
// workspace-routing.ts
function proxyRemote(...) {
  return Effect.gen(function* () {
    const syncing = yield* Workspace.Service.use((svc) => svc.isSyncing(workspace.id))
    if (!syncing) {
      return HttpServerResponse.text(`broken sync connection for workspace: ${workspace.id}`, {
        status: 503,  // Returns 503 if sync not established
      })
    }
    // ...
  })
}
```

**Timeline:**
1. OpenCode starts → TUI loads
2. TUI sees session belongs to workspace X → starts connecting (async)
3. TUI loads session data → requests routed to workspace X
4. Middleware checks `isSyncing()` → **false** (not connected yet) → returns 503
5. TUI doesn't handle 503 → blank screen

### Suggested Fix

**Simple fix (~10 lines):** Add a retry/wait before returning 503:

```typescript
// workspace-routing.ts
const syncing = yield* Workspace.Service.use((svc) => svc.isSyncing(workspace.id))
if (!syncing) {
  // Wait up to 5 seconds for sync to establish
  yield* Effect.sleep("5 seconds")
  const syncingRetry = yield* Workspace.Service.use((svc) => svc.isSyncing(workspace.id))
  if (!syncingRetry) {
    return HttpServerResponse.text(`broken sync connection for workspace: ${workspace.id}`, {
      status: 503,
    })
  }
}
```

### Workaround

Wait a few seconds after opening OpenCode before resuming a remote session.

---

## 2. Sessions Filtered Per Workspace

**Severity:** Low
**Location:** OpenCode (`packages/opencode/src/cli/cmd/tui/context/sync.tsx`)
**GitHub Issue:** None found

### Description

When inside a workspace, the `/sessions` list only shows sessions belonging to that workspace. From local context (no workspace), all sessions are visible.

### Expected vs Actual

| Context | Sessions Shown |
|---------|----------------|
| Local (no workspace) | All sessions |
| Inside Workspace A | Only Workspace A sessions |

### Root Cause

Intentional filtering in `sessionListQuery()`:

```typescript
// sync.tsx
function sessionListQuery(): { scope?: "project"; path?: string } {
  if (!kv.get("session_directory_filter_enabled", true)) return { scope: "project" }
  // Returns workspace-scoped query when inside a workspace
}
```

### Suggested Fix

- Always show all sessions regardless of context
- Or add UI indicator when filtering is active
- Or add toggle to disable filtering

### Workaround

Exit the workspace (use `/warp` → "None") to see all sessions.

---

## 3. Uncommitted Files Not Synced to New Workspaces

**Severity:** Medium
**Location:** Plugin (`libs/opencode-plugin/.opencode/plugin/daytona/index.ts`)
**GitHub Issue:** None found

### Description

When creating a new Daytona workspace via `/warp`, uncommitted and untracked files are not copied to the remote workspace.

### Steps to Reproduce

1. Create a new file locally: `echo "test" > newfile.txt`
2. Use `/warp` to create a new Daytona workspace
3. **Result:** `newfile.txt` is not present in the workspace

### Root Cause

The plugin uses `git clone` to transfer files:

```typescript
// daytona/index.ts
const cloneArgs = ['git', 'clone', '--depth', '1', '--no-local']
await spawnAsync(cloneArgs, { cwd: tmpdir() })
```

`git clone` only copies committed files. Untracked/uncommitted files are excluded.

### Note

OpenCode has a `copyChanges` mechanism for session warp, but it's not used for workspace creation.

### Suggested Fix

**Plugin-side fix (~20 lines):** Apply `git diff HEAD` after clone to sync tracked file changes:

```typescript
// After git clone (line 146), before tar (line 151):

// Capture uncommitted changes (staged + unstaged) from worktree
const diffProc = nodeSpawn('git', ['diff', 'HEAD'], { cwd: worktree, stdio: ['ignore', 'pipe', 'pipe'] })
let diffOutput = ''
diffProc.stdout?.on('data', (data: Buffer) => { diffOutput += data.toString() })
await new Promise((resolve) => diffProc.on('close', resolve))

if (diffOutput.trim()) {
  const patchFile = join(temp, 'changes.patch')
  await writeFile(patchFile, diffOutput)
  await spawnAsync(['git', 'apply', '--allow-empty', patchFile], { cwd: dir })
}
```

**Limitations:**
- Only syncs changes to **tracked** files (files already in git)
- Untracked files (new files not yet `git add`ed) are NOT included
- Binary file diffs may cause issues

**To also sync untracked files (~10 more lines):**

```typescript
// Copy untracked files (excluding gitignored)
const untrackedProc = nodeSpawn('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktree })
let untracked = ''
untrackedProc.stdout?.on('data', (data: Buffer) => { untracked += data.toString() })
await new Promise((resolve) => untrackedProc.on('close', resolve))

for (const file of untracked.trim().split('\n').filter(Boolean)) {
  const src = join(worktree, file)
  const dest = join(dir, file)
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(src, dest)
}
```

### Workaround

Commit (or stash) changes before creating a new workspace.

---

## 4. Workspace Creation Errors Swallowed

**Severity:** High
**Location:** OpenCode (`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`)
**GitHub Issue:** Related: [#21638](https://github.com/sst/opencode/issues/21638), [#24847](https://github.com/sst/opencode/issues/24847)

### Description

When workspace creation fails, the actual error message is discarded. Users see a generic toast but don't know why it failed.

### Root Cause

```typescript
// prompt/index.tsx
const result = await sdk.client.experimental.workspace
  .create({ type: selection.workspaceType, branch: null })
  .catch(() => undefined)  // Error discarded!

if (!result?.data) {
  toast.show({
    message: `Failed to create workspace: ${errorMessage(result?.error ?? "no response")}`,
    // But result is undefined, so error details are lost
  })
}
```

### Impact

- Users can't diagnose failures (missing API key, network issues, etc.)
- Plugin errors (e.g., "DAYTONA_API_KEY not set") never reach the user
- Contributes to orphaned workspaces (see Bug #8)

### All Instances of `.catch(() => undefined)`

Found 17 instances in TUI code. **4 are problematic** (hide real errors):

| File | Line | Issue |
|------|------|-------|
| `prompt/index.tsx` | 225 | Workspace create - hides plugin errors |
| `dialog-session-list.tsx` | 56 | Workspace create - hides plugin errors |
| `dialog-workspace-create.tsx` | 67 | Adapter loading - hides why adapters fail |
| `dialog-workspace-create.tsx` | 109 | Warp - hides why warp fails |

The other 13 are acceptable (cleanup operations, optional data fetching, or have `fatal: false`).

### Suggested Fix

**Simple fix:** Capture error before discarding, show in toast:

```typescript
// Instead of:
const result = await sdk.client.experimental.workspace
  .create({ type: selection.workspaceType, branch: null })
  .catch(() => undefined)

// Do:
const result = await sdk.client.experimental.workspace
  .create({ type: selection.workspaceType, branch: null })
  .catch((err) => {
    toast.show({ variant: "error", message: `Workspace creation failed: ${err.message}` })
    return undefined
  })
```

This is ~5 lines per location, so ~20 lines total for all 4 instances.

---

## 5. Warp Session Errors Swallowed

**Severity:** Medium
**Location:** OpenCode (`packages/opencode/src/cli/cmd/tui/component/dialog-workspace-create.tsx`)
**GitHub Issue:** None found

### Description

When warping a session to a workspace fails, the error is discarded.

### Root Cause

Same `.catch(() => undefined)` pattern:

```typescript
// dialog-workspace-create.tsx
const result = await sdk.client.experimental.workspace
  .warp({ id: input.workspaceID, sessionID: input.sessionID, copyChanges: input.copyChanges })
  .catch(() => undefined)
```

### Impact

Users don't know why warp failed - could be network, could be conflict, could be missing workspace.

---

## 6. Adapter Loading Errors Swallowed

**Severity:** Low
**Location:** OpenCode (adapter loading code)
**GitHub Issue:** Related: [#21638](https://github.com/sst/opencode/issues/21638)

### Description

When loading workspace adapters fails, a generic toast appears but the specific error is hidden.

### Root Cause

```typescript
// dialog-workspace-create.tsx
async function loadWorkspaceAdapters(input) {
  const res = await input.sdk
    .fetch(url)
    .then((x) => x.json())
    .catch(() => undefined)  // Error discarded
  if (res) return res
  input.toast.show({
    message: "Failed to load workspace adapters",  // Generic message
    variant: "error",
  })
}
```

---

## 7. No Plugin Logging API

**Severity:** Medium
**Location:** OpenCode (plugin system)
**GitHub Issue:** Related: [#20196](https://github.com/sst/opencode/issues/20196) (closed)

### Description

Plugins cannot write to OpenCode's log files. `console.warn()` appears briefly in terminal before TUI takes over but is not captured in logs.

### Impact

- Debugging plugin issues is difficult
- Users who don't run OpenCode from terminal never see warnings
- Plugin authors can't provide diagnostic information

### Note

Issue #20196 was closed as "completed" but plugin logging may still not work. Needs verification.

### Suggested Fix

Provide a logging API for plugins:

```typescript
// Plugin input could include:
interface PluginInput {
  log: {
    info(message: string): void
    warn(message: string): void
    error(message: string): void
  }
}
```

---

## 8. Can't Delete Empty Workspaces

**Severity:** Medium
**Location:** OpenCode (TUI design)
**GitHub Issue:** None found

### Description

There's no UI to delete workspaces that have no sessions. Workspaces can only be deleted when deleting a session that belongs to them.

### How Empty Workspaces Occur

1. User runs `/warp` → selects "Daytona"
2. Workspace creation succeeds (saved to DB, Daytona sandbox created)
3. Session warp/creation fails (error swallowed - see Bug #4)
4. Workspace exists with no session → orphaned

### Root Cause

- No dedicated workspace management UI
- Workspace deletion is tied to session deletion only
- No rollback when session attachment fails after workspace creation
- Error swallowing (Bug #4) hides failures that cause orphans

### Analysis

The building blocks already exist:
- **API:** `sdk.client.experimental.workspace.remove({ id })` works
- **List:** `project.workspace.list()` returns all workspaces
- **Missing:** Just a UI to show workspaces with delete action

### Suggested Fix

**Simpler than expected (~50-100 lines):** Create a `/workspaces` command dialog similar to `/sessions`:

```typescript
// New file: dialog-workspace-list.tsx
export function DialogWorkspaceList() {
  const project = useProject()
  const sdk = useSDK()
  const toast = useToast()

  const options = createMemo(() =>
    project.workspace.list().map((ws) => ({
      title: ws.name,
      description: `${ws.type} - ${project.workspace.status(ws.id)}`,
      value: ws.id,
    }))
  )

  return (
    <DialogSelect
      title="Workspaces"
      options={options()}
      actions={[
        {
          command: "workspace.delete",
          title: "delete",
          onTrigger: async (option) => {
            const result = await sdk.client.experimental.workspace.remove({ id: option.value })
            if (result.error) {
              toast.show({ variant: "error", message: errorMessage(result.error) })
            }
            await project.workspace.sync()
          },
        },
      ]}
    />
  )
}
```

Then register it as a command in the command palette.

### Workaround

Delete orphaned Daytona sandboxes manually via CLI:

```bash
# List sandboxes
daytona sandbox list | grep opencode-

# Delete specific sandbox
daytona sandbox delete opencode-xyz
```

---

## Bug Connections

Several bugs are interconnected:

```
Error Swallowing (Bugs 4, 5, 6)
        ↓
Failures go unnoticed
        ↓
No rollback on partial failures
        ↓
Orphaned workspaces accumulate (Bug 8)
        ↓
No UI to clean up (Bug 8)
```

**Fixing error handling would reduce orphaned workspaces significantly.**

---

## Related GitHub Issues

### Directly Related
- [#21638](https://github.com/sst/opencode/issues/21638) - "Loading local plugin silently fails in case of an error"
- [#24847](https://github.com/sst/opencode/issues/24847) - "OpenCode silently enters a broken UI state when a plugin fails to initialize"
- [#20196](https://github.com/sst/opencode/issues/20196) - "Improve plugin runtime logging for loader and hook observability" (closed)

### Potentially Related (Blank Screen/Freeze)
- [#27082](https://github.com/sst/opencode/issues/27082) - "TUI blank page: FSEventStreamSetExclusionPaths blocks"
- [#27071](https://github.com/sst/opencode/issues/27071) - "TUI shows blank page when ~/Library contains large number of files"
- [#26960](https://github.com/sst/opencode/issues/26960) - "TUI session list empty despite sessions existing in database"
- [#26159](https://github.com/sst/opencode/issues/26159) - "Session permanently unresponsive when message timestamps ahead of wall clock"

### Error Handling Pattern
- [#25344](https://github.com/sst/opencode/issues/25344) - "Auto-title generation silently fails"
- [#17536](https://github.com/sst/opencode/issues/17536) - "SessionPrompt.prompt() error is silently swallowed"

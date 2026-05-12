# OpenCode UX Issue: Sessions Filtered Per-Workspace Context

## Summary

When viewing the `/sessions` list from within an active workspace, only sessions belonging to that specific workspace are shown. When viewing from local context (no workspace), all sessions across all workspaces are visible.

## Behavior

| Context | Sessions Shown |
|---------|----------------|
| Local (no workspace) | All sessions from all workspaces |
| Inside Workspace A | Only sessions with `workspace_id = A` |
| Inside Workspace B | Only sessions with `workspace_id = B` |

## User Expectation vs Reality

**Expected**: Users expect to see all their sessions regardless of which workspace they're currently in, since the `/sessions` dialog is global UI.

**Actual**: Sessions are silently filtered based on workspace context, making it appear that sessions have disappeared.

## Root Cause

This is **intentional filtering**, not a bug. The code explicitly filters sessions by workspace:

### Backend: `packages/opencode/src/session/session.ts`
```typescript
function* listByProject(input: ListInput & { projectID: ProjectID }) {
  const conditions = [eq(SessionTable.project_id, input.projectID)]

  if (input.workspaceID) {
    conditions.push(eq(SessionTable.workspace_id, input.workspaceID))
  }
  // ...
}
```

### Frontend: `packages/opencode/src/cli/cmd/tui/context/sync.tsx`
```typescript
function sessionListQuery(): { scope?: "project"; path?: string } {
  if (!kv.get("session_directory_filter_enabled", true)) return { scope: "project" }
  // ...
}
```

The session list API is called with `workspace` parameter when inside a workspace context, which triggers the filtering.

### Flow:
1. TUI tracks current workspace via `project.workspace.current()`
2. When fetching sessions, `sync.session.query()` provides workspace filter
3. Backend `session.list()` adds `WHERE workspace_id = ?` condition
4. User only sees sessions for current workspace

## Suggested Improvements

### Option 1: Always Show All Sessions (Recommended for MVP)
Remove the workspace filtering from session list, letting users see all sessions regardless of context.

### Option 2: Add UI Indicator
Show a filter chip/badge when sessions are being filtered:
```
Sessions (filtered by: Workspace A) [Show All]
```

### Option 3: Add Toggle in Settings
Add a setting to enable/disable per-workspace session filtering:
```typescript
// Already exists but defaults to true:
kv.get("session_directory_filter_enabled", true)
```
Make this more discoverable or change default to `false`.

### Option 4: Group Sessions by Workspace
Show all sessions but group them:
```
--- Workspace A ---
  Session 1
  Session 2
--- Workspace B ---
  Session 3
--- Local ---
  Session 4
```

## Workaround

Exit the workspace (go back to local/home context) to see all sessions:
1. Press `/warp`
2. Select "None" / exit workspace
3. View `/sessions` - all sessions are now visible

## Related Files

- `packages/opencode/src/session/session.ts` - Session list filtering logic
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx` - TUI sync context with `sessionListQuery()`
- `packages/opencode/src/cli/cmd/tui/component/dialog-session-list.tsx` - Session list dialog UI
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts` - HTTP API handler

## Impact

- **Severity**: Low (UX confusion, not functionality break)
- **Workaround**: Exit workspace to see all sessions
- **User Impact**: Confusion when sessions appear to "disappear" when entering a workspace

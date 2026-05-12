# OpenCode/Daytona Issue: Untracked Files Not Synced to New Workspaces

## Summary

When creating a new Daytona workspace, uncommitted/untracked files from the local project are not copied to the remote workspace. Only committed files from the git repository are transferred.

## Steps to Reproduce

1. Add a new file locally (don't commit it):
   ```bash
   echo "hello world" > newfile.txt
   ```

2. Open OpenCode and use `/warp` to create a new Daytona workspace

3. Check if the file exists in the workspace

4. **Result**: `newfile.txt` is not present in the remote workspace

## Expected Behavior

Uncommitted changes and untracked files should be synced to the new workspace, so the remote environment matches the local state.

## Root Cause

The Daytona plugin uses `git clone` to transfer the repository to the sandbox:

```typescript
// libs/opencode-plugin/.opencode/plugin/daytona/index.ts
const cloneArgs = ['git', 'clone', '--depth', '1', '--no-local']
if (config.branch) {
  cloneArgs.push('--branch', config.branch)
}
cloneArgs.push(source, dir)

await spawnAsync(cloneArgs, { cwd: tmpdir() })
```

**Problem**: `git clone` only copies committed files. Untracked files and uncommitted changes are excluded.

## Related: copyChanges Feature

OpenCode has a `copyChanges` mechanism that syncs uncommitted changes, but it only works for **session warp** (moving an existing session to a different workspace), not for **workspace creation**:

```typescript
// workspace.ts - sessionWarp function
const sourcePatch = input.copyChanges && current?.workspaceID
  ? yield* runInWorkspace({
      workspaceID: current?.workspaceID ?? undefined,
      local: () => vcs.diffRaw(),  // Gets uncommitted changes
      remote: ({ target }) =>
        HttpClientRequest.get(route(target.url, "/vcs/diff/raw"), {
          headers: new Headers(target.headers),
        }),
      fallback: "",
      response: "text",
    })
  : ""
```

When creating a **new workspace** (not warping), the `copyChanges` logic is not invoked.

## Suggested Fixes

### Option 1: Apply local changes after clone (Plugin-side fix)

Modify the Daytona plugin to:
1. Run `git diff` and `git diff --cached` locally
2. Transfer the patch file to the sandbox
3. Apply the patch with `git apply`

```typescript
// After git clone, before tar:
await spawnAsync(['git', 'diff', 'HEAD'], { cwd: dir })
// ... save patch, upload, apply in sandbox
```

### Option 2: Copy working directory instead of git clone

Instead of `git clone`, directly copy the working directory (with `.git`):

```typescript
// Instead of git clone:
await spawnAsync(['rsync', '-a', '--exclude', '.opencode', worktree + '/', dir + '/'])
// or
await spawnAsync(['cp', '-a', worktree, dir])
```

**Pros**: Preserves all files including untracked
**Cons**: May copy large ignored files, requires more careful filtering

### Option 3: Pass changes via workspace creation API (OpenCode-side fix)

Extend the workspace creation API to accept an optional patch:

```typescript
interface CreateInput {
  // ... existing fields
  patch?: string  // Git diff to apply after creation
}
```

The adapter's `create()` would receive this patch and apply it.

### Option 4: Prompt user about uncommitted changes

Before creating a workspace, check for uncommitted changes and warn:

```
You have uncommitted changes that won't be synced to the new workspace:
  - newfile.txt (untracked)
  - src/app.ts (modified)

[Continue anyway] [Commit changes first] [Cancel]
```

## Workaround

Until this is fixed, commit your changes before creating a new workspace:

```bash
git add .
git stash  # or git commit
# Then /warp to create workspace
```

## Impact

- **Severity**: Medium (unexpected behavior, data may appear "lost")
- **User Impact**: Users adding files locally then warping to new workspace don't see their files
- **Workaround**: Commit changes before warping

## Related Files

- `libs/opencode-plugin/.opencode/plugin/daytona/index.ts` - Daytona adapter create() function
- `packages/opencode/src/control-plane/workspace.ts` - Workspace creation and sessionWarp logic

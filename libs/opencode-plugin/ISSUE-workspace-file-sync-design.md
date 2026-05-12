# Design Question: File Sync Behavior When Creating New Workspaces

## Issue Summary

When a user creates a new remote workspace (e.g., Daytona sandbox) via `/warp`, uncommitted and untracked files from their local working directory are not synced to the new workspace. Only committed files are transferred because the Daytona plugin uses `git clone` to copy the repository.

## Current Behavior

```
Local working directory:
├── src/app.ts          (committed)
├── src/newfeature.ts   (uncommitted - modified)
├── test.txt            (untracked)
└── node_modules/       (gitignored)

After /warp → New Daytona workspace:
├── src/app.ts          ✓ (present)
├── src/newfeature.ts   ✗ (reverted to committed state)
├── test.txt            ✗ (missing)
└── node_modules/       ✗ (missing, expected)
```

## User Expectation

Most users likely expect the workspace to mirror their current working state - otherwise they lose context when moving to a remote environment.

However, some users might prefer a "clean slate" from the repo.

## Technical Context

### How Daytona Plugin Currently Works

```typescript
// git clone only copies committed files
const cloneArgs = ['git', 'clone', '--depth', '1', '--no-local']
await spawnAsync(cloneArgs, { cwd: tmpdir() })
```

### Existing copyChanges Mechanism

OpenCode already has a `copyChanges` feature for **session warp** (moving a session between workspaces):

```typescript
// In workspace.ts sessionWarp()
const sourcePatch = input.copyChanges && current?.workspaceID
  ? yield* runInWorkspace({
      local: () => vcs.diffRaw(),  // Gets uncommitted changes as patch
      // ...
    })
  : ""

if (sourcePatch) {
  // Apply patch to destination workspace
  yield* runInWorkspace({
    workspaceID: input.workspaceID,
    local: () => vcs.apply({ patch: sourcePatch }),
    // ...
  })
}
```

This mechanism:
- Uses `git diff` to capture uncommitted changes
- Transfers the patch to the destination
- Applies with `git apply`

**But it's only used for session warp, not workspace creation.**

---

## Questions for OpenCode Team

### 1. What's the intended behavior for workspace creation?

Should a new workspace:
- **A)** Mirror the user's current working directory (including uncommitted changes)?
- **B)** Start from a clean git state (committed files only)?
- **C)** Let the user choose via a prompt or flag?

### 2. Should `copyChanges` apply to workspace creation?

The `copyChanges` mechanism exists for session warp. Should it also be invoked when:
- Creating a new workspace from local context?
- Creating a new workspace from an existing workspace?

### 3. How should untracked files be handled?

`git diff` only captures changes to tracked files. For untracked files:
- Should they be synced at all?
- If yes, how? (tar the working dir, rsync, etc.)
- Should gitignored files be excluded?

### 4. Where should this logic live?

- **In each adapter**: Each workspace adapter (Daytona, Codespaces, etc.) handles file sync
- **In OpenCode core**: OpenCode captures local state and passes it to adapters
- **Hybrid**: OpenCode provides the patch/files, adapter decides how to apply

### 5. What about branch divergence?

If the user is on a different branch locally than what the workspace clones:
- Should we detect this and warn?
- Should we clone the same branch?
- What if the patch doesn't apply cleanly?

### 6. Performance considerations?

For large working directories:
- Is there a size limit for synced changes?
- Should we stream or chunk large transfers?
- How do we handle binary files in the diff?

---

## Proposed Solutions

### Option A: Adapter-side fix (Daytona plugin)

Modify the Daytona plugin to sync local changes after `git clone`:

```typescript
// After clone, capture and apply local changes
const patch = await captureLocalChanges(worktree)
if (patch) {
  await sandbox.fs.uploadFile(Buffer.from(patch), 'changes.patch')
  await run('git apply ~/changes.patch && rm ~/changes.patch')
}
```

**Pros**: Quick fix, no upstream changes needed
**Cons**: Each adapter reimplements this; doesn't handle untracked files well

### Option B: OpenCode-side enhancement

Extend workspace creation to use `copyChanges` mechanism:

```typescript
// In workspace create flow
const patch = yield* vcs.diffRaw()
// Pass to adapter or apply after workspace is ready
```

**Pros**: Consistent behavior across all adapters; reuses existing code
**Cons**: Requires OpenCode changes; needs API extension

### Option C: User choice via UI

Add a checkbox/prompt in `/warp`:

```
Create new Daytona workspace

[ ] Include uncommitted changes
    - src/newfeature.ts (modified)
    - test.txt (untracked)

[Create] [Cancel]
```

**Pros**: Explicit, user controls behavior
**Cons**: Adds friction; more UI complexity

### Option D: Smart defaults with override

- Default: sync uncommitted changes (most common expectation)
- Flag: `--clean` or setting to start from clean state
- Warning if patch can't apply cleanly

---

## Recommendation

Pending input from OpenCode team, a reasonable approach might be:

1. **Short-term (Daytona plugin)**: Apply `git diff HEAD` patch after clone to sync committed-but-modified files
2. **Medium-term (OpenCode)**: Extend workspace creation to optionally pass local changes to adapters
3. **Long-term (OpenCode)**: Unified file sync mechanism that handles untracked files, with user-configurable defaults

---

## Related Files

- `libs/opencode-plugin/.opencode/plugin/daytona/index.ts` - Daytona adapter
- `packages/opencode/src/control-plane/workspace.ts` - Workspace creation & sessionWarp
- `packages/opencode/src/vcs/vcs.ts` - VCS diff/apply operations
- `packages/opencode/src/cli/cmd/tui/component/dialog-workspace-create.tsx` - Warp UI

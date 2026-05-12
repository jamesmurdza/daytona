# OpenCode Issue: TUI Freezes When Resuming Session in Remote Workspace

## Summary

When resuming an existing session that is associated with an active remote workspace (e.g., Daytona sandbox), the OpenCode TUI freezes with a blank screen. New sessions in the same workspace work fine.

## Environment

- OpenCode version: 1.14.48
- Daytona OpenCode Plugin: latest
- Remote workspace: Daytona sandbox (running, healthy)

## Steps to Reproduce

1. Start OpenCode with experimental workspaces enabled:
   ```bash
   DAYTONA_API_KEY=xxx OPENCODE_EXPERIMENTAL_WORKSPACES=true opencode
   ```

2. Use `/warp` to create a Daytona workspace

3. Create a new session and send a message (works fine)

4. Exit OpenCode

5. Restart OpenCode and try to resume the session from step 3

6. **Result**: Screen shows chat briefly, then goes blank and hangs. Only Ctrl+C exits.

## Expected Behavior

Session should resume and display the conversation history, connected to the remote workspace.

## Actual Behavior

- Chat content flashes briefly (session data loads successfully)
- Screen goes blank
- TUI becomes unresponsive
- No errors in logs - requests complete with 200 status
- Only way to exit is Ctrl+C

## Root Cause Analysis

After analyzing the OpenCode source code, the issue is a **race condition** in the workspace routing middleware.

### Code Path

In `packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts`:

```typescript
function proxyRemote(
  client: HttpClient.HttpClient,
  request: HttpServerRequest.HttpServerRequest,
  workspace: Workspace.Info,
  target: RemoteTarget,
  url: URL,
) {
  return Effect.gen(function* () {
    const syncing = yield* Workspace.Service.use((svc) => svc.isSyncing(workspace.id))
    if (!syncing) {
      return HttpServerResponse.text(`broken sync connection for workspace: ${workspace.id}`, {
        status: 503,  // <-- Returns 503 if sync not established
        contentType: "text/plain; charset=utf-8",
      })
    }
    // ... proxy the request
  })
}
```

### The Race Condition

1. **Workspace syncing starts asynchronously** - `startWorkspaceSyncing` is called via `/sync/start` endpoint
2. **TUI loads session data immediately** - requests for `/session/{id}`, `/session/{id}/message`, etc.
3. **Requests are routed through `WorkspaceRoutingMiddleware`** - which checks `isSyncing()`
4. **If sync hasn't connected yet**, middleware returns 503 "broken sync connection"
5. **TUI doesn't handle 503 gracefully** - results in blank screen/hang

### Evidence from Logs

The server logs show all requests completing with 200 status, then nothing:
```
INFO  18:23:23 http.method=GET http.url=/session/ses_xxx http.status=200
INFO  18:23:23 http.method=GET http.url=/session/ses_xxx/message http.status=200
INFO  18:23:24 http.method=GET http.url=/experimental/workspace/status http.status=200
# ... then silence until Ctrl+C
```

The session loads successfully (you see the chat briefly), but subsequent requests to the remote workspace fail with 503 before sync is established.

## Suggested Fixes

### Option 1: Start workspace syncing earlier (Recommended)
Ensure `startWorkspaceSyncing` completes before allowing session load requests to be routed to remote workspaces.

### Option 2: Queue requests while connecting
Instead of returning 503 immediately, queue requests and wait for sync to establish (with timeout).

### Option 3: Retry with backoff in middleware
```typescript
if (!syncing) {
  // Wait for sync to establish instead of failing immediately
  yield* Effect.retry(
    Workspace.Service.use((svc) => svc.isSyncing(workspace.id)),
    { times: 10, delay: "500 millis" }
  )
}
```

### Option 4: Handle 503 gracefully in TUI
Show "Reconnecting to workspace..." message instead of blank screen, and retry the connection.

## Workarounds

Until this is fixed:

1. **Delete workspace before closing** - Use `/warp` to delete the workspace before exiting
2. **Start new sessions** - Don't resume sessions that were created in remote workspaces
3. **Wait for sync** - After starting OpenCode, wait a few seconds before selecting a remote workspace session

## Related Files

- `packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts` - Workspace routing middleware
- `packages/opencode/src/control-plane/workspace.ts` - Workspace sync logic
- `packages/opencode/src/server/routes/instance/httpapi/handlers/sync.ts` - Sync start handler

## Additional Context

- The Daytona plugin is working correctly - sandbox is running, OpenCode server inside is healthy, preview URL is accessible
- The issue is in OpenCode's handling of workspace sync timing, not the plugin
- New sessions work because they don't require loading existing session data from the remote workspace immediately

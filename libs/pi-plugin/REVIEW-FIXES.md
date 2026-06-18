# Review fixes — verification log

How each issue from the review was reproduced and what happened after the fix.
`✅ verified` = I ran it. `⚠️` = not executed (reason noted).

| Issue (exact feedback wording) | Before | After | Commit |
|---|---|---|---|
| Reattach is broken under pi 0.79. | I ran `pi -p "..." --daytona` then `pi --daytona --continue` on 0.79.6 (with an observer logging `getEntries()` at `session_start`). I got the record present and the sandbox reattached — no `already exists` error. | Didn't reproduce, so no code change. (I didn't test 0.79.1.) | — |
| `!`-bash is broken in `--daytona` mode. | I ran real interactive pi (PTY) and typed `!echo hi && uname -s`. I got `fork/exec /usr/bin/zsh: no such file (exit -1)` — command didn't run. | I ran the same and got `hi` + `Linux` — runs in the sandbox. ✅ verified | b3fb225 |
| All three included test scripts (`smoke.mjs`, `bash-bg.mjs`, `recovery.mjs`) are broken | I ran `cd libs/pi-plugin && npm run smoke`. I got `ERR_PACKAGE_PATH_NOT_EXPORTED`. | I ran it again and got `Smoke test passed`. ✅ verified | 543b414 |
| In-memory sessions leak GitHub branches. | I'd run `pi --daytona --no-session` (quit empty) and check `gh api .../git/refs/heads`; before, a stale `pi/<id>` remained. | Empty branch is deleted on exit. ⚠️ I didn't run this (no `gh`) | 08e3187 |
| Move `@earendil-works/pi-coding-agent` + `typebox` to `peerDependencies` | I ran `grep -A3 peerDependencies package.json`. I got nothing — they were only in `devDependencies` (not a runtime break; pi injects them). | I ran it again and got `peerDependencies: "*"` for both. No runtime change. ✅ inspected | 11036ec |
| `grep-tool.ts:48` fails strict typecheck. | I ran `cd libs/pi-plugin && npm run typecheck`. I got a strict-null error at `grep-tool.ts:48`. | I ran it again and got a clean typecheck. ✅ verified | 05890b2 |
| `session_shutdown` loses commits for in-memory sessions | I'd run `pi --daytona --no-session`, `!git commit` after the last `agent_end`, then quit; before, the commit was gone. | Pending commits are pushed before exit. ⚠️ I didn't run this (no `gh`) | 08e3187 |
| `autoStopInterval: 5` seems too aggressive for interactive sessions. | I'd run `pi --daytona` and check the sandbox's auto-stop; before it was `5` min. | It's `15` by default, overridable with `--idle-stop N`. ⚠️ I didn't observe the timeout live | 25331eb |
| Tool registration snippet is out of sync with the source. | I ran `grep sandboxTool` on the pi guide. I got no match — it showed an inline `{...localBash}` form. | The snippet now shows the `sandboxTool` factory. ⚠️ I didn't build the docs | 0d8f32a |
| `GuidesList` for a single guide adds a dead click. | I'd open `/guides/pi`; before, it rendered a one-item `GuidesList` (extra click). | The guide is consolidated into `index.mdx`; the list is gone. ⚠️ I didn't build the docs | 0d8f32a |

**Left out:** find/grep comment tidy (`bb49c78`, no behavior change) and sync-back for non-github repos (reviewer marked "Future / next release").

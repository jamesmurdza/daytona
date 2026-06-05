# Daytona Sandbox Extension for Pi

_[Pi](https://pi.dev) coding agent extension for integration with [Daytona](https://www.daytona.io) sandboxes. The agent runs locally while all tool calls run inside a remote, ephemeral sandbox._

## Features

- Run Pi's tools (`bash`, `read`, `write`, `edit`, `ls`, `find`, `grep`) inside an isolated Daytona sandbox while the agent's brain (LLM, TUI, sessions) stays on your machine
- Activation is launch-scoped via the `--daytona` flag; the sandbox is torn down on exit
- Generates live preview links when a server starts in the sandbox
- Optionally clone a git repository into the sandbox to start from an existing project

## Quick start

1. Install Pi:

   ```bash
   npm install -g @earendil-works/pi-coding-agent
   ```

   See <https://pi.dev> for other install options.

2. Install the extension:

   ```bash
   pi install npm:@daytona/pi
   ```

   > ⚠️ To update later, run `pi update` — `pi install` won't refresh an existing install.

3. Launch:

   ```bash
   DAYTONA_API_KEY=dtn_... pi --daytona
   ```

   Get a key at <https://app.daytona.io>.

## Usage

### CLI flags

Start from scratch:

```bash
pi --daytona
```

Work on an existing repo:

```bash
pi --daytona --repo github.com/acme/api --branch dev
```

Public preview (browser-openable URLs, no token):

```bash
pi --daytona --repo … --public
```

| Flag                | Description                                            |
| ------------------- | ----------------------------------------------------- |
| `--daytona`         | Run tools inside a Daytona sandbox                     |
| `--repo <url>`      | Git repo to clone into the sandbox (server-side)      |
| `--branch <name>`   | Branch to clone (used with `--repo`)                  |
| `--snapshot <name>` | Choose a Daytona snapshot / base image                |
| `--public`          | Create a public sandbox so preview URLs need no token |

### Environment variables

This extension requires a [Daytona account](https://www.daytona.io/) and [Daytona API key](https://app.daytona.io/dashboard/keys) to create sandboxes.

- `DAYTONA_API_KEY` _(required)_ — or you'll be prompted once per session.
- `DAYTONA_API_URL` — defaults to `https://app.daytona.io/api`.
- `DAYTONA_TARGET` — e.g. `us`.

### Interactive sessions

Once Pi is running with `--daytona`, the cloud badge in the footer is the always-visible signal that work is remote:

```
☁ daytona · 7f3a9b21 · running · /home/daytona
```

Slash commands you can type:

- `/sandbox status` — id, state, working dir, snapshot, visibility
- `/sandbox url <port>` — manual fallback for getting a preview URL

## How it works

The agent's brain (LLM, TUI, sessions) stays on your machine. Pi's tool layer is pluggable, so this extension substitutes Daytona-backed implementations of `bash` / `read` / `write` / `edit` / `ls`, plus dedicated in-sandbox tools for `find` / `grep`. A footer badge is the always-visible signal that work is remote.

### Backgrounding

Daytona's `executeCommand` resolves only when the command's output reaches EOF, so a backgrounded process (`server &`) would normally hold the pipe open and hang the agent. We wrap every bash command in a subshell whose combined output is redirected to a temp file, so backgrounded processes detach cleanly and the call returns as soon as the **foreground** finishes.

> 💡 A command left in the **foreground** (no `&`) that never exits will still block the turn, exactly like in a normal shell — background it or pass a `timeout`.

### Lifecycle

- **Idle pauses** the sandbox (`autoStopInterval: 30` min). Its filesystem is preserved; the next tool call transparently restarts it.
- **Deleted on quit** (`sandbox.delete()`).
- **Crash backstop**: `autoDeleteInterval: 1440` (delete ~24h after stopping) and Daytona's 7-day auto-archive.
- If the sandbox is ever genuinely gone, tool calls fail with a clear message telling you to restart — they are **never** silently run on your host.

### Tools

| Tool                | What it does                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bash` (+ user `!`) | Run a command in the sandbox; backgrounded processes (`&`) don't hang the agent                              |
| `read`              | Read a file from the sandbox                                                                                  |
| `write`             | Write a file to the sandbox                                                                                   |
| `edit`              | Edit a file (download → modify → upload; preserves Pi's exact-match semantics)                                |
| `ls`                | List a sandbox directory                                                                                      |
| `find`              | Find files by glob inside the sandbox (gitignore-aware, supports path globs)                                  |
| `grep`              | Search file contents inside the sandbox                                                                       |
| `preview_url(port)` | Get a public preview URL for a port — the agent calls this itself after starting a server                    |

## Development

This extension is part of the Daytona monorepo.

### Setup

First, clone the Daytona monorepo:

```bash
git clone https://github.com/daytonaio/daytona
cd daytona
```

Install dependencies:

```bash
yarn install
```

The extension source lives in `libs/pi-plugin`. Because Pi loads extensions as TypeScript via [jiti](https://github.com/unjs/jiti), there is **no build step** — Pi runs the source directly.

### Type-check

```bash
npx nx run pi-plugin:type-check
```

### Testing locally

Point Pi at the source with `--extension` (`-e`) to load it for a single run without installing:

```bash
DAYTONA_API_KEY=dtn_... pi -e ./libs/pi-plugin/index.ts --daytona
```

Offline smoke + type-check (no API key or network needed):

```bash
cd libs/pi-plugin
npm install
npm run check
```

End-to-end against real Daytona (needs `DAYTONA_API_KEY`):

```bash
cd libs/pi-plugin
npm run test:live
```

### Publishing

```bash
npx nx run pi-plugin:publish
```

This publishes the TypeScript source to npm with public access using the version number from `package.json`.

## Project structure

```
libs/pi-plugin/
├── index.ts            # Extension entry point: flags, tool registration, lifecycle
├── src/
│   ├── auth.ts         # Daytona API key resolution
│   ├── sandbox.ts      # Sandbox resilience layer (auto-restart, exec)
│   ├── ops.ts          # Daytona-backed bash/read/write/edit/ls operations
│   ├── find-tool.ts    # In-sandbox find (ripgrep/find)
│   ├── grep-tool.ts    # In-sandbox grep (ripgrep/grep)
│   └── util.ts         # Small shared helpers
├── scripts/            # Offline smoke + live integration tests
├── package.json
├── project.json        # Nx project configuration
├── tsconfig.json
└── README.md
```

## License

Apache-2.0

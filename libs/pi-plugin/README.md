# Daytona Sandbox Extension for Pi

This is a Pi extension that runs every Pi tool call inside a Daytona sandbox. The agent runs on your machine, while `bash`, file I/O, and search execute in a remote, ephemeral sandbox that is created when you launch Pi with `--daytona` and torn down when you exit.

## Features

- Securely isolate Pi's tool execution in a sandbox environment
- Keeps the agent running on your machine while tools run remotely
- Generates live preview links when a server starts in the sandbox
- Optionally clones a git repository into the sandbox to start from an existing project

## Usage

### Installation

First, install Pi:

```bash
npm install -g @earendil-works/pi-coding-agent
```

See [pi.dev](https://pi.dev) for other install options.

Then add the Daytona extension to Pi:

```bash
pi install npm:@daytona/pi
```

> [!NOTE]
> To update the extension later, run `pi update` — `pi install` won't refresh an existing install.

### Environment Configuration

This extension requires a [Daytona account](https://www.daytona.io/) and [Daytona API key](https://app.daytona.io/dashboard/keys) to create sandboxes.

Set your Daytona API key as an environment variable:

```bash
export DAYTONA_API_KEY="your-api-key"
```

Or create a `.env` file in your project root:

```env
DAYTONA_API_KEY=your-api-key
```

The extension also reads these optional variables:

- `DAYTONA_API_URL` — defaults to `https://app.daytona.io/api`.
- `DAYTONA_TARGET` — e.g. `us`.

If no key is set and a UI is available, Pi prompts you for one once per session.

### Running Pi

Start Pi with the `--daytona` flag:

```bash
pi --daytona
```

To check that the extension is working, ask the agent to run `pwd` in the chat. You should see a sandbox path like `/home/daytona`, and a cloud badge in the footer indicating that work is remote:

```
☁ daytona · 7f3a9b21 · running · /home/daytona
```

#### CLI flags

Work on an existing repo:

```bash
pi --daytona --repo github.com/acme/api --branch dev
```

Create a public sandbox so preview URLs need no token:

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

#### Slash commands

While Pi is running with `--daytona`, you can manage the active sandbox:

- `/sandbox status` — id, state, working directory, branch, snapshot, and visibility
- `/sandbox url <port>` — get a preview URL for a port served inside the sandbox
- `/sandbox view` — print the GitHub compare/PR URL for this session's branch
- `/sandbox merge` — merge this session's branch into its base on GitHub, then delete it

## How It Works

The agent runs on your machine. Pi's tool layer is pluggable, so this extension substitutes Daytona-backed implementations of `bash`, `read`, `write`, `edit`, and `ls`, plus dedicated in-sandbox tools for `find` and `grep`. A footer badge is the always-visible signal that work is remote.

### GitHub branch sync

When you launch with `--repo` pointing at a **github.com** repo and you're logged in via the GitHub CLI (`gh auth login`), each session gets its own branch and the agent's work is pushed there automatically:

- On start, the extension creates `pi/<sessionId>` on GitHub (off your base branch, or `--branch`) and clones it into the sandbox.
- After every agent turn (and once more on exit), it commits and pushes the changes to that branch via the Daytona git API. Unchanged trees are skipped.
- `/sandbox view` gives you the compare/PR link; `/sandbox merge` merges the branch into its base and deletes it.
- **Forks** start a fresh sandbox and branch off the parent session's branch.

Because the work lives durably on GitHub, the sandbox stays fully ephemeral — it's deleted on exit.

All network git operations (clone/commit/push) run **inside the sandbox** through Daytona; the host only uses `gh` to mint a token and call the GitHub API.

> [!NOTE]
> Without `--repo` (or without `gh` auth, or for a non-GitHub remote), push is disabled. The sandbox still gets a local git repo and commits the agent's work for consistency — it's just never pushed.

> [!CAUTION]
> Pushing uses your `gh` token, which is passed to the sandbox as the push credential and is therefore briefly readable by the agent running there. Use a `gh` login scoped no wider than you're comfortable exposing to the repo's working environment.

### Backgrounding

Daytona's `executeCommand` resolves only when the command's output reaches EOF, so a backgrounded process (`server &`) would normally hold the pipe open and hang the agent. The extension wraps every bash command in a subshell whose combined output is redirected to a temp file, so backgrounded processes detach cleanly and the call returns as soon as the **foreground** finishes.

> [!TIP]
> A command left in the **foreground** (no `&`) that never exits will still block the turn, exactly like in a normal shell — background it or pass a `timeout`.

### Lifecycle

- **Idle pauses** the sandbox (`autoStopInterval: 30` min). Its filesystem is preserved; the next tool call transparently restarts it.
- **Deleted on quit** (`sandbox.delete()`).
- **Crash backstop**: `autoDeleteInterval: 1440` (delete ~24h after stopping) and Daytona's 7-day auto-archive.

> [!CAUTION]
> If the sandbox is ever genuinely gone, tool calls fail with a clear message telling you to restart — they are **never** silently run on your host.

### Tools

| Tool                | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `bash` (+ user `!`) | Run a command in the sandbox; backgrounded processes (`&`) don't hang the agent |
| `read`              | Read a file from the sandbox                                                    |
| `write`             | Write a file to the sandbox                                                     |
| `edit`              | Edit a file (download → modify → upload; preserves Pi's exact-match semantics)  |
| `ls`                | List a sandbox directory                                                        |
| `find`              | Find files by glob inside the sandbox (gitignore-aware, supports path globs)    |
| `grep`              | Search file contents inside the sandbox                                         |
| `preview_url(port)` | Get a public preview URL for a port — the agent calls this after starting a server |

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

### Development and Testing

To modify the extension, edit the source files in `libs/pi-plugin`.

> [!NOTE]
> Because Pi loads extensions as TypeScript via [jiti](https://github.com/unjs/jiti), there is no build step — Pi runs the source directly.

#### Run the extension from source

1. **Make sure no other copy is installed.** If you previously ran `pi install …` for this extension, both copies load and collide (`Tool "bash" conflicts with …`). Check and remove it:

   ```bash
   pi list                                    # shows installed packages
   pi uninstall npm:@daytona/pi               # if installed from npm
   pi uninstall git:github.com/daytonaio/daytona   # if installed from git
   ```

   > [!IMPORTANT]
   > Load the extension **either** with `-e` (from source, for development) **or** via `pi install` (as a user) — never both at once, or every tool and flag conflicts.

2. **Run Pi against the source** with `--extension` (`-e`):

   ```bash
   DAYTONA_API_KEY=dtn_... pi -e ./libs/pi-plugin/index.ts --daytona
   ```

#### Type-check, smoke, and live tests

```bash
npx nx run pi-plugin:type-check   # type-check (from the repo root)

cd libs/pi-plugin
npm run check                     # offline: type-check + load smoke (no API key/network)
npm run test:live                 # end-to-end against real Daytona (needs DAYTONA_API_KEY)
```

### Publishing

Publish the TypeScript source to npm:

```bash
npx nx run pi-plugin:publish
```

This will publish to npm with public access and use the version number from `package.json`.

## Project Structure

```
libs/pi-plugin/
├── index.ts            # Extension entry point: flags, tool registration, lifecycle
├── src/                # Daytona-backed tool implementations
│   ├── auth.ts         # Daytona API key resolution
│   ├── sandbox.ts      # Sandbox resilience layer (auto-restart, exec)
│   ├── ops.ts          # Daytona-backed bash/read/write/edit/ls operations
│   ├── find-tool.ts    # In-sandbox find (ripgrep/find)
│   ├── grep-tool.ts    # In-sandbox grep (ripgrep/grep)
│   ├── github.ts       # Host gh control-plane (token + GitHub API)
│   ├── sync.ts         # Sandbox-side commit + push (Daytona git API)
│   └── util.ts         # Small shared helpers
├── scripts/            # Offline smoke + live integration tests
├── package.json        # Package metadata (includes the "pi" extensions field)
├── project.json        # Nx build configuration
├── tsconfig.json       # TypeScript config
└── README.md
```

## License

Apache-2.0

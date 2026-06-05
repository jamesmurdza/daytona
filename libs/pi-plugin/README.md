# Daytona Sandbox Extension for Pi

This is a Pi extension that runs every Pi tool call inside a Daytona sandbox. The agent's brain (LLM, TUI, sessions) stays on your machine, while `bash`, file I/O, and search execute in a remote, ephemeral sandbox that is created when you launch Pi with `--daytona` and torn down when you exit.

## Features

- Securely isolate Pi's tool execution in a sandbox environment
- Keeps the agent's brain (LLM, TUI, sessions) on your machine while tools run remotely
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

While Pi is running with `--daytona`, you can inspect the active sandbox:

- `/sandbox status` — id, state, working directory, snapshot, and visibility
- `/sandbox url <port>` — get a preview URL for a port served inside the sandbox

## How It Works

The agent's brain (LLM, TUI, sessions) stays on your machine. Pi's tool layer is pluggable, so this extension substitutes Daytona-backed implementations of `bash`, `read`, `write`, `edit`, and `ls`, plus dedicated in-sandbox tools for `find` and `grep`. A footer badge is the always-visible signal that work is remote.

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

To test the extension, point Pi at the source with `--extension` (`-e`) to load it for a single run without installing:

```bash
DAYTONA_API_KEY=dtn_... pi -e ./libs/pi-plugin/index.ts --daytona
```

Type-check the extension:

```bash
npx nx run pi-plugin:type-check
```

Run the offline smoke test (no API key or network needed):

```bash
cd libs/pi-plugin
npm install
npm run check
```

Run the end-to-end tests against real Daytona (needs `DAYTONA_API_KEY`):

```bash
cd libs/pi-plugin
npm run test:live
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
│   └── util.ts         # Small shared helpers
├── scripts/            # Offline smoke + live integration tests
├── package.json        # Package metadata (includes the "pi" extensions field)
├── project.json        # Nx build configuration
├── tsconfig.json       # TypeScript config
└── README.md
```

## License

Apache-2.0

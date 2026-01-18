# @jamesmurdza/opencode-daytona

An OpenCode plugin that automatically runs all your OpenCode sessions in Daytona sandboxes. This provides isolated, reproducible development environments for your AI coding sessions.

## Usage

### Installation

Add the plugin to your project's OpenCode configuration file (`.opencode/config.json` or `opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@jamesmurdza/opencode-daytona"]
}
```

### Environment Configuration

Set your Daytona API key and URL as environment variables:

```bash
export DAYTONA_API_KEY="your-api-key"
```

Or create a `.env` file in your project root:

```env
DAYTONA_API_KEY=your-api-key
```

## Features

The plugin automatically:

- Creates a Daytona sandbox for each OpenCode session
- Provides custom tools for file operations, command execution, and search within sandboxes
- Routes all code execution through the isolated sandbox environment
- Manages sandbox lifecycle (create on session start, destroy on session end)
- Ensures reproducible environments with proper dependency isolation

### Storage

The plugin stores sandbox session data using a project-based storage structure that aligns with OpenCode's storage patterns:

- **Location**: Uses the XDG Base Directory specification via the `xdg-basedir` package ([same as OpenCode core](https://github.com/anomalyco/opencode/blob/052f887a9a7aaf79d9f1a560f9b686d59faa8348/packages/opencode/src/global/index.ts#L4))
  - **macOS/Linux**: `~/.local/share/opencode/storage/daytona/`
  - **Windows**: `%LOCALAPPDATA%\opencode\storage\daytona\` or `%APPDATA%\opencode\storage\daytona\`

- **Structure**: Each project gets its own JSON file named `{projectId}.json` containing:
  - Session-to-sandbox mappings
  - Sandbox metadata (ID, created timestamp, last accessed timestamp)
  - Automatic cleanup tracking

This approach ensures:
- Session persistence across OpenCode restarts
- Proper sandbox reuse within the same project
- Clean separation between different projects
- Cross-platform compatibility

## Requirements

- Node.js 16+ or Bun
- OpenCode v1.0.0 or later
- Active Daytona account with API access
- Daytona API key (get one from your Daytona dashboard)

## Development

This plugin is part of the Daytona monorepo. For development:

### Development Workflow

1. **Make changes** to the plugin source in `libs/opencode-plugin/.opencode/plugin/`

2. **Test locally** by running OpenCode in the plugin directory:
   ```bash
   cd libs/opencode-plugin
   opencode
   ```
   
   OpenCode will automatically detect and load the TypeScript plugin from the local `.opencode/plugin/` directory (no build step needed for local testing!)

3. **Build for publishing:**
   ```bash
   npx nx build opencode-plugin
   ```

### Publishing

```bash
# Ensure you're logged in to npm
npm login

# Build and publish (from monorepo root)
npx nx publish opencode-plugin
```

This will:
- Build the plugin
- Publish to npm with public access
- Use the version from `package.json`

## Project Structure

```
libs/opencode-plugin/
├── .opencode/
│   └── plugin/
│       └── index.ts          # Plugin source code
├── dist/                     # Build output (gitignored)
│   ├── .opencode/
│   │   └── plugin/
│   │       ├── index.js
│   │       ├── index.d.ts
│   │       └── *.map
│   └── package.json
├── package.json              # Package metadata
├── project.json              # Nx build configuration
├── tsconfig.json             # TypeScript config
└── README.md
```

## License

Apache-2.0

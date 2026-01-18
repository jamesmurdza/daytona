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

## Requirements

- Node.js 16+ or Bun
- OpenCode v1.0.0 or later
- Active Daytona account with API access
- Daytona API key (get one from your Daytona dashboard)

## Development

This plugin is part of the Daytona monorepo. For development:

### Building from Source

```bash
npx nx build opencode-plugin
```

The build outputs to `libs/opencode-plugin/dist/` and includes:
- Compiled JavaScript (`.opencode/plugin/index.js`)
- TypeScript declarations (`.opencode/plugin/index.d.ts`)
- Source maps

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

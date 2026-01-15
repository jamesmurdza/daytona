# opencode-daytona

An OpenCode plugin that automatically runs all your OpenCode sessions in Daytona sandboxes. This provides isolated, reproducible development environments for your AI coding sessions.

## Installation

```bash
npm install -g opencode-daytona
# or
bun add -g opencode-daytona
```

## Usage

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-daytona"]
}
```

That's it! The plugin will automatically:

- Create a Daytona sandbox for each OpenCode session
- Route all code execution through the sandbox
- Provide isolated environments with proper dependencies
- Clean up sandboxes when sessions end

## Requirements

- OpenCode v0.15.0 or later
- Active Daytona account

## Development

```bash
# Build the package
npm run build

# Watch mode for development
npm run dev

# Clean build artifacts
npm run clean
```

## License

Apache-2.0

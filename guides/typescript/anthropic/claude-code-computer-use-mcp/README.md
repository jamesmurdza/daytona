# Claude Code + Computer Use MCP Server

## Overview

This example demonstrates two approaches to using Claude Code with computer use capabilities in Daytona sandboxes:

1. **Browser Automation (Playwright MCP)**: Uses the Playwright MCP server to automate web browsers
2. **Desktop Automation (Daytona Computer Use API)**: Uses Daytona's built-in Computer Use API for full desktop control

Both approaches leverage the power of Claude Code for intelligent automation while running safely inside Daytona sandboxes.

## Approaches

### Approach 1: Browser Automation with Playwright MCP

The Playwright MCP server provides structured browser automation without requiring vision models. It uses Playwright's accessibility tree for reliable element interaction.

**Best for:**
- Web scraping and data extraction
- Form filling and submission
- Web application testing
- Browser-based workflows

**Features:**
- Navigate to URLs
- Click elements and fill forms
- Take screenshots
- Execute Playwright scripts

### Approach 2: Desktop Automation with Daytona Computer Use API

Daytona's Computer Use API provides full desktop control including mouse, keyboard, and screenshot capabilities.

**Best for:**
- GUI application automation
- Desktop application testing
- Complex multi-application workflows
- Visual verification tasks

**Features:**
- Mouse operations (move, click, drag, scroll)
- Keyboard operations (type, press, hotkeys)
- Screenshot capture (full screen or regions)
- Window management
- Display information

## Prerequisites

- **Node.js:** Version 18 or higher
- **Daytona Account:** Get your API key from [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **Anthropic API Key:** Get from [Anthropic Console](https://console.anthropic.com/settings/keys)

## Environment Variables

Create a `.env` file with:

```bash
# Required
DAYTONA_API_KEY=your_daytona_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Separate key for sandbox agents
SANDBOX_ANTHROPIC_API_KEY=your_sandbox_anthropic_api_key_here
```

## Getting Started

### Installation

```bash
npm install
```

### Run Browser Automation (Approach 1)

```bash
npm run start:browser
```

**Example prompts:**
- "Go to https://example.com and take a screenshot"
- "Navigate to https://news.ycombinator.com and get the page title"
- "Open https://google.com and tell me what you see"

### Run Desktop Automation (Approach 2)

```bash
npm run start:desktop
```

**Example prompts:**
- "Take a screenshot of the desktop"
- "Move the mouse to coordinates 500, 300"
- "Type Hello World and press Enter"
- "Press Ctrl+C to copy"
- "Get information about the display"
- "List all open windows"

## How It Works

### Browser Automation Flow

1. Creates a Daytona sandbox with Playwright and Playwright MCP installed
2. Initializes a code interpreter context for Python execution
3. User prompts are processed by Claude to determine browser actions
4. Playwright commands are executed in the sandbox
5. Results are streamed back to the user

### Desktop Automation Flow

1. Creates a Daytona sandbox with desktop environment support
2. Starts the desktop environment using Computer Use API
3. User prompts are processed by Claude to determine desktop actions
4. Mouse/keyboard commands are executed via Computer Use API
5. Screenshots and status are returned to the user

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
│                     (Interactive CLI)                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Agent (Local)                         │
│              - Processes user requests                          │
│              - Decides automation actions                       │
│              - Orchestrates sandbox operations                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Daytona Sandbox                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Approach 1: Playwright MCP                             │    │
│  │  - @playwright/mcp server                               │    │
│  │  - Chromium browser                                     │    │
│  │  - Python code interpreter                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          OR                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Approach 2: Daytona Computer Use API                   │    │
│  │  - Desktop environment (VNC)                            │    │
│  │  - Mouse & Keyboard control                             │    │
│  │  - Screenshot capabilities                              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Example Output

### Browser Automation

```
Creating sandbox with Playwright MCP support...
Sandbox created: sb-abc123
Initializing browser automation environment...
Python version: 3.11.x
Playwright is installed and ready!

============================================================
Browser Automation Agent Ready
============================================================
This agent can automate browser tasks using Playwright MCP.
Press Ctrl+C at any time to exit.

User: Go to https://example.com and take a screenshot

[Browser Agent] Processing your request...

[Browser Agent]: I'll navigate to example.com and capture a screenshot.
<browser_task>Navigate to https://example.com and take a screenshot</browser_task>

[Executing Browser Task]...
Navigated to: https://example.com
Page title: Example Domain
Screenshot saved to /tmp/screenshot.png
Browser task completed successfully

[Browser Agent]: I've navigated to example.com and taken a screenshot!
TASK_COMPLETE
```

### Desktop Automation

```
Creating sandbox with desktop environment support...
Sandbox created: sb-xyz789
Starting desktop environment...
Desktop environment started!
Desktop status: {"running": true}
Display: {"width": 1024, "height": 768}

============================================================
Desktop Automation Agent Ready
============================================================
This agent can control the desktop using Daytona Computer Use API.
Press Ctrl+C at any time to exit.

User: Take a screenshot and tell me what you see

[Desktop Agent] Processing your request...

[Desktop Agent]: I'll take a screenshot of the current desktop.
<screenshot>Capture desktop</screenshot>

[Screenshot] Taking screenshot...
[Screenshot] Screenshot taken successfully
[Screenshot] Saved to: screenshot_1234567890.png

[Desktop Agent]: I've captured a screenshot of the desktop!
TASK_COMPLETE
```

## Comparison of Approaches

| Feature | Playwright MCP | Daytona Computer Use |
|---------|---------------|---------------------|
| Browser automation | Excellent | Good (via screenshots) |
| Desktop apps | Limited | Full support |
| Vision model needed | No | Optional |
| Speed | Fast | Moderate |
| Reliability | High | High |
| Setup complexity | Moderate | Simple |

## Troubleshooting

### Playwright MCP Issues

- **Chromium not found**: Ensure `playwright install chromium` completed successfully
- **Timeout errors**: Increase timeout in sandbox creation

### Desktop Automation Issues

- **Desktop not starting**: Check sandbox has desktop environment support
- **Screenshot fails**: Ensure desktop is fully initialized (wait a few seconds)
- **Mouse/keyboard not working**: Verify Computer Use API is started

## Security Notes

> **Warning:** Your Anthropic API key is passed into the sandbox environment and may be accessible to any code executed within it.

- Sandboxes are ephemeral and deleted after use
- Use separate API keys for sandbox operations when possible
- Review automation scripts before execution

## References

- [Playwright MCP Documentation](https://playwright.dev/docs/getting-started-mcp)
- [Daytona Computer Use API](https://www.daytona.io/docs/en/computer-use)
- [Claude Code Documentation](https://code.claude.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

Apache-2.0 - See the main project LICENSE file for details.

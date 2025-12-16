# Claude Coding Agent

## Overview

This example runs an agent with the capabilities of Claude Code inside a Daytona sandbox. The script provides a CLI where you can interact with the agent, build apps, and preview the apps using [Daytona preview links](https://www.daytona.io/docs/en/preview-and-authentication/#fetching-a-preview-link).

Note: In this example your Anthropic API key is passed into the sandbox, which means it may be accessible by any code run inside the sandbox.

## Features

- **Secure sandbox execution:** The agent operates within a controlled environment, along with code or commands run by the agent.
- **Claude Agent integration:** Includes the full abilities of the Claude Agent SDK, including reading and editing code files, and running shell commands.
- **Preview deployed apps:** Use Daytona preview links to view and interact with your deployed applications.

## Prerequisites

- **Node.js:** Version 18 or higher is required

## Environment Variables

To run this example, you need to set the following environment variables:

- `DAYTONA_API_KEY`: Required for access to Daytona sandboxes. Get it from [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- `SANDBOX_ANTHROPIC_API_KEY`: Required to run Claude Code. Get it from [Claude Developer Platform](https://console.anthropic.com/settings/keys)

Create a `.env` file in the project directory with these variables.

## Getting Started

### Setup and Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the example:

   ```bash
   npm run start
   ```

## How It Works

When you run the example, the agent follows this workflow:

1. A new Daytona sandbox is created
2. The coding agent is installed and launched inside the sandbox
3. User queries are passed to the agent, and the result is displayed to the user
4. When the user exits, the sandbox is deleted

## Example Output

```
Creating sandbox...
Installing @anthropic-ai/claude-code...
Running Claude command...
Output: Created hello world index.html with the following content:

<!DOCTYPE html>
<html>
<head>
    <title>Hello World</title>
</head>
<body>
    <h1>Hello, World!</h1>
    <p>Welcome to my first webpage.</p>
</body>
</html>

Cleaning up...
```

## License

See the main project LICENSE file for details.

## References

- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK Reference—Python](https://platform.claude.com/docs/en/agent-sdk/python)
- [Daytona Documentation](https://www.daytona.io/docs)

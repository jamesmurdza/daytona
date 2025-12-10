# Claude Code Sandbox (TypeScript)

## Overview

This example demonstrates how to create a TypeScript sandbox that runs Claude code using `@anthropic-ai/claude-code`. The sandbox allows you to execute Claude code in an isolated environment and see the results.

## Features

- **Secure sandbox execution:** All code runs in an isolated environment
- **Easy integration:** Simple API for executing Claude code
- **TypeScript support:** Full TypeScript type definitions

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Daytona API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root and add your Daytona API key:
   ```
   DAYTONA_API_KEY=your_daytona_api_key_here
   ```

## Usage

Run the example:

```bash
npm start
```

This will:
1. Create a new sandbox
2. Install `@anthropic-ai/claude-code`
3. Execute a simple Claude command to generate an `index.html` file
4. Print the output
5. Clean up the sandbox

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

MIT

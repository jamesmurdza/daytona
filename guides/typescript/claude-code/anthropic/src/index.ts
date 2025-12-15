import { Daytona } from '@daytonaio/sdk'
import * as dotenv from 'dotenv'
import * as readline from 'readline'

// Load environment variables from .env file
dotenv.config()

// Constants for ANSI escape codes
const ESC = '\u001b';
const BOLD = ESC + '[1m';
const ITALIC = ESC + '[3m';
const DIM = ESC + '[2m';
const RESET = ESC + '[0m';

// Function to render markdown to ANSI
function renderMarkdown(text: string): string {
  // Apply bold, italic, and dim styles
  return text
    .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`)    // **bold**
    .replace(/(?<!\*)\*([^\*\n]+?)\*(?!\*)/g, `${ITALIC}$1${RESET}`) // *italic*
    .replace(/`([^`]+?)`/g, `${DIM}$1${RESET}`);        // `code`
}

async function processPrompt(prompt: string, sandbox: any, ctx: any): Promise<void> {
  console.log('Thinking...')

  const result = await sandbox.codeInterpreter.runCode(
    `coding_agent.run_query_sync(os.environ.get('PROMPT', ''))`,
    {
      context: ctx,
      envs: { PROMPT: prompt },
      onStdout: (msg: any) => process.stdout.write(renderMarkdown(msg.output)),
      onStderr: (msg: any) => process.stdout.write(renderMarkdown(msg.output)),
    },
  )

  if (result.error) console.error('Execution error:', result.error.value)
}

async function main() {
  // Get the Daytona API key from environment variables
  const apiKey = process.env.DAYTONA_API_KEY

  if (!apiKey) {
    console.error('Error: DAYTONA_API_KEY environment variable is not set')
    console.error('Please create a .env file with your Daytona API key')
    process.exit(1)
  }

  // Check for Anthropic API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set')
    console.error('Please create a .env file with your Anthropic API key')
    process.exit(1)
  }

  // Initialize the Daytona client
  const daytona = new Daytona({ apiKey })

  try {
    // Create a new Daytona sandbox
    // The sandbox language is irrelevant since we will use the code interpreter SDK
    console.log('Creating sandbox...')
    const sandbox = await daytona.create({
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    })

    // Install the Claude Agent SDK
    console.log('Installing Agent SDK...')
    await sandbox.process.executeCommand('python3 -m pip install claude-agent-sdk')

    // Initialize the code interpreter and upload the coding agent script
    console.log('Initializing Agent SDK...')
    const ctx = await sandbox.codeInterpreter.createContext()
    await sandbox.fs.uploadFile('src/coding_agent.py', '/tmp/coding_agent.py')
    const previewLink = await sandbox.getPreviewLink(80)
    await sandbox.codeInterpreter.runCode(
      `import os, coding_agent;`,
      {
        context: ctx,
        envs: { PREVIEW_URL: previewLink.url }
      },
    )

    // Set up readline interface for user input
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.on('SIGINT', async () => {
      console.log('\nExiting...')
      try {
        await sandbox.delete()
      } catch (e) {
        console.error('Error deleting sandbox:', e)
      } finally {
        process.exit(0)
      }
    })

    // Start the interactive prompt loop
    console.log('Press Ctrl+C at any time to exit.')
    while (true) {
      const prompt = await new Promise<string>((resolve) => rl.question('User: ', resolve))
      if (!prompt.trim()) continue
      await processPrompt(prompt, sandbox, ctx)
    }
  } catch (error) {
    console.error('An error occurred:', error)
    process.exit(1)
  }
}

main().catch(console.error)